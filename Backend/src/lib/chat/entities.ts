/**
 * Query decomposition: extract metrics, dimensions, time range from user question
 * before schema retrieval so the LLM gets explicit intent context
 */
import { getLLMProvider } from "../llm/index.js";

export interface QueryEntities {
  metrics: string[];
  dimensions: string[];
  time_range: string | null;
}

const ENTITIES_SYSTEM = `You are an analytics intent parser. From the user's question, extract:
1. metrics - what they want to measure (e.g. revenue, sales, orders, count, bookings, conversions)
2. dimensions - what to break down or group by (e.g. product, country, region, category, customer, time)
3. time_range - if mentioned (e.g. last 30 days, this month, last year)
Output ONLY valid JSON: {"metrics": ["revenue"], "dimensions": ["product"], "time_range": "last 30 days" or null}
Use null for time_range if not mentioned. Use empty arrays if none.`;

export async function extractQueryEntities(userMessage: string): Promise<QueryEntities> {
  try {
    const llm = getLLMProvider();
    const result = await llm.generate({
      messages: [
        { role: "system", content: ENTITIES_SYSTEM },
        { role: "user", content: userMessage },
      ],
      jsonMode: true,
      temperature: 0,
      maxTokens: 256,
    });

    const parsed = JSON.parse(result.content) as { metrics?: unknown; dimensions?: unknown; time_range?: unknown };
    return {
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics.filter((m): m is string => typeof m === "string").slice(0, 5) : [],
      dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions.filter((d): d is string => typeof d === "string").slice(0, 5) : [],
      time_range: typeof parsed.time_range === "string" && parsed.time_range.trim() ? parsed.time_range.trim() : null,
    };
  } catch {
    return { metrics: [], dimensions: [], time_range: null };
  }
}

/** Format extracted entities for inclusion in system prompt */
export function formatEntitiesForPrompt(entities: QueryEntities): string {
  const parts: string[] = [];
  if (entities.metrics.length > 0) parts.push(`metrics: ${entities.metrics.join(", ")}`);
  if (entities.dimensions.length > 0) parts.push(`dimensions: ${entities.dimensions.join(", ")}`);
  if (entities.time_range) parts.push(`time: ${entities.time_range}`);
  if (parts.length === 0) return "";
  return `Detected intent: ${parts.join("; ")}. Prefer tables and columns that match these.`;
}
