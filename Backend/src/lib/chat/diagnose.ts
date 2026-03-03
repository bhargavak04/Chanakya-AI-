/**
 * Diagnose mode - multi-step agent that runs multiple SQL queries
 * to identify root causes across tables
 */
import { MAX_DIAGNOSE_STEPS } from "../../core/constants.js";
import {
  ERR_MISSING_DIAGNOSIS_SUMMARY,
  ERR_MISSING_QUERY,
  ERR_INVALID_DIAGNOSE_STEP,
  ERR_PARSE_DIAGNOSE_JSON,
} from "../../core/strings.js";
import {
  DIAGNOSE_STEP_FIRST,
  DIAGNOSE_STEP_FOLLOW_UP,
  DIAGNOSE_SYSTEM_PREFIX,
} from "../../core/prompts.js";
import type { ChartConfig } from "../../types/index.js";

export { MAX_DIAGNOSE_STEPS };

export interface DiagnoseStepQuery {
  action: "query";
  reasoning?: string;
  query: string;
  chart: ChartConfig;
}

export interface DiagnoseStepFinish {
  action: "finish";
  diagnosis_summary: string;
  root_causes: string[];
  recommendations: string[];
  chart: ChartConfig;
}

export type DiagnoseStepOutput = DiagnoseStepQuery | DiagnoseStepFinish;

export function parseDiagnoseStep(content: string): DiagnoseStepOutput | { error: string } {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return { error: (parsed as { error: string }).error };
    }
    if (parsed && typeof parsed === "object" && "action" in parsed) {
      const p = parsed as Record<string, unknown>;
      if (p.action === "finish") {
        const d = p as { action: "finish"; diagnosis_summary?: string; root_causes?: string[]; recommendations?: string[]; chart?: ChartConfig };
        if (typeof d.diagnosis_summary !== "string") return { error: ERR_MISSING_DIAGNOSIS_SUMMARY };
        return {
          action: "finish",
          diagnosis_summary: d.diagnosis_summary,
          root_causes: Array.isArray(d.root_causes) ? d.root_causes : [],
          recommendations: Array.isArray(d.recommendations) ? d.recommendations : [],
          chart: (d.chart as ChartConfig) ?? { type: "table", x_axis: "", y_axis: [] },
        };
      }
      if (p.action === "query") {
        const q = p as { action: "query"; query?: string; chart?: ChartConfig; reasoning?: string };
        if (typeof q.query !== "string") return { error: ERR_MISSING_QUERY };
        const chart = (q.chart as ChartConfig) ?? { type: "table", x_axis: "", y_axis: [] };
        return {
          action: "query",
          reasoning: typeof q.reasoning === "string" ? q.reasoning : undefined,
          query: q.query,
          chart,
        };
      }
    }
    return { error: ERR_INVALID_DIAGNOSE_STEP };
  } catch {
    return { error: ERR_PARSE_DIAGNOSE_JSON };
  }
}

export function buildDiagnoseSystemPrompt(schemaText: string, dbType: string): string {
  return `${DIAGNOSE_SYSTEM_PREFIX}${dbType}

SCHEMA:
${schemaText}`;
}

export function buildDiagnoseStepPrompt(
  userQuestion: string,
  steps: { query: string; resultSummary: string }[]
): string {
  const history = steps
    .map(
      (s, i) =>
        `Query ${i + 1}: ${s.query}\nResult: ${s.resultSummary}`
    )
    .join("\n\n---\n\n");

  if (steps.length === 0) {
    return `User question: ${userQuestion}${DIAGNOSE_STEP_FIRST}`;
  }

  return `User question: ${userQuestion}

Previous queries and results:
${history}
${DIAGNOSE_STEP_FOLLOW_UP}`;
}
