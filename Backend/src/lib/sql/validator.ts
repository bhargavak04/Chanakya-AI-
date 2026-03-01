/**
 * SQL validation - read-only, parser-based
 * Blocks: DROP, DELETE, UPDATE, ALTER, INSERT, TRUNCATE, GRANT, REVOKE
 */
import NodeSqlParser from "node-sql-parser";
import type { DbType } from "../../types/index.js";

const DEFAULT_LIMIT = 1000;

export interface ValidationResult {
  valid: boolean;
  sql?: string;
  error?: string;
}

export function validateAndSanitize(sql: string, dbType: DbType): ValidationResult {
  const dialect = dbType === "postgresql" ? "PostgresQL" : "MySQL";
  const parser = new NodeSqlParser.Parser();
  const opt = { database: dialect };

  try {
    // Parse - returns AST or array for multiple statements
    const ast = parser.astify(sql, opt);

    if (Array.isArray(ast)) {
      if (ast.length > 1) return { valid: false, error: "Multiple statements not allowed" };
      if (ast.length === 0) return { valid: false, error: "Empty query" };
    }

    const singleAst = Array.isArray(ast) ? ast[0] : ast;

    if (!singleAst || typeof singleAst !== "object") {
      return { valid: false, error: "Invalid SQL structure" };
    }

    const type = (singleAst as { type?: string }).type;
    if (type !== "select") {
      return { valid: false, error: "Only SELECT queries are allowed" };
    }

    // Return validated SQL as-is; prompt instructs LLM to add LIMIT 1000
    const sanitized = parser.sqlify(singleAst, opt);
    const finalSql = appendLimitIfMissing(sanitized, DEFAULT_LIMIT);

    return { valid: true, sql: finalSql };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SQL parse error";
    return { valid: false, error: msg };
  }
}

function appendLimitIfMissing(sql: string, limit: number): string {
  const trimmed = sql.trimEnd().replace(/;\s*$/, "");
  if (/\bLIMIT\s+\d+/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${limit}`;
}
