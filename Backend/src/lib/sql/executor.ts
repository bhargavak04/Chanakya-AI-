/**
 * Execute validated SQL against user database
 * Query timeout: 5 seconds
 */
import pg from "pg";
import mysql from "mysql2/promise";
import { getPool, isPostgres } from "../db/connections.js";

const QUERY_TIMEOUT_MS = 5000;

export async function executeQuery(
  dbId: string,
  sql: string
): Promise<{ rows: Record<string, unknown>[]; durationMs: number }> {
  const start = Date.now();

  if (isPostgres(dbId)) {
    const pool = getPool(dbId) as pg.Pool;
    const client = await pool.connect();
    try {
      const result = await Promise.race([
        client.query({ text: sql, rowMode: "array" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Query timeout (5s)")), QUERY_TIMEOUT_MS)
        ),
      ]);

      const rows = (result as pg.QueryResult).rows.map((row, i) => {
        const obj: Record<string, unknown> = {};
        (result as pg.QueryResult).fields.forEach((f, j) => {
          obj[f.name] = row[j];
        });
        return obj;
      });

      return { rows, durationMs: Date.now() - start };
    } finally {
      client.release();
    }
  } else {
    const pool = getPool(dbId) as mysql.Pool;
    const result = (await Promise.race([
      pool.query(sql),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout (5s)")), QUERY_TIMEOUT_MS)
      ),
    ])) as unknown as [mysql.RowDataPacket[]];

    const rows = result[0] ?? [];
    const normalized = rows.map((r) => (typeof r === "object" && r !== null ? { ...(r as object) } : { value: r }));

    return { rows: normalized as Record<string, unknown>[], durationMs: Date.now() - start };
  }
}
