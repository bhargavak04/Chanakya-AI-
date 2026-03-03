/**
 * SQL validation - read-only, parser-based
 * Blocks: DROP, DELETE, UPDATE, ALTER, INSERT, TRUNCATE, GRANT, REVOKE
 */
import NodeSqlParser from "node-sql-parser";
import { DEFAULT_LIMIT } from "../../core/constants.js";
import {
  ERR_MULTIPLE_STATEMENTS,
  ERR_EMPTY_QUERY,
  ERR_ONLY_SELECT,
  ERR_INVALID_SQL_STRUCTURE,
  ERR_SQL_PARSE_ERROR,
} from "../../core/strings.js";
import type { DbType } from "../../types/index.js";

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
      if (ast.length > 1) return { valid: false, error: ERR_MULTIPLE_STATEMENTS };
      if (ast.length === 0) return { valid: false, error: ERR_EMPTY_QUERY };
    }

    const singleAst = Array.isArray(ast) ? ast[0] : ast;

    if (!singleAst || typeof singleAst !== "object") {
      return { valid: false, error: ERR_INVALID_SQL_STRUCTURE };
    }

    const type = (singleAst as { type?: string }).type;
    if (type !== "select") {
      return { valid: false, error: ERR_ONLY_SELECT };
    }

    // Return validated SQL as-is; prompt instructs LLM to add LIMIT 1000
    const sanitized = parser.sqlify(singleAst, opt);
    const finalSql = appendLimitIfMissing(sanitized, DEFAULT_LIMIT);

    return { valid: true, sql: finalSql };
  } catch (err) {
    const msg = err instanceof Error ? err.message : ERR_SQL_PARSE_ERROR;
    return { valid: false, error: msg };
  }
}

function appendLimitIfMissing(sql: string, limit: number): string {
  const trimmed = sql.trimEnd().replace(/;\s*$/, "");
  if (/\bLIMIT\s+\d+/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${limit}`;
}
