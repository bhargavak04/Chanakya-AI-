/**
 * LLM prompt templates and fragments. Centralized for maintainability.
 */

export const BASE_RULES = `
1. Use ONLY the tables and columns provided. If a column does not exist, return: {"error": "Column X does not exist in schema"}
2. Output ONLY SELECT queries. No INSERT, UPDATE, DELETE, DROP, etc. Always add LIMIT 1000 if not present.
3. Return valid JSON only, no markdown or explanation.`;

export const ID_RESOLUTION_RULES = `
ID/NAME RESOLUTION (critical):
- All id columns (venue_id, member_id, plan_id, etc.) are UUIDs. Users NEVER know or provide UUIDs.
- When users refer to entities by name (e.g. "venue 1", "my venue", "Venue Manhattan", "member John"), ALWAYS filter by the human-readable name column, NOT by id.
- Use ILIKE (PostgreSQL) or LIKE (MySQL) with % wildcards for flexible, case-insensitive matching:
  - "venue 1" -> WHERE v.name ILIKE '%venue 1%'  or  WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%venue 1%' LIMIT 1)
  - "my venue" -> WHERE v.name ILIKE '%my venue%'
- Name columns: venues.name, members.name, tournaments.name, membership_plans.name. JOIN and filter by these when users mention entities.
- Use LIMIT 1 in subqueries when resolving to a single ID.`;

export const CHART_RULES = `
CHART TYPE RULES:
- Use "line" or "area" for time series
- Use "bar" for categorical comparisons. When comparing breakdowns (e.g. by status, category, type), include "group_by": ["column_name"] so each group gets distinct bars and a legend
- Use "pie" for composition/parts of whole
- Use "scatter" for correlation or x-y relationship (e.g. price vs quantity, two numeric dimensions)
- Use "table" when user asks for raw data or list

ADVANCED OPTIONS (use ONLY when the query warrants it; keep simple charts for simple queries):
- "stacked": true - for bar with group_by when showing parts-of-whole (e.g. cumulative revenue by status). Omit for side-by-side comparison
- "y_axis_right": ["column"] - when comparing metrics on very different scales (e.g. revenue in thousands vs count). Omit for same-scale metrics
- "reference_line": { "value": number, "label": "Target" } - when user asks for target, breakeven, threshold, or benchmark. Omit otherwise`;

export const JSON_STRUCTURE_TEMPLATE = (mode: string) => `
{
  "mode": "${mode}",
  "query": "SELECT ... (valid SQL)",
  "chart": {
    "type": "line" | "bar" | "area" | "pie" | "scatter" | "table",
    "x_axis": "column_name",
    "y_axis": ["column1", "column2"],
    "group_by": ["optional_group_column"],
    "time_granularity": "day" | "week" | "month" (if time series),
    "stacked": true | false (optional, for bar with group_by),
    "y_axis_right": ["column"] (optional, for dual-scale line/area),
    "reference_line": { "value": number, "label": "string" } (optional)
  }
}`;

// Mode-specific instruction prefixes
export const MODE_ANALYZE = `You are a SQL analyst. Output ONLY valid JSON.`;
export const MODE_FORECAST = `You are a SQL analyst for forecasting. Output ONLY valid JSON.`;
export const MODE_SIMULATE = `You are a SQL analyst for what-if simulation. Output ONLY valid JSON.`;
export const MODE_DIAGNOSE_ANALYZE = `You are a SQL analyst for diagnosis. Output ONLY valid JSON.`;
export const MODE_MAX = `You are a senior SQL analyst doing comprehensive analysis. Output ONLY valid JSON.`;

