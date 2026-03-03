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
CRITICAL: We CANNOT query future data. When the user asks to "forecast next 7 days" or similar:
- Return a query that fetches HISTORICAL data (e.g. last 30-90 days, or last few months)
- The system will use this historical series to compute predictions
- Use date_trunc for grouping by day/week/month. Include a date column and a numeric metric (e.g. SUM(amount), COUNT(*))
- Example: "forecast revenue next 7 days" -> query LAST 30-60 days of daily revenue; we predict forward from that`;

export const SIMULATE_INSTRUCTION =
  "Generate a baseline query that returns metrics. User may ask \"what if X increases by Y%\". Return the base query; we will apply adjustments server-side.";
export const DIAGNOSE_INSTRUCTION =
  "Generate a comparison query: current period vs previous period, or breakdowns to find causes. Prefer bar or table for comparisons.";
export const MAX_INSTRUCTION =
  "Provide the most insightful query for the question: analyze, compare, and surface key drivers. Use the best chart type for the answer.";

// Insight prompt guidance
export const INSIGHT_ANALYZE =
  "Summarize key findings and what the data shows. Highlight notable patterns or standout numbers. Be concise, 4-7 bullet points or short paragraphs.";
export const INSIGHT_FORECAST =
  "Interpret the trend and forecast. Mention what the projection suggests—e.g. if trend continues, what to expect. Give a brief actionable takeaway (e.g. capacity, planning).";
export const INSIGHT_SIMULATE =
  "Explain the what-if outcome. What would change? Is it realistic? Brief implications.";
export const INSIGHT_DIAGNOSE =
  "Explain likely root causes. What drove the change? Key factors to investigate.";
export const INSIGHT_MAX =
  "Provide a senior analyst summary: key drivers, risks, opportunities. Concise but comprehensive.";

export const INSIGHT_PROMPT_PREFIX = `You are a data analyst. Write a brief analysis (4-7 lines max) based on the data.

Mode: `;
export const INSIGHT_PROMPT_SUFFIX = `

Output plain text only, no markdown or bullets required.`;

// Schema ingestion LLM
export const PROMPT_SCHEMA_DESCRIPTIONS = `Given this database schema, write a one-line description (max 80 chars) for each table describing what it likely stores. Output JSON only: {"table_name": "description", ...}

Schema:
`;
export const PROMPT_SCHEMA_SYSTEM = "You are a database analyst. Output only valid JSON.";

// Diagnose prompts
export const DIAGNOSE_SYSTEM_PREFIX = `You are a diagnostic analyst. You investigate data issues by running MULTIPLE SQL queries across different tables to find root causes.

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

DATABASE: `;

export const DIAGNOSE_STEP_FIRST = `
Run your first diagnostic query. Focus on the main metric or comparison (e.g. revenue by month, bookings trend).`;

export const DIAGNOSE_STEP_FOLLOW_UP = `
Based on the above, either:
1. Run another query to investigate further (e.g. drill into a specific table, compare regions, check member/booking patterns)
2. Or output action: "finish" with your diagnosis_summary, root_causes, and recommendations.`;
