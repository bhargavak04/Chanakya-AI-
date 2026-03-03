/**
 * User-facing strings and API messages. Centralize here for easy updates and i18n.
 */

// API - Chat
export const ERR_CONVERSATION_NOT_FOUND = "Conversation not found";
export const ERR_CONVERSATION_TIED_TO_DB = "Conversation is tied to a different database";

// API - Databases
export const ERR_VALIDATION_FAILED = "Validation failed";
export const ERR_CONNECTION_FAILED = "Connection failed";
export const ERR_DATABASE_NOT_FOUND = "Database not found";

// API - Schema
export const ERR_INGESTION_FAILED = "Ingestion failed";

// API - Export
export const ERR_DATA_ARRAY_REQUIRED = "data array required";

// Lib - Pipeline
export const ERR_INVALID_LLM_OUTPUT = "Invalid LLM output structure";
export const ERR_PARSE_LLM_JSON = "Failed to parse LLM response as JSON";
export const ERR_NO_SCHEMA =
  "Schema not ingested. Add database and run schema ingestion first.";
export const ERR_LLM_REQUEST_FAILED = "LLM request failed";
export const ERR_LLM_RETRY_FAILED = "LLM retry failed";
export const ERR_SQL_VALIDATION_FAILED = "SQL validation failed";
export const ERR_QUERY_EXECUTION_FAILED = "Query execution failed";
export const ERR_QUERY_FAILED = "Query failed";
export const ERR_DIAGNOSE_MAX_STEPS = "Reached maximum diagnostic steps.";
export const MSG_NO_DATA = "No data to display.";
export const MSG_SEE_CHART_DETAILS = "See chart and table for details.";
export const buildFixSqlRetryMessage = (sql: string, error: string): string =>
  `Your previous SQL failed. Fix it and return valid JSON with the corrected query.

Failed SQL:
${sql}

Error:
${error}

Return the corrected JSON (mode, query, chart) with a fixed query.`;

// Lib - Diagnose
export const ERR_MISSING_DIAGNOSIS_SUMMARY = "Missing diagnosis_summary";
export const ERR_MISSING_QUERY = "Missing query";
export const ERR_INVALID_DIAGNOSE_STEP = "Invalid diagnose step structure";
export const ERR_PARSE_DIAGNOSE_JSON = "Failed to parse diagnose response as JSON";

// Lib - SQL Validator
export const ERR_MULTIPLE_STATEMENTS = "Multiple statements not allowed";
export const ERR_EMPTY_QUERY = "Empty query";
export const ERR_ONLY_SELECT = "Only SELECT queries are allowed";
export const ERR_INVALID_SQL_STRUCTURE = "Invalid SQL structure";
export const ERR_SQL_PARSE_ERROR = "SQL parse error";

// Lib - DB Connections
export const ERR_DB_NOT_FOUND = (dbId: string) => `Database ${dbId} not found`;

// Lib - SQL Executor
export const ERR_QUERY_TIMEOUT = (seconds: number) =>
  `Query timeout (${seconds}s)`;

// Config
export const ERR_CONFIG_VALIDATION = (msg: string) =>
  `Config validation failed:\n${msg}`;

// Index / startup
export const MSG_SERVER_STARTED = (port: number) =>
  `Pulse backend running on http://localhost:${port}`;
