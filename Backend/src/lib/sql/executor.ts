/**
 * Execute validated SQL against user database
 * Query timeout: 45 seconds (Neon serverless can have cold starts)
 */
import pg from "pg";
import mysql from "mysql2/promise";
import { QUERY_TIMEOUT_MS } from "../../core/constants.js";
import { ERR_QUERY_TIMEOUT } from "../../core/strings.js";
import { getPool, isPostgres } from "../db/connections.js";

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
          setTimeout(() => reject(new Error(ERR_QUERY_TIMEOUT(QUERY_TIMEOUT_MS / 1000))), QUERY_TIMEOUT_MS)
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
        setTimeout(() => reject(new Error(ERR_QUERY_TIMEOUT(QUERY_TIMEOUT_MS / 1000))), QUERY_TIMEOUT_MS)
      ),
    ])) as unknown as [mysql.RowDataPacket[]];

    const rows = result[0] ?? [];
    const normalized = rows.map((r) => (typeof r === "object" && r !== null ? { ...(r as object) } : { value: r }));

    return { rows: normalized as Record<string, unknown>[], durationMs: Date.now() - start };
  }
}
