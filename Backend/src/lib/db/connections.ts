/**
 * Connection manager for user PostgreSQL and MySQL databases
 * One active connection per db_id, pooled
 */
import pg from "pg";
import mysql from "mysql2/promise";
import type { DbType, DatabaseConnection } from "../../types/index.js";
import { getInternalDb } from "./internal.js";

const { Pool } = pg;

const pgPools = new Map<string, pg.Pool>();
const mysqlPools = new Map<string, mysql.Pool>();

const sslOption = (enabled: boolean) =>
  enabled ? { rejectUnauthorized: false } : false;

export function getConnectionConfig(dbId: string): DatabaseConnection | null {
  const db = getInternalDb();
  const row = db
    .prepare(
      `SELECT id, name, type, host, port, database, username, password, ssl_required, created_at 
       FROM databases WHERE id = ?`
    )
    .get(dbId) as { id: string; name: string; type: string; host: string; port: number; database: string; username: string; password: string; ssl_required?: number; created_at: string } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type as DbType,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    password: row.password,
    ssl_required: row.ssl_required !== 0,
    created_at: row.created_at,
  };
}

function getPgPool(config: DatabaseConnection): pg.Pool {
  let pool = pgPools.get(config.id);
  if (!pool) {
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: sslOption(config.ssl_required),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pgPools.set(config.id, pool);
  }
  return pool;
}

function getMysqlPool(config: DatabaseConnection): mysql.Pool {
  let pool = mysqlPools.get(config.id);
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl_required ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 5000,
    });
    mysqlPools.set(config.id, pool);
  }
  return pool;
}

export function getPool(dbId: string): pg.Pool | mysql.Pool {
  const config = getConnectionConfig(dbId);
  if (!config) throw new Error(`Database ${dbId} not found`);
  if (config.type === "postgresql") return getPgPool(config);
  return getMysqlPool(config);
}

export function isPostgres(dbId: string): boolean {
  const config = getConnectionConfig(dbId);
  return config?.type === "postgresql";
}

export function isMysql(dbId: string): boolean {
  const config = getConnectionConfig(dbId);
  return config?.type === "mysql";
}

export async function testConnection(
  config: Omit<DatabaseConnection, "id" | "created_at">
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sslRequired = config.ssl_required !== false;

  if (config.type === "postgresql") {
    const client = new pg.Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: sslOption(sslRequired),
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      await client.end();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return { ok: false, error: msg };
    }
  } else {
    try {
      const conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 5000,
      });
      await conn.end();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return { ok: false, error: msg };
    }
  }
}
