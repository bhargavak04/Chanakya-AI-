/**
 * Schema ingestion - fetch from user DB, store in internal SQLite
 * Generates LLM descriptions for tables; optionally embeds schema + sample rows to Qdrant
 */
import pg from "pg";
import mysql from "mysql2/promise";
import { SAMPLE_ROW_LIMIT, TRUNCATE_VALUE_LEN } from "../../core/constants.js";
import {
  PROMPT_SCHEMA_DESCRIPTIONS,
  PROMPT_SCHEMA_SYSTEM,
  PROMPT_COLUMN_SEMANTICS,
  PROMPT_COLUMN_SEMANTICS_SYSTEM,
} from "../../core/prompts.js";
import { ERR_DB_NOT_FOUND } from "../../core/strings.js";
import { getConnectionConfig, getPool, isPostgres } from "../db/connections.js";
import { getInternalDb, generateId } from "../db/internal.js";
import {
  deleteSchemaChunksForDb,
  upsertSchemaChunks,
  ensureCollection,
  isVectorEnabled,
  type SchemaChunk,
} from "../vector/index.js";
import { getLLMProvider } from "../llm/index.js";

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

const PG_FK_QUERY = `
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
`;

const MYSQL_FK_QUERY = `
  SELECT
    kcu.table_name,
    kcu.column_name,
    kcu.referenced_table_name AS foreign_table,
    kcu.referenced_column_name AS foreign_column
  FROM information_schema.key_column_usage kcu
  WHERE kcu.table_schema = DATABASE()
    AND kcu.referenced_table_name IS NOT NULL
`;

type RawCol = { table_name: string; column_name: string; data_type: string; is_nullable: boolean; is_primary_key: boolean; is_foreign_key: boolean };

/** Call LLM to generate one-line descriptions for each table. Returns map of table_name -> description. */
async function generateTableDescriptions(
  tableMap: Map<string, RawCol[]>
): Promise<Map<string, string>> {
  const tableNames = [...tableMap.keys()];
  if (tableNames.length === 0) return new Map();

  const schemaSummary = tableNames
    .map(
      (tn) =>
        `- ${tn}: ${tableMap.get(tn)!.map((c) => `${c.column_name} (${c.data_type})${c.is_primary_key ? " PK" : ""}${c.is_foreign_key ? " FK" : ""}`).join(", ")}`
    )
    .join("\n");

  const prompt = `${PROMPT_SCHEMA_DESCRIPTIONS}${schemaSummary}`;

  try {
    const llm = getLLMProvider();
    const result = await llm.generate({
      messages: [
        { role: "system", content: PROMPT_SCHEMA_SYSTEM },
        { role: "user", content: prompt },
      ],
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.content) as Record<string, string>;
    const map = new Map<string, string>();
    for (const tn of tableNames) {
      const desc = parsed[tn];
      if (typeof desc === "string" && desc.trim().length > 0) {
        map.set(tn, desc.trim().slice(0, 500));
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

const SEMANTIC_TYPES = new Set(["currency", "timestamp", "date", "identifier", "count", "percentage", "text", "boolean", "other"]);

/** Generate column-level semantics (type + meaning) for one table. Returns map column_name -> { semantic_type, meaning }. */
async function generateColumnSemantics(
  tableName: string,
  cols: RawCol[]
): Promise<Map<string, { semantic_type: string; meaning: string }>> {
  if (cols.length === 0) return new Map();
  const colList = cols.map((c) => `${c.column_name} (${c.data_type})`).join(", ");
  const prompt = `${PROMPT_COLUMN_SEMANTICS}${tableName}: ${colList}`;

  try {
    const llm = getLLMProvider();
    const result = await llm.generate({
      messages: [
        { role: "system", content: PROMPT_COLUMN_SEMANTICS_SYSTEM },
        { role: "user", content: prompt },
      ],
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.content) as Record<string, { semantic_type?: string; meaning?: string }>;
    const map = new Map<string, { semantic_type: string; meaning: string }>();
    for (const col of cols) {
      const v = parsed[col.column_name];
      if (v && typeof v === "object") {
        const st = typeof v.semantic_type === "string" && SEMANTIC_TYPES.has(v.semantic_type) ? v.semantic_type : "other";
        const meaning = typeof v.meaning === "string" ? v.meaning.trim().slice(0, 200) : "";
        map.set(col.column_name, { semantic_type: st, meaning });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

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
  if (!config) throw new Error(ERR_DB_NOT_FOUND(dbId));

  const internal = getInternalDb();

  // Delete existing schema for this db (relationships first due to FK refs)
  internal.prepare("DELETE FROM schema_relationships WHERE from_table_id IN (SELECT id FROM schema_tables WHERE db_id = ?)").run(dbId);
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

  // Extract and store foreign key relationships
  type FkRow = { table_name: string; column_name: string; foreign_table: string; foreign_column: string };
  let fkRows: FkRow[] = [];
  if (isPostgres(dbId)) {
    const pool = getPool(dbId) as pg.Pool;
    const fkResult = await pool.query(PG_FK_QUERY);
    fkRows = (fkResult.rows ?? []) as FkRow[];
  } else {
    const pool = getPool(dbId) as mysql.Pool;
    const [rows] = await pool.query(MYSQL_FK_QUERY);
    fkRows = (Array.isArray(rows) ? rows : [rows]) as FkRow[];
  }
  const insertRel = internal.prepare(`
    INSERT INTO schema_relationships (id, db_id, from_table_id, from_column_name, to_table_name, to_column_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of fkRows) {
    const fromTableId = tableIdByTableName.get(row.table_name);
    if (fromTableId) insertRel.run(generateId(), dbId, fromTableId, row.column_name, row.foreign_table, row.foreign_column);
  }

  const descriptions = await generateTableDescriptions(tableMap);
  const updateDesc = internal.prepare("UPDATE schema_tables SET description = ? WHERE id = ?");
  for (const [tableName, tableId] of tableIdByTableName) {
    const desc = descriptions.get(tableName);
    if (desc) updateDesc.run(desc, tableId);
  }

  const updateColSemantics = internal.prepare(
    "UPDATE schema_columns SET semantic_type = ?, description = ? WHERE table_id = ? AND column_name = ?"
  );
  const columnSemanticsByTable = new Map<string, Map<string, { semantic_type: string; meaning: string }>>();
  for (const [tableName, cols] of tableMap) {
    const tableId = tableIdByTableName.get(tableName)!;
    const semantics = await generateColumnSemantics(tableName, cols);
    columnSemanticsByTable.set(tableName, semantics);
    for (const col of cols) {
      const s = semantics.get(col.column_name);
      if (s) updateColSemantics.run(s.semantic_type, s.meaning || null, tableId, col.column_name);
    }
  }

  if (isVectorEnabled()) {
    const postgres = isPostgres(dbId);
    const chunks: SchemaChunk[] = [];

    for (const [tableName, cols] of tableMap) {
      const tableId = tableIdByTableName.get(tableName)!;
      const desc = descriptions.get(tableName);
      const colSems = columnSemanticsByTable.get(tableName);
      const colLines = cols.map((c) => {
        const sem = colSems?.get(c.column_name);
        const semStr = sem ? ` [${sem.semantic_type}${sem.meaning ? ": " + sem.meaning : ""}]` : "";
        return `  - ${c.column_name} (${c.data_type})${c.is_primary_key ? " PK" : ""}${c.is_foreign_key ? " FK" : ""}${semStr}`;
      });
      let chunkText = `Table: ${tableName}${desc ? ` (${desc})` : ""}\nColumns:\n${colLines.join("\n")}`;

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
