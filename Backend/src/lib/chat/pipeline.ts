/**
 * Chat pipeline - LLM -> Validate -> Execute -> Response
 */
import { getLLMProvider } from "../llm/index.js";
import { buildSystemPrompt, buildInsightPrompt } from "../llm/prompts.js";
import { getSchemaForDb, formatSchemaForPrompt } from "../schema/retrieval.js";
import { validateAndSanitize } from "../sql/validator.js";
import { executeQuery } from "../sql/executor.js";
import { getConnectionConfig } from "../db/connections.js";
import { computeForecast, parseForecastDays } from "./forecast.js";
import type { LLMAnalyzeOutput, ChartConfig, ChatResponseSuccess, ChatResponseError, ConversationState } from "../../types/index.js";
import type { DbType } from "../../types/index.js";

export type ChatMode = "analyze" | "forecast" | "simulate" | "diagnose" | "max";

export interface ChatInput {
  conversationId: string;
  dbId: string;
  message: string;
  mode?: ChatMode;
  conversationState?: ConversationState | null;
}

function parseLLMOutput(content: string): LLMAnalyzeOutput | { error: string } {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error?: string }).error === "string") {
      return { error: (parsed as { error: string }).error };
    }
    if (parsed && typeof parsed === "object" && "mode" in parsed && "query" in parsed && "chart" in parsed) {
      return parsed as LLMAnalyzeOutput;
    }
    return { error: "Invalid LLM output structure" };
  } catch {
    return { error: "Failed to parse LLM response as JSON" };
  }
}

function generateTitle(message: string, chartConfig: ChartConfig): string {
  // Simple heuristic - use first 50 chars of message or default
  const cleaned = message.slice(0, 50).trim();
  if (cleaned.length > 5) return cleaned.replace(/\?$/, "");
  const yLabel = chartConfig.y_axis?.[0] ?? "data";
  const xLabel = chartConfig.x_axis ?? "dimension";
  return `${yLabel} by ${xLabel}`;
}

function buildDataSummary(data: Record<string, unknown>[], chartConfig: ChartConfig): string {
  if (data.length === 0) return "No data returned.";
  const keys = Object.keys(data[0] ?? {});
  const xKey = chartConfig.x_axis ? keys.find((k) => k.toLowerCase() === chartConfig.x_axis.toLowerCase()) ?? keys[0] : keys[0];
  const yKey = chartConfig.y_axis?.[0] ? keys.find((k) => k.toLowerCase() === chartConfig.y_axis[0].toLowerCase()) ?? keys[1] : keys[1];
  let summary = `Rows: ${data.length}. Columns: ${keys.join(", ")}.`;
  if (yKey && data.some((r) => typeof r[yKey] === "number")) {
    const vals = data.map((r) => Number(r[yKey])).filter((n) => !Number.isNaN(n));
    if (vals.length > 0) {
      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = sum / vals.length;
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      summary += ` ${yKey}: total ${sum.toLocaleString()}, avg ${avg.toFixed(2)}, range ${min}-${max}.`;
    }
  }
  const sample = data.slice(0, 3).map((r) => JSON.stringify(r));
  summary += ` Sample: ${sample.join("; ")}`;
  return summary;
}

async function generateAiInsights(
  mode: ChatMode,
  dataSummary: string,
  userQuestion: string
): Promise<string[]> {
  try {
    const llm = getLLMProvider();
    const result = await llm.generate({
      messages: [
        { role: "user", content: buildInsightPrompt(mode, dataSummary, userQuestion) },
      ],
      temperature: 0.3,
      maxTokens: 400,
    });
    const text = result.content.trim();
    const lines = text
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter((s) => s.length > 10);
    return lines.length > 0 ? lines.slice(0, 8) : [text.slice(0, 500) || "See chart and table for details."];
  } catch {
    return [];
  }
}

const LOG_PREFIX = "[CHAT]";

export async function runChatPipeline(input: ChatInput): Promise<ChatResponseSuccess | ChatResponseError> {
  const { dbId, message, mode = "analyze", conversationState } = input;

  console.log(`${LOG_PREFIX} Input:`, { dbId, message, mode, hasConversationState: !!conversationState });

  const config = getConnectionConfig(dbId);
  if (!config) {
    return { error: { type: "not_found", message: "Database not found" } };
  }

  const tables = getSchemaForDb(dbId);
  if (tables.length === 0) {
    return { error: { type: "no_schema", message: "Schema not ingested. Add database and run schema ingestion first." } };
  }

  const schemaText = formatSchemaForPrompt(tables);
  const systemPrompt = buildSystemPrompt(mode, schemaText, config.type, conversationState);

  const llm = getLLMProvider();
  let llmResult: { content: string };
  try {
    llmResult = await llm.generate({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      jsonMode: true,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM request failed";
    return { error: { type: "llm_error", message: msg } };
  }

  console.log(`${LOG_PREFIX} LLM raw output:`, llmResult.content);

  const parsed = parseLLMOutput(llmResult.content);
  if ("error" in parsed) {
    return { error: { type: "invalid_query", message: parsed.error } };
  }

  const validation = validateAndSanitize(parsed.query, config.type as DbType);
  if (!validation.valid) {
    return { error: { type: "invalid_sql", message: validation.error ?? "SQL validation failed" } };
  }

  console.log(`${LOG_PREFIX} LLM parsed JSON:`, JSON.stringify(parsed, null, 2));
  console.log(`${LOG_PREFIX} SQL generated:`, validation.sql);

  let rows: Record<string, unknown>[];
  let queryTimeMs: number;
  try {
    const result = await executeQuery(dbId, validation.sql!);
    rows = result.rows;
    queryTimeMs = result.durationMs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query execution failed";
    return { error: { type: "query_error", message: msg } };
  }

  console.log(`${LOG_PREFIX} Results: rows=${rows.length}, head=`, JSON.stringify(rows.slice(0, 5), null, 2));

  const chartConfig: ChartConfig = {
    type: parsed.chart.type ?? "table",
    x_axis: parsed.chart.x_axis ?? "",
    y_axis: Array.isArray(parsed.chart.y_axis) ? parsed.chart.y_axis : [],
    group_by: parsed.chart.group_by,
    time_granularity: parsed.chart.time_granularity,
  };

  let finalRows = rows;

  if (mode === "forecast" && rows.length >= 2) {
    const keys = Object.keys(rows[0] ?? {});
    const findKey = (name: string) => keys.find((k) => k === name || k.toLowerCase() === name.toLowerCase());
    const xKey = findKey(chartConfig.x_axis) ?? keys[0] ?? "";
    const yKey = findKey(chartConfig.y_axis?.[0] ?? "") ?? keys.filter((k) => k !== xKey)[0] ?? "";
    const forecastDays = parseForecastDays(message);
    const { rows: withForecast } = computeForecast(rows, xKey, yKey, forecastDays);
    finalRows = withForecast;
  }

  const dataSummary = buildDataSummary(finalRows, chartConfig);
  const aiInsights = await generateAiInsights(mode, dataSummary, message);
  const insights =
    aiInsights.length > 0
      ? aiInsights
      : [`Query returned ${finalRows.length} row${finalRows.length === 1 ? "" : "s"}.`];

  const response: ChatResponseSuccess = {
    mode,
    title: generateTitle(message, chartConfig),
    data: finalRows,
    chart_config: chartConfig,
    insights,
    badges: [],
    export: { csv_available: true, excel_available: true },
    meta: {
      db_source: config.name,
      query_time_ms: queryTimeMs,
      sql: validation.sql,
    },
  };

  return response;
}
