/**
 * Schema ingestion - fetch from user DB, store in internal SQLite
 */
import pg from "pg";
import mysql from "mysql2/promise";
import { getConnectionConfig, getPool, isPostgres } from "../db/connections.js";
import { getInternalDb, generateId } from "../db/internal.js";
import type { DbType, SchemaTable, SchemaColumn } from "../../types/index.js";

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

  const transaction = internal.transaction(() => {
    for (const [tableName, cols] of tableMap) {
      const tableId = generateId();
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

  return { tables: tableCount, columns: columnCount };
}
