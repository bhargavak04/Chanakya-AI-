/**
 * Mode-specific system prompts
 */
import type { ConversationState } from "../../types/index.js";

type ChatMode = "analyze" | "forecast" | "simulate" | "diagnose" | "max";

function stateContext(state?: ConversationState | null): string {
  if (!state) return "";
  return `
CONVERSATION CONTEXT (use for follow-up questions):
- Active DB: ${state.db_id}
- Last filters: ${JSON.stringify(state.filters)}
- Last date range: ${state.date_range ?? "none"}
- Last metric: ${state.last_metric ?? "none"}
`;
}

const baseRules = `
1. Use ONLY the tables and columns provided. If a column does not exist, return: {"error": "Column X does not exist in schema"}
2. Output ONLY SELECT queries. No INSERT, UPDATE, DELETE, DROP, etc. Always add LIMIT 1000 if not present.
3. Return valid JSON only, no markdown or explanation.`;

const idResolutionRules = `
ID/NAME RESOLUTION (critical):
- All id columns (venue_id, member_id, plan_id, etc.) are UUIDs. Users NEVER know or provide UUIDs.
- When users refer to entities by name (e.g. "venue 1", "my venue", "Venue Manhattan", "member John"), ALWAYS filter by the human-readable name column, NOT by id.
- Use ILIKE (PostgreSQL) or LIKE (MySQL) with % wildcards for flexible, case-insensitive matching:
  - "venue 1" -> WHERE v.name ILIKE '%venue 1%'  or  WHERE venue_id = (SELECT id FROM venues WHERE name ILIKE '%venue 1%' LIMIT 1)
  - "my venue" -> WHERE v.name ILIKE '%my venue%'
- Name columns: venues.name, members.name, tournaments.name, membership_plans.name. JOIN and filter by these when users mention entities.
- Use LIMIT 1 in subqueries when resolving to a single ID.`;

const chartRules = `
CHART TYPE RULES:
- Use "line" or "area" for time series
- Use "bar" for categorical comparisons
- Use "pie" for composition/parts of whole
- Use "table" when user asks for raw data or list`;

const jsonStructure = (mode: ChatMode) => `
{
  "mode": "${mode}",
  "query": "SELECT ... (valid SQL)",
  "chart": {
    "type": "line" | "bar" | "area" | "pie" | "table",
    "x_axis": "column_name",
    "y_axis": ["column1", "column2"],
    "group_by": ["optional_group_column"],
    "time_granularity": "day" | "week" | "month" (if time series)
  }
}`;

export function buildSystemPrompt(
  mode: ChatMode,
  schemaText: string,
  dbType: string,
  state?: ConversationState | null
): string {
  const ctx = stateContext(state);

  const modeInstructions: Record<ChatMode, string> = {
    analyze: `You are a SQL analyst. Output ONLY valid JSON.
${baseRules}
3. Return this exact JSON structure:${jsonStructure("analyze")}
Answer the user's question with a single query and appropriate chart.`,
    forecast: `You are a SQL analyst for forecasting. Output ONLY valid JSON.
${baseRules}
3. Return this exact JSON structure:${jsonStructure("forecast")}
CRITICAL: We CANNOT query future data. When the user asks to "forecast next 7 days" or similar:
- Return a query that fetches HISTORICAL data (e.g. last 30-90 days, or last few months)
- The system will use this historical series to compute predictions
- Use date_trunc for grouping by day/week/month. Include a date column and a numeric metric (e.g. SUM(amount), COUNT(*))
- Example: "forecast revenue next 7 days" -> query LAST 30-60 days of daily revenue; we predict forward from that`,
    simulate: `You are a SQL analyst for what-if simulation. Output ONLY valid JSON.
${baseRules}
3. Return this exact JSON structure:${jsonStructure("simulate")}
Generate a baseline query that returns metrics. User may ask "what if X increases by Y%". Return the base query; we will apply adjustments server-side.`,
    diagnose: `You are a SQL analyst for diagnosis. Output ONLY valid JSON.
${baseRules}
3. Return this exact JSON structure:${jsonStructure("diagnose")}
Generate a comparison query: current period vs previous period, or breakdowns to find causes. Prefer bar or table for comparisons.`,
    max: `You are a senior SQL analyst doing comprehensive analysis. Output ONLY valid JSON.
${baseRules}
3. Return this exact JSON structure:${jsonStructure("max")}
Provide the most insightful query for the question: analyze, compare, and surface key drivers. Use the best chart type for the answer.`,
  };

  const instructions = modeInstructions[mode] ?? modeInstructions.analyze;

  return `${instructions}
${idResolutionRules}
${chartRules}
${ctx}

DATABASE: ${dbType}

SCHEMA:
${schemaText}`;
}

export function buildInsightPrompt(
  mode: ChatMode,
  dataSummary: string,
  userQuestion: string
): string {
  const modeGuidance: Record<ChatMode, string> = {
    analyze: "Summarize key findings and what the data shows. Highlight notable patterns or standout numbers. Be concise, 4-7 bullet points or short paragraphs.",
    forecast: "Interpret the trend and forecast. Mention what the projection suggests—e.g. if trend continues, what to expect. Give a brief actionable takeaway (e.g. capacity, planning).",
    simulate: "Explain the what-if outcome. What would change? Is it realistic? Brief implications.",
    diagnose: "Explain likely root causes. What drove the change? Key factors to investigate.",
    max: "Provide a senior analyst summary: key drivers, risks, opportunities. Concise but comprehensive.",
  };
  const guidance = modeGuidance[mode] ?? modeGuidance.analyze;
  return `You are a data analyst. Write a brief analysis (4-7 lines max) based on the data.

Mode: ${mode}
User question: ${userQuestion}

Data summary:
${dataSummary}

${guidance}
Output plain text only, no markdown or bullets required.`;
}
