/**
 * Max mode - multi-step planner for deep-dive analysis
 * Plan → execute queries → synthesize analysis_summary + key_findings
 */
import { MAX_DIAGNOSE_STEPS } from "../../core/constants.js";
import {
  MAX_SYSTEM_PREFIX,
  MAX_STEP_PLAN_FIRST,
  MAX_STEP_EXECUTE,
  MAX_STEP_ALL_DONE,
  MAX_STEP_FOLLOW_UP,
} from "../../core/prompts.js";
import type { ChartConfig } from "../../types/index.js";

export { MAX_DIAGNOSE_STEPS as MAX_MAX_STEPS };

export interface MaxStepQuery {
  action: "query";
  reasoning?: string;
  query: string;
  chart: ChartConfig;
}

export interface MaxStepFinish {
  action: "finish";
  analysis_summary: string;
  key_findings: string[];
  chart: ChartConfig;
}

export interface MaxStepPlan {
  action: "plan";
  steps: string[];
}

export type MaxStepOutput = MaxStepQuery | MaxStepFinish | MaxStepPlan;

export function parseMaxStep(content: string): MaxStepOutput | { error: string } {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return { error: (parsed as { error: string }).error };
    }
    if (parsed && typeof parsed === "object" && "action" in parsed) {
      const p = parsed as Record<string, unknown>;
      if (p.action === "finish") {
        const d = p as { action: "finish"; analysis_summary?: string; key_findings?: unknown[]; chart?: ChartConfig };
        if (typeof d.analysis_summary !== "string") return { error: "Missing analysis_summary in finish" };
        return {
          action: "finish",
          analysis_summary: d.analysis_summary,
          key_findings: Array.isArray(d.key_findings) ? d.key_findings.filter((x): x is string => typeof x === "string") : [],
          chart: (d.chart as ChartConfig) ?? { type: "table", x_axis: "", y_axis: [] },
        };
      }
      if (p.action === "query") {
        const q = p as { action: "query"; query?: string; chart?: ChartConfig; reasoning?: string };
        if (typeof q.query !== "string") return { error: "Missing query in query step" };
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
    return { error: "Invalid step: need action plan, query, or finish" };
  } catch {
    return { error: "Failed to parse JSON" };
  }
}

export function buildMaxSystemPrompt(schemaText: string, dbType: string, intentContext?: string): string {
  return `${MAX_SYSTEM_PREFIX}${dbType}
${intentContext ? `\n${intentContext}\n` : ""}
SCHEMA:
${schemaText}`;
}

export function buildMaxPlanFirstPrompt(userQuestion: string): string {
  return `User question: ${userQuestion}${MAX_STEP_PLAN_FIRST}`;
}

export function buildMaxExecuteStepPrompt(
  planSteps: string[],
  stepIndex: number,
  steps: { query: string; resultSummary: string }[]
): string {
  const planList = planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const history =
    steps.length > 0
      ? steps
          .map((s, i) => `Step ${i + 1} result: ${s.resultSummary}`)
          .join("\n\n") + "\n\n"
      : "";
  if (stepIndex >= planSteps.length) {
    return `${history}${MAX_STEP_ALL_DONE}`;
  }
  const stepDesc = planSteps[stepIndex];
  return `${history}${MAX_STEP_EXECUTE(planList, stepIndex + 1, stepDesc)}`;
}

/** Fallback when LLM returns a query without a plan (e.g. first turn) */
export function buildMaxStepPrompt(userQuestion: string, steps: { query: string; resultSummary: string }[]): string {
  const history = steps
    .map((s, i) => `Query ${i + 1}: ${s.query}\nResult: ${s.resultSummary}`)
    .join("\n\n---\n\n");
  if (steps.length === 0) {
    return `User question: ${userQuestion}${MAX_STEP_PLAN_FIRST}`;
  }
  return `User question: ${userQuestion}\n\nPrevious queries and results:\n${history}\n${MAX_STEP_FOLLOW_UP}`;
}
