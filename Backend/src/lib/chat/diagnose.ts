/**
 * Diagnose mode - multi-step agent that runs multiple SQL queries
 * to identify root causes across tables
 */
import type { ChartConfig } from "../../types/index.js";

export const MAX_DIAGNOSE_STEPS = 5;

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
        if (typeof d.diagnosis_summary !== "string") return { error: "Missing diagnosis_summary" };
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
        if (typeof q.query !== "string") return { error: "Missing query" };
        const chart = (q.chart as ChartConfig) ?? { type: "table", x_axis: "", y_axis: [] };
        return {
          action: "query",
          reasoning: typeof q.reasoning === "string" ? q.reasoning : undefined,
          query: q.query,
          chart,
        };
      }
    }
    return { error: "Invalid diagnose step structure" };
  } catch {
    return { error: "Failed to parse diagnose response as JSON" };
  }
}

export function buildDiagnoseSystemPrompt(schemaText: string, dbType: string): string {
  return `You are a diagnostic analyst. You investigate data issues by running MULTIPLE SQL queries across different tables to find root causes.

Your job: Run queries, observe results, then either run another query to dig deeper OR finish with your diagnosis.

RULES:
1. Use ONLY tables and columns from the schema. Output ONLY SELECT queries. Add LIMIT 1000.
2. Return valid JSON only. No markdown.
3. For comparison charts: use multiple y_axis columns (e.g. ["current_revenue", "previous_revenue"] or ["revenue", "bookings"]) so trends can be compared. Line charts with 2-3 series work well.
4. Explore related tables: revenue, bookings, members, venues, etc. JOIN across tables to find drivers.
5. After 1-4 queries, when you have enough evidence, output action: "finish" with your diagnosis.
6. Date filters: PostgreSQL use INTERVAL '1 month', NOW() - INTERVAL '7 days'. MySQL use DATE_SUB(NOW(), INTERVAL 7 DAY).

STEP OUTPUT - run another query:
{
  "action": "query",
  "reasoning": "Brief: what you're checking and why",
  "query": "SELECT ... (valid SQL)",
  "chart": {
    "type": "line" | "bar" | "area" | "table",
    "x_axis": "column_name",
    "y_axis": ["col1", "col2"],
    "time_granularity": "month" (if time series)
  }
}

STEP OUTPUT - finish with diagnosis:
{
  "action": "finish",
  "diagnosis_summary": "2-4 sentence summary of what caused the issue",
  "root_causes": ["Cause 1", "Cause 2", ...],
  "recommendations": ["Action 1", "Action 2", ...],
  "chart": {
    "type": "line" | "bar" | "area" | "table",
    "x_axis": "column_name",
    "y_axis": ["col1", "col2"]
  }
}

DATABASE: ${dbType}

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
    return `User question: ${userQuestion}

Run your first diagnostic query. Focus on the main metric or comparison (e.g. revenue by month, bookings trend).`;
  }

  return `User question: ${userQuestion}

Previous queries and results:
${history}

Based on the above, either:
1. Run another query to investigate further (e.g. drill into a specific table, compare regions, check member/booking patterns)
2. Or output action: "finish" with your diagnosis_summary, root_causes, and recommendations.`;
}