export const FORECAST_CRITICAL = `
CRITICAL: We CANNOT query future data. When the user asks to forecast (e.g. "revenue in next 6 months", "next 2 weeks", "next 7 days", "next year"):
- Return a query that fetches HISTORICAL data. Match the user's time unit:
  - "next N days" or "next week" -> group by DAY (date_trunc('day', ...)), fetch last 30-90 days of daily data
  - "next N weeks" -> group by WEEK (date_trunc('week', ...)), fetch last 3-6 months of weekly data
  - "next N months" or "next quarter" or "next month" -> group by MONTH (date_trunc('month', ...)), fetch last 12-24 months of monthly data
  - "next N years" or "next year" -> group by YEAR (date_trunc('year', ...)) or by month, fetch last 2-5 years of data
- Include a date column and a numeric metric (e.g. SUM(amount), COUNT(*)). Order by the date column.
- Provide enough history (at least 2x the forecast horizon) so the system can predict.`;

export const SIMULATE_INSTRUCTION =
  "Generate a baseline query that returns metrics. User may ask \"what if X increases by Y%\". Return the base query; we will apply adjustments server-side.";
export const DIAGNOSE_INSTRUCTION =
  "Generate a comparison query: current period vs previous period, or breakdowns to find causes. Prefer bar or table for comparisons.";
export const MAX_INSTRUCTION =
  "Provide the most insightful query for the question: analyze, compare, and surface key drivers. Use the best chart type for the answer.";

// Insight prompt guidance — real analysis, not recitation; grounded, no fluff or hallucinations
export const INSIGHT_GROUNDING = `
STRICT: Base your analysis ONLY on the provided data and the user's question. Do not assume, infer beyond the data, or invent numbers. Cite specific values or trends when they support your point. No filler or generic advice. No hallucinations.`;

/** Do not read the data back row-by-row or category-by-category. Analyze instead of recite. */
export const INSIGHT_ANTI_RECITE = `
DO NOT simply recite the data (e.g. "X has value A, Y has value B, Z has value C" or "Region A leads with..., B follows..., C is third..."). That adds no value. Instead: highlight what actually matters—concentration vs spread, outliers, share of total when it tells a story, trends, or one or two standout comparisons. Write as an analyst interpreting the numbers, not as someone reading the table aloud. Stay grounded in the data.`;

export const INSIGHT_ANALYZE =
  "Analyze what the data shows: patterns, concentration, outliers, and why it might matter. Use 6–14 lines. Do not list every row or category; synthesize. Cite numbers only when they support an insight.";
export const INSIGHT_FORECAST =
  "The data includes historical points and a forecast (predicted) segment from a model. Summarize the historical trend, then what the predicted segment implies (e.g. level, total, direction). Cite numbers. Do not treat the forecast as past data; state that it is the model's projection.";
export const INSIGHT_SIMULATE =
  "Explain the what-if outcome from the data. What would change? Cite numbers. No unsupported claims.";
export const INSIGHT_DIAGNOSE =
  "Explain root causes only where the data supports them. Cite specific findings from the queries. No invented causes.";
export const INSIGHT_MAX =
  "Synthesize key drivers and findings from the step results only. Cite numbers and trends from the data. No assumptions or invented insights.";

export const INSIGHT_PROMPT_PREFIX = `You are a data analyst. Write a short analysis that interprets the data—what it means, what stands out, and why it might matter—based ONLY on the data below and the user's question. Do not read the data back row-by-row or category-by-category; analyze and synthesize. Use 6–14 lines. No fluff.

Mode: `;
export const INSIGHT_PROMPT_SUFFIX = `

Stay strictly grounded in the data. No hallucinations. Output plain text only, no markdown or bullets required.`;

// Schema ingestion LLM
export const PROMPT_SCHEMA_DESCRIPTIONS = `Given this database schema, write a one-line description (max 80 chars) for each table describing what it likely stores. Output JSON only: {"table_name": "description", ...}

Schema:
`;
export const PROMPT_SCHEMA_SYSTEM = "You are a database analyst. Output only valid JSON.";

