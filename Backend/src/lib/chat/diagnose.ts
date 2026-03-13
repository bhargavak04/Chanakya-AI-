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
  DIAGNOSE_STEP_PLAN_FIRST,
  DIAGNOSE_STEP_EXECUTE,
  DIAGNOSE_STEP_ALL_DONE,
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

export interface DiagnoseStepPlan {
  action: "plan";
  steps: string[];
}

export type DiagnoseStepOutput = DiagnoseStepQuery | DiagnoseStepFinish | DiagnoseStepPlan;

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
      if (p.action === "plan") {
        const pl = p as { action: "plan"; steps?: unknown };
        if (!Array.isArray(pl.steps) || pl.steps.length === 0) return { error: "Plan must have non-empty steps array" };
        const steps = pl.steps.filter((s): s is string => typeof s === "string").slice(0, 5);
        if (steps.length === 0) return { error: "Plan steps must be strings" };
        return { action: "plan", steps };
      }
    }
    return { error: ERR_INVALID_DIAGNOSE_STEP };
  } catch {
    return { error: ERR_PARSE_DIAGNOSE_JSON };
  }
}

export function buildDiagnoseSystemPrompt(schemaText: string, dbType: string, intentContext?: string): string {
  return `${DIAGNOSE_SYSTEM_PREFIX}${dbType}
${intentContext ? `\n${intentContext}\n` : ""}
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

/** Prompt for plan-first flow: ask for investigation plan (first turn) */
export function buildDiagnosePlanFirstPrompt(userQuestion: string): string {
  return `User question: ${userQuestion}${DIAGNOSE_STEP_PLAN_FIRST}`;
}

/** Prompt for plan-first flow: execute step N of the plan */
export function buildDiagnoseExecuteStepPrompt(
  planSteps: string[],
  stepIndex: number,
  steps: { query: string; resultSummary: string }[]
): string {
  const planList = planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const history =
    steps.length > 0
      ? steps
          .map(
            (s, i) =>
              `Step ${i + 1} result: ${s.resultSummary}`
          )
          .join("\n\n") + "\n\n"
      : "";
  const stepDesc = planSteps[stepIndex];
  if (stepIndex >= planSteps.length) {
    return `${history}${DIAGNOSE_STEP_ALL_DONE}`;
  }
  return `${history}${DIAGNOSE_STEP_EXECUTE(planList, stepIndex + 1, stepDesc)}`;
}
