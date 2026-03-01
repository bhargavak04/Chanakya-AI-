/**
 * Schema retrieval for LLM context
 * Uses vector search when Cohere + Qdrant are configured; otherwise returns all tables
 */
import { getInternalDb } from "../db/internal.js";
import {
  isVectorEnabled,
  embedTexts,
  searchSchemaChunks,
} from "../vector/index.js";
import type { TableWithColumns } from "../../types/index.js";

export function getSchemaForDb(dbId: string): TableWithColumns[] {
  const db = getInternalDb();

  const tables = db
    .prepare(
      `SELECT id, db_id, table_name, description, row_count_estimate 
       FROM schema_tables WHERE db_id = ? ORDER BY table_name`
    )
    .all(dbId) as { id: string; db_id: string; table_name: string; description: string | null; row_count_estimate: number | null }[];

  const columns = db
    .prepare(
      `SELECT id, table_id, column_name, data_type, is_nullable, is_primary_key, is_foreign_key, description
       FROM schema_columns`
    )
    .all() as { id: string; table_id: string; column_name: string; data_type: string; is_nullable: number; is_primary_key: number; is_foreign_key: number; description: string | null }[];

  const colByTable = new Map<string, typeof columns>();
  for (const c of columns) {
    if (!colByTable.has(c.table_id)) colByTable.set(c.table_id, []);
    colByTable.get(c.table_id)!.push(c);
  }

  return tables.map((t) => ({
    ...t,
    columns: (colByTable.get(t.id) ?? []).map((c) => ({
      id: c.id,
      table_id: c.table_id,
      column_name: c.column_name,
      data_type: c.data_type,
      is_nullable: c.is_nullable === 1,
      is_primary_key: c.is_primary_key === 1,
      is_foreign_key: c.is_foreign_key === 1,
      description: c.description,
    })),
  }));
}

/** Get schema for LLM: vector search when enabled, else full schema */
export async function getSchemaForQuery(
  dbId: string,
  userMessage: string
): Promise<TableWithColumns[]> {
  if (!isVectorEnabled()) {
    return getSchemaForDb(dbId);
  }

  try {
    const [queryVec] = await embedTexts([userMessage], "search_query");
    const hits = await searchSchemaChunks(dbId, queryVec, 15);
    const tableIds = [...new Set(hits.map((h) => h.tableId))];

    if (tableIds.length === 0) {
      return getSchemaForDb(dbId);
    }

    const all = getSchemaForDb(dbId);
    const idSet = new Set(tableIds);
    return all.filter((t) => idSet.has(t.id));
  } catch {
    return getSchemaForDb(dbId);
  }
}

/** Format schema as compact text for LLM prompt */
export function formatSchemaForPrompt(tables: TableWithColumns[]): string {
  return tables
    .map(
      (t) =>
        `Table: ${t.table_name}${t.description ? ` (${t.description})` : ""}\n` +
        t.columns
          .map(
            (c) =>
              `  - ${c.column_name} (${c.data_type})${c.is_primary_key ? " PK" : ""}${c.is_foreign_key ? " FK" : ""}`
          )
          .join("\n")
    )
    .join("\n\n");
}