export const PROMPT_COLUMN_SEMANTICS = `For each column, assign a semantic_type and short meaning. semantic_type must be one of: currency, timestamp, date, identifier, count, percentage, text, boolean, or other. meaning is a few words (e.g. "payment amount", "order date"). Output JSON only:
{"column_name": {"semantic_type": "currency", "meaning": "payment amount"}, ...}

Columns (table_name: col1 (type), col2 (type), ...):
`;
export const PROMPT_COLUMN_SEMANTICS_SYSTEM = "You are a database analyst. Output only valid JSON. Use the exact semantic_type values: currency, timestamp, date, identifier, count, percentage, text, boolean, other.";

// Diagnose prompts
export const DIAGNOSE_SYSTEM_PREFIX = `You are a diagnostic analyst. You investigate data issues by running MULTIPLE SQL queries across different tables to find root causes.

Your job: FIRST output an investigation plan (action: "plan", steps: [...]). Then we will ask you to execute each step; for each step output action: "query" with SQL. When all steps are done or you have enough evidence, output action: "finish" with your diagnosis.

RULES:
1. Use ONLY tables and columns from the schema. Output ONLY SELECT queries. Add LIMIT 1000.
2. Return valid JSON only. No markdown.
3. For comparison charts: use multiple y_axis columns (e.g. ["current_revenue", "previous_revenue"] or ["revenue", "bookings"]) so trends can be compared. Line charts with 2-3 series work well.
4. Explore related tables: revenue, bookings, members, venues, etc. JOIN across tables to find drivers.
5. After 1-4 queries, when you have enough evidence, output action: "finish" with your diagnosis.
6. Date filters: PostgreSQL use INTERVAL '1 month', NOW() - INTERVAL '7 days'. MySQL use DATE_SUB(NOW(), INTERVAL 7 DAY).
7. diagnosis_summary, root_causes, and recommendations must be grounded ONLY in the query results you received; no assumptions or invented causes. No hallucinations. Synthesize findings; do not simply recite each result row or category.
8. SQL—refunds + bookings (or any two tables) by month: do NOT write (SELECT SUM(...) FROM bookings WHERE ... = r.refund_date) in the SELECT list when the outer query has GROUP BY. PostgreSQL errors "ungrouped column". Always use two subqueries grouped by the same period, then JOIN on that period. Example: FROM (SELECT date_trunc('month', refund_date) AS month, SUM(refund_amount) AS total_refunds FROM refunds GROUP BY 1) r JOIN (SELECT date_trunc('month', booking_date) AS month, SUM(amount) AS total_bookings FROM bookings GROUP BY 1) b ON r.month = b.month.

STEP OUTPUT - investigation plan (use this first):
{
  "action": "plan",
  "steps": ["Step 1 description", "Step 2 description", ...]
}

STEP OUTPUT - run a query (when executing a plan step):
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

DATABASE: `;

export const DIAGNOSE_STEP_FIRST = `
Run your first diagnostic query. Focus on the main metric or comparison (e.g. revenue by month, bookings trend).`;

export const DIAGNOSE_STEP_PLAN_FIRST = `

First output an investigation plan. Return JSON only:
{
  "action": "plan",
  "steps": ["Check revenue trend", "Check booking volume", "Check refund rate", "Check region performance"]
}
Use 3-5 concrete steps. Then we will run each step and you will generate the SQL for it.`;

export const DIAGNOSE_STEP_EXECUTE = (planList: string, stepNum: number, stepDesc: string) =>
  `Your plan:
${planList}

Execute step ${stepNum}: ${stepDesc}
To compare two tables by period (e.g. refunds vs bookings by month): use two subqueries each with date_trunc and GROUP BY, then JOIN on the period column. Do not use (SELECT ... WHERE col = outer_table.col) in SELECT—it causes "ungrouped column" errors.
Output action: "query" with your SQL and chart.`;

export const DIAGNOSE_STEP_ALL_DONE = `
All plan steps are done. Output action: "finish" with your diagnosis_summary, root_causes, and recommendations. Base them only on the query results above; no assumptions or hallucinations.`;

