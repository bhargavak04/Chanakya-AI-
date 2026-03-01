/**
 * Internal SQLite store - connections, schemas, conversations
 */
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { getDbPath } from "../../config.js";
export function initInternalDb(): Database.Database {
  const path = getDbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('postgresql', 'mysql')),
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      database TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_tables (
      id TEXT PRIMARY KEY,
      db_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      description TEXT,
      row_count_estimate INTEGER,
      UNIQUE(db_id, table_name)
    );

    CREATE TABLE IF NOT EXISTS schema_columns (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES schema_tables(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      is_nullable INTEGER NOT NULL DEFAULT 1,
      is_primary_key INTEGER NOT NULL DEFAULT 0,
      is_foreign_key INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      UNIQUE(table_id, column_name)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      active_db_id TEXT REFERENCES databases(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      structured_state TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_schema_tables_db ON schema_tables(db_id);
    CREATE INDEX IF NOT EXISTS idx_schema_columns_table ON schema_columns(table_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_turns_conv ON conversation_turns(conversation_id);
  `);

  // Migration: add ssl_required for Azure/AWS
  try {
    db.exec("ALTER TABLE databases ADD COLUMN ssl_required INTEGER NOT NULL DEFAULT 1");
  } catch {
    // Column already exists
  }

  return db;
}

let internalDb: Database.Database | null = null;

export function getInternalDb(): Database.Database {
  if (!internalDb) internalDb = initInternalDb();
  return internalDb;
}

export function generateId(): string {
  return crypto.randomUUID();
}
