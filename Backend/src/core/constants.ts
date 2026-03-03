/**
 * Technical constants. Update values here to change behavior across the app.
 */

// SQL Executor
export const QUERY_TIMEOUT_MS = 45_000;

// SQL Validator
export const DEFAULT_LIMIT = 1000;

// Chat Pipeline
export const LOG_PREFIX = "[CHAT]";
export const MAX_SQL_ATTEMPTS = 2;

// Diagnose
export const MAX_DIAGNOSE_STEPS = 5;

// Schema Ingestion
export const SAMPLE_ROW_LIMIT = 2;
export const TRUNCATE_VALUE_LEN = 80;

// DB Connections (pool config)
export const DB_POOL_MAX = 5;
export const DB_IDLE_TIMEOUT_MS = 30_000;
export const DB_CONNECTION_TIMEOUT_MS = 5_000;
export const DB_QUEUE_LIMIT = 0;

// Export
export const DEFAULT_EXPORT_FILENAME = "export";