/** When max steps reached but we have query results, force one final turn to get a diagnosis. */
export const DIAGNOSE_FORCE_FINISH = `
Maximum diagnostic steps reached. Based on ALL the query results above, output action: "finish" with your diagnosis_summary, root_causes, and recommendations. Ground them in the results only.`;

export const DIAGNOSE_STEP_FOLLOW_UP = `
Based on the above, either:
1. Run another query to investigate further (e.g. drill into a specific table, compare regions, check member/booking patterns)
2. Or output action: "finish" with your diagnosis_summary, root_causes, and recommendations. Ground everything in the results only; no assumptions or hallucinations.`;

// Max mode prompts (multi-query deep-dive with planner, then synthesis)
export const MAX_SYSTEM_PREFIX = `You are a senior analyst doing a comprehensive deep-dive. You run MULTIPLE SQL queries to explore the question from different angles, then synthesize insights.

Your job: FIRST output an investigation plan (action: "plan", steps: [...]). Then we will ask you to execute each step; for each step output action: "query" with SQL. When all steps are done, output action: "finish" with your analysis_summary and key_findings.

RULES:
1. Use ONLY tables and columns from the schema. Output ONLY SELECT queries. Add LIMIT 1000.
2. Return valid JSON only. No markdown.
3. Plan 3-5 steps that cover: main metric/trend, breakdowns (e.g. by product/region), comparisons, and any driver analysis.
4. For comparison charts: use multiple y_axis or group_by. Line/bar/area/table as appropriate.
5. Date filters: PostgreSQL use INTERVAL '1 month', NOW() - INTERVAL '7 days'. MySQL use DATE_SUB(NOW(), INTERVAL 7 DAY).
6. analysis_summary and key_findings must be grounded ONLY in the step results and user question; no assumptions or hallucinations. Synthesize insights; do not simply list or recite each result row or category.

STEP OUTPUT - investigation plan (use this first):
{
  "action": "plan",
  "steps": ["Step 1: e.g. Overall revenue trend", "Step 2: ...", ...]
}

STEP OUTPUT - run a query (when executing a plan step):
{
  "action": "query",
  "reasoning": "Brief: what you're checking",
  "query": "SELECT ... (valid SQL)",
  "chart": {
    "type": "line" | "bar" | "area" | "table",
    "x_axis": "column_name",
    "y_axis": ["col1", "col2"],
    "time_granularity": "month" (if time series)
  }
}

STEP OUTPUT - finish with synthesis:
{
  "action": "finish",
  "analysis_summary": "2-4 sentence executive summary of what the data shows",
  "key_findings": ["Finding 1", "Finding 2", ...],
  "chart": {
    "type": "line" | "bar" | "area" | "table",
    "x_axis": "column_name",
    "y_axis": ["col1", "col2"]
  }
}

DATABASE: `;

export const MAX_STEP_PLAN_FIRST = `

First output a deep-dive investigation plan. Return JSON only:
{
  "action": "plan",
  "steps": ["Main metric or trend (e.g. revenue over time)", "Breakdown by category/segment", "Comparison or drivers", "Optional: drill-down"]
}
Use 3-5 concrete steps. Then we will run each step and you will generate the SQL for it.`;

export const MAX_STEP_EXECUTE = (planList: string, stepNum: number, stepDesc: string) =>
  `Your plan:
${planList}

Execute step ${stepNum}: ${stepDesc}
Output action: "query" with your SQL and chart.`;

export const MAX_STEP_ALL_DONE = `
All plan steps are done. Output action: "finish" with your analysis_summary and key_findings (synthesize from all step results only). Ground in the data; no assumptions or hallucinations.`;

export const MAX_STEP_FOLLOW_UP = `
Based on the above, either run another query (action: "query") or output action: "finish" with analysis_summary and key_findings. Ground everything in the step results only; no assumptions or hallucinations.`;
