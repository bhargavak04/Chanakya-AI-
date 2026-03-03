/**
 * Mode-specific system prompts
 */
import {
  BASE_RULES,
  CHART_RULES,
  ID_RESOLUTION_RULES,
  JSON_STRUCTURE_TEMPLATE,
  MODE_ANALYZE,
  MODE_FORECAST,
  MODE_SIMULATE,
  MODE_DIAGNOSE_ANALYZE,
  MODE_MAX,
  FORECAST_CRITICAL,
  SIMULATE_INSTRUCTION,
  DIAGNOSE_INSTRUCTION,
  MAX_INSTRUCTION,
  INSIGHT_ANALYZE,
  INSIGHT_FORECAST,
  INSIGHT_SIMULATE,
  INSIGHT_DIAGNOSE,
  INSIGHT_MAX,
  INSIGHT_PROMPT_PREFIX,
  INSIGHT_PROMPT_SUFFIX,
} from "../../core/prompts.js";
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

const jsonStructure = (mode: ChatMode) => JSON_STRUCTURE_TEMPLATE(mode);

export function buildSystemPrompt(
  mode: ChatMode,
  schemaText: string,
  dbType: string,
  state?: ConversationState | null
): string {
  const ctx = stateContext(state);

  const modeInstructions: Record<ChatMode, string> = {
    analyze: `${MODE_ANALYZE}
${BASE_RULES}
3. Return this exact JSON structure:${jsonStructure("analyze")}
Answer the user's question with a single query and appropriate chart.`,
    forecast: `${MODE_FORECAST}
${BASE_RULES}
3. Return this exact JSON structure:${jsonStructure("forecast")}
${FORECAST_CRITICAL}`,
    simulate: `${MODE_SIMULATE}
${BASE_RULES}
3. Return this exact JSON structure:${jsonStructure("simulate")}
${SIMULATE_INSTRUCTION}`,
    diagnose: `${MODE_DIAGNOSE_ANALYZE}
${BASE_RULES}
3. Return this exact JSON structure:${jsonStructure("diagnose")}
${DIAGNOSE_INSTRUCTION}`,
    max: `${MODE_MAX}
${BASE_RULES}
3. Return this exact JSON structure:${jsonStructure("max")}
${MAX_INSTRUCTION}`,
  };

  const instructions = modeInstructions[mode] ?? modeInstructions.analyze;

  return `${instructions}
${ID_RESOLUTION_RULES}
${CHART_RULES}
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
    analyze: INSIGHT_ANALYZE,
    forecast: INSIGHT_FORECAST,
    simulate: INSIGHT_SIMULATE,
    diagnose: INSIGHT_DIAGNOSE,
    max: INSIGHT_MAX,
  };
  const guidance = modeGuidance[mode] ?? modeGuidance.analyze;
  return `${INSIGHT_PROMPT_PREFIX}${mode}
User question: ${userQuestion}

Data summary:
${dataSummary}

${guidance}
${INSIGHT_PROMPT_SUFFIX}`;
}
