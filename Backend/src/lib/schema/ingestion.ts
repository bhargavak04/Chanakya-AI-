/**
 * Schema ingestion - fetch from user DB, store in internal SQLite
 * Optionally embed schema + sample rows and upsert to Qdrant for vector retrieval
 */
import pg from "pg";
import mysql from "mysql2/promise";
import { getConnectionConfig, getPool, isPostgres } from "../db/connections.js";
import { getInternalDb, generateId } from "../db/internal.js";
import {
  deleteSchemaChunksForDb,
  upsertSchemaChunks,
  ensureCollection,
  isVectorEnabled,
  type SchemaChunk,
} from "../vector/index.js";

const PG_SCHEMA_QUERY = `
  SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable = 'YES' as is_nullable,
    EXISTS (SELECT 1 FROM information_schema.table_constraints tc 
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name 
            AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = c.column_name) as is_primary_key,
    EXISTS (SELECT 1 FROM information_schema.table_constraints tc 
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name 
            AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = c.column_name) as is_foreign_key
  FROM information_schema.tables t
  JOIN information_schema.columns c ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name, c.ordinal_position
`;

const MYSQL_SCHEMA_QUERY = `
  SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable = 'YES' as is_nullable,
    c.column_key = 'PRI' as is_primary_key,
    c.column_key = 'MUL' as is_foreign_key
  FROM information_schema.tables t
  JOIN information_schema.columns c ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE t.table_schema = DATABASE()
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name, c.ordinal_position
`;

const SAMPLE_ROW_LIMIT = 2;
const TRUNCATE_VALUE_LEN = 80;

function quoteTableName(tableName: string, postgres: boolean): string {
  if (postgres) return `"${tableName.replace(/"/g, '""')}"`;
  return `\`${tableName.replace(/`/g, "``")}\``;
}

function truncate(val: unknown): string {
  if (val === null || val === undefined) return "null";
  const s = String(val);
  return s.length > TRUNCATE_VALUE_LEN ? s.slice(0, TRUNCATE_VALUE_LEN) + "…" : s;
}

async function fetchSampleRows(
  dbId: string,
  tableName: string,
  postgres: boolean
): Promise<Record<string, unknown>[]> {
  const quoted = quoteTableName(tableName, postgres);
  const sql = `SELECT * FROM ${quoted} LIMIT ${SAMPLE_ROW_LIMIT}`;

  try {
    if (postgres) {
      const pool = getPool(dbId) as pg.Pool;
      const result = await pool.query(sql);
      const rows = (result.rows ?? []) as Record<string, unknown>[];
      return rows;
    } else {
      const pool = getPool(dbId) as mysql.Pool;
      const [rows] = await pool.query(sql);
      const arr = Array.isArray(rows) ? rows : [rows];
      return arr as Record<string, unknown>[];
    }
  } catch {
    return [];
  }
}

export async function ingestSchema(dbId: string): Promise<{ tables: number; columns: number }> {
  const config = getConnectionConfig(dbId);
  if (!config) throw new Error(`Database ${dbId} not found`);

  const internal = getInternalDb();

  // Delete existing schema for this db
  internal.prepare("DELETE FROM schema_columns WHERE table_id IN (SELECT id FROM schema_tables WHERE db_id = ?)").run(dbId);
  internal.prepare("DELETE FROM schema_tables WHERE db_id = ?").run(dbId);

  let rawRows: { table_name: string; column_name: string; data_type: string; is_nullable: boolean; is_primary_key: boolean; is_foreign_key: boolean }[];

  if (isPostgres(dbId)) {
    const pool = getPool(dbId) as pg.Pool;
    const result = await pool.query(PG_SCHEMA_QUERY);
    rawRows = result.rows as typeof rawRows;
  } else {
    const pool = getPool(dbId) as mysql.Pool;
    const [rows] = await pool.query(MYSQL_SCHEMA_QUERY);
    rawRows = (Array.isArray(rows) ? rows : [rows]) as typeof rawRows;
  }

  // Group by table
  const tableMap = new Map<string, typeof rawRows>();
  for (const row of rawRows) {
    const key = row.table_name;
    if (!tableMap.has(key)) tableMap.set(key, []);
    tableMap.get(key)!.push(row);
  }

  const insertTable = internal.prepare(`
    INSERT INTO schema_tables (id, db_id, table_name, description, row_count_estimate)
    VALUES (?, ?, ?, NULL, NULL)
  `);
  const insertColumn = internal.prepare(`
    INSERT INTO schema_columns (id, table_id, column_name, data_type, is_nullable, is_primary_key, is_foreign_key, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  let tableCount = 0;
  let columnCount = 0;
  const tableIdByTableName = new Map<string, string>();

  const transaction = internal.transaction(() => {
    for (const [tableName, cols] of tableMap) {
      const tableId = generateId();
      tableIdByTableName.set(tableName, tableId);
      insertTable.run(tableId, dbId, tableName);
      tableCount++;
      for (const col of cols) {
        insertColumn.run(
          generateId(),
          tableId,
          col.column_name,
          col.data_type,
          col.is_nullable ? 1 : 0,
          col.is_primary_key ? 1 : 0,
          col.is_foreign_key ? 1 : 0
        );
        columnCount++;
      }
    }
  });

  transaction();

  if (isVectorEnabled()) {
    const postgres = isPostgres(dbId);
    const chunks: SchemaChunk[] = [];

    for (const [tableName, cols] of tableMap) {
      const tableId = tableIdByTableName.get(tableName)!;
      const colLines = cols.map(
        (c) =>
          `  - ${c.column_name} (${c.data_type})${c.is_primary_key ? " PK" : ""}${c.is_foreign_key ? " FK" : ""}`
      );
      let chunkText = `Table: ${tableName}\nColumns:\n${colLines.join("\n")}`;

      const sampleRows = await fetchSampleRows(dbId, tableName, postgres);
      if (sampleRows.length > 0) {
        const sampleStr = sampleRows
          .map((r) => Object.entries(r).map(([k, v]) => `${k}: ${truncate(v)}`).join(", "))
          .join(" | ");
        chunkText += `\nSample: ${sampleStr}`;
      }

      chunks.push({ tableId, tableName, text: chunkText });
    }

    await ensureCollection();
    await deleteSchemaChunksForDb(dbId);
    await upsertSchemaChunks(dbId, chunks);
  }

  return { tables: tableCount, columns: columnCount };
}
