/**
 * Chat pipeline - LLM -> Validate -> Execute -> Response
 * Diagnose mode: multi-step agent loop
 */
import { getLLMProvider } from "../llm/index.js";
import { buildSystemPrompt, buildInsightPrompt } from "../llm/prompts.js";
import { getSchemaForQuery, getSchemaForDb, formatSchemaForPrompt, getJoinsForTables } from "../schema/retrieval.js";
import { ensureConnectedTables } from "../schema/joinGraph.js";
import { extractQueryEntities, formatEntitiesForPrompt } from "./entities.js";
import { validateAndSanitize } from "../sql/validator.js";
import { executeQuery } from "../sql/executor.js";
import { getConnectionConfig } from "../db/connections.js";
import { computeForecast, parseForecastHorizon, runProphetForecast } from "./forecast.js";
import {
  buildDiagnoseSystemPrompt,
  buildDiagnoseStepPrompt,
  buildDiagnosePlanFirstPrompt,
  buildDiagnoseExecuteStepPrompt,
  parseDiagnoseStep,
} from "./diagnose.js";
import {
  buildMaxSystemPrompt,
  buildMaxPlanFirstPrompt,
  buildMaxExecuteStepPrompt,
  buildMaxStepPrompt,
  parseMaxStep,
  MAX_MAX_STEPS,
} from "./max.js";
import { LOG_PREFIX, MAX_DIAGNOSE_STEPS, MAX_SQL_ATTEMPTS } from "../../core/constants.js";
import { DIAGNOSE_FORCE_FINISH } from "../../core/prompts.js";
import {
  ERR_DATABASE_NOT_FOUND,
  ERR_INVALID_LLM_OUTPUT,
  ERR_PARSE_LLM_JSON,
  ERR_NO_SCHEMA,
  ERR_LLM_REQUEST_FAILED,
  ERR_LLM_RETRY_FAILED,
  ERR_SQL_VALIDATION_FAILED,
  ERR_QUERY_EXECUTION_FAILED,
  ERR_QUERY_FAILED,
  ERR_DIAGNOSE_MAX_STEPS,
  MSG_NO_DATA,
  MSG_SEE_CHART_DETAILS,
  buildFixSqlRetryMessage,
} from "../../core/strings.js";
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
    return { error: ERR_INVALID_LLM_OUTPUT };
  } catch {
    return { error: ERR_PARSE_LLM_JSON };
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

/** When we have a forecast segment, label history vs predicted so the LLM knows which is which. */
function buildForecastDataSummary(
  data: Record<string, unknown>[],
  chartConfig: ChartConfig,
  forecastStartIndex: number
): string {
  if (data.length === 0) return "No data returned.";
  const history = data.slice(0, forecastStartIndex);
  const forecast = data.slice(forecastStartIndex);
  const historySummary = buildDataSummary(history, chartConfig);
  const forecastSummary = buildDataSummary(forecast, chartConfig);
  return `HISTORICAL DATA (rows 1–${forecastStartIndex}, from the database): ${historySummary}

FORECAST / PREDICTED DATA (rows ${forecastStartIndex + 1}–${data.length}, from the forecasting model): ${forecastSummary}

The forecast segment is model output, not raw data. Interpret the historical trend and what the predicted segment implies.`;
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
      maxTokens: 600,
    });
    const text = result.content.trim();
    const lines = text
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter((s) => s.length > 10);
    return lines.length > 0 ? lines.slice(0, 12) : [text.slice(0, 500) || MSG_SEE_CHART_DETAILS];
  } catch {
    return [];
  }
}

function formatQueryError(err: unknown): string {
  const e = err as { message?: string; detail?: string; hint?: string };
  let msg = (e?.message as string) ?? ERR_QUERY_EXECUTION_FAILED;
  if (e?.detail) msg += `\nDetail: ${e.detail}`;
  if (e?.hint) msg += `\nHint: ${e.hint}`;
  return msg;
}

async function runDiagnosePipeline(
  dbId: string,
  message: string,
  config: { name: string; type: string }
): Promise<ChatResponseSuccess | ChatResponseError> {
  const entities = await extractQueryEntities(message);
  const tables = getSchemaForDb(dbId);
  const joins = getJoinsForTables(dbId, tables.map((t) => t.id));
  const schemaText =
    formatSchemaForPrompt(tables) +
    (joins.length > 0 ? "\n\nAvailable joins:\n" + joins.join("\n") : "");
  const intentContext = formatEntitiesForPrompt(entities);
  const systemPrompt = buildDiagnoseSystemPrompt(schemaText, config.type, intentContext);
  const llm = getLLMProvider();
  const steps: { query: string; resultSummary: string }[] = [];
  let lastRows: Record<string, unknown>[] = [];
  let lastChart: ChartConfig = { type: "table", x_axis: "", y_axis: [] };
  let totalQueryTimeMs = 0;
  const allQueries: string[] = [];

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildDiagnosePlanFirstPrompt(message) },
  ];

  let planSteps: string[] | null = null;
  let diagnoseRetryRequested = false;

  for (let i = 0; i < MAX_DIAGNOSE_STEPS; i++) {
    let content: string;
    try {
      const res = await llm.generate({
        messages,
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 1024,
      });
      content = res.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LLM request failed";
      return { error: { type: "llm_error", message: msg } };
    }

    const parsed = parseDiagnoseStep(content);
    if ("error" in parsed) {
      return { error: { type: "invalid_query", message: parsed.error } };
    }

    if (parsed.action === "plan") {
      planSteps = parsed.steps;
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content: buildDiagnoseExecuteStepPrompt(planSteps, 0, []),
      });
      continue;
    }

    if (parsed.action === "finish") {
      const insights: string[] = [parsed.diagnosis_summary];
      if (parsed.root_causes.length > 0) {
        insights.push("", "Root causes:", ...parsed.root_causes.map((c) => `• ${c}`));
      }
      if (parsed.recommendations.length > 0) {
        insights.push("", "Recommendations:", ...parsed.recommendations.map((r) => `• ${r}`));
      }

      return {
        mode: "diagnose",
        title: generateTitle(message, parsed.chart),
        data: lastRows,
        chart_config: lastRows.length > 0 ? parsed.chart : lastChart,
        insights,
        badges: [],
        export: { csv_available: true, excel_available: true },
        meta: {
          db_source: config.name,
          query_time_ms: totalQueryTimeMs,
          sql: allQueries[allQueries.length - 1],
          diagnostic_queries: allQueries,
          queries_executed: allQueries.length,
        },
        diagnosis_summary: parsed.diagnosis_summary,
        root_causes: parsed.root_causes,
        recommendations: parsed.recommendations,
      };
    }

    const validation = validateAndSanitize(parsed.query, config.type as DbType);
    const nextUserContent = () =>
      planSteps !== null
        ? buildDiagnoseExecuteStepPrompt(planSteps, steps.length, steps)
        : buildDiagnoseStepPrompt(message, steps);

    if (!validation.valid) {
      steps.push({
        query: parsed.query,
        resultSummary: `Error: ${validation.error ?? ERR_SQL_VALIDATION_FAILED}. Fix the query and try again.`,
      });
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: nextUserContent() });
      continue;
    }

    allQueries.push(validation.sql!);
    let rows: Record<string, unknown>[];
    let queryTimeMs: number;
    try {
      const result = await executeQuery(dbId, validation.sql!);
      rows = result.rows;
      queryTimeMs = result.durationMs;
      totalQueryTimeMs += queryTimeMs;
      diagnoseRetryRequested = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : ERR_QUERY_FAILED;
      console.error(`${LOG_PREFIX} Diagnose query failed:`, err);
      steps.push({ query: parsed.query, resultSummary: `Error: ${msg}` });
      messages.push({ role: "assistant", content });
      if (!diagnoseRetryRequested) {
        diagnoseRetryRequested = true;
        allQueries.pop();
        steps.pop();
        messages.push({
          role: "user",
          content: `The previous query failed: ${msg}. Fix the SQL and output action: "query" with the corrected query only (same step).`,
        });
        continue;
      }
      diagnoseRetryRequested = false;
      messages.push({ role: "user", content: nextUserContent() });
      continue;
    }

    lastRows = rows;
    lastChart = parsed.chart;
    const summary = buildDataSummary(rows, parsed.chart);
    steps.push({ query: parsed.query, resultSummary: summary });
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: nextUserContent() });
  }

  if (steps.length > 0) {
    messages.push({ role: "user", content: DIAGNOSE_FORCE_FINISH });
    try {
      const res = await llm.generate({
        messages,
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 1024,
      });
      const parsed = parseDiagnoseStep(res.content);
      if (!("error" in parsed) && parsed.action === "finish") {
        const insights: string[] = [parsed.diagnosis_summary];
        if (parsed.root_causes.length > 0) {
          insights.push("", "Root causes:", ...parsed.root_causes.map((c) => `• ${c}`));
        }
        if (parsed.recommendations.length > 0) {
          insights.push("", "Recommendations:", ...parsed.recommendations.map((r) => `• ${r}`));
        }
        return {
          mode: "diagnose",
          title: generateTitle(message, parsed.chart),
          data: lastRows,
          chart_config: lastRows.length > 0 ? parsed.chart : lastChart,
          insights,
          badges: [],
          export: { csv_available: true, excel_available: true },
          meta: {
            db_source: config.name,
            query_time_ms: totalQueryTimeMs,
            sql: allQueries[allQueries.length - 1],
            diagnostic_queries: allQueries,
            queries_executed: allQueries.length,
          },
          diagnosis_summary: parsed.diagnosis_summary,
          root_causes: parsed.root_causes,
          recommendations: parsed.recommendations,
        };
      }
    } catch {
      // ignore; fall through to fallback
    }
  }

  return {
    mode: "diagnose",
    title: generateTitle(message, lastChart),
    data: lastRows,
    chart_config: lastChart,
    insights: [
      ERR_DIAGNOSE_MAX_STEPS,
      lastRows.length > 0 ? buildDataSummary(lastRows, lastChart) : MSG_NO_DATA,
    ],
    badges: [],
    export: { csv_available: true, excel_available: true },
    meta: {
      db_source: config.name,
      query_time_ms: totalQueryTimeMs,
      sql: allQueries[allQueries.length - 1],
      diagnostic_queries: allQueries,
      queries_executed: allQueries.length,
    },
  };
}

async function runMaxPipeline(
  dbId: string,
  message: string,
  config: { name: string; type: string }
): Promise<ChatResponseSuccess | ChatResponseError> {
  const entities = await extractQueryEntities(message);
  const tables = getSchemaForDb(dbId);
  const joins = getJoinsForTables(dbId, tables.map((t) => t.id));
  const schemaText =
    formatSchemaForPrompt(tables) +
    (joins.length > 0 ? "\n\nAvailable joins:\n" + joins.join("\n") : "");
  const intentContext = formatEntitiesForPrompt(entities);
  const systemPrompt = buildMaxSystemPrompt(schemaText, config.type, intentContext);
  const llm = getLLMProvider();
  const steps: { query: string; resultSummary: string }[] = [];
  let lastRows: Record<string, unknown>[] = [];
  let lastChart: ChartConfig = { type: "table", x_axis: "", y_axis: [] };
  let totalQueryTimeMs = 0;
  const allQueries: string[] = [];

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildMaxPlanFirstPrompt(message) },
  ];

  let planSteps: string[] | null = null;

  for (let i = 0; i < MAX_MAX_STEPS; i++) {
    let content: string;
    try {
      const res = await llm.generate({
        messages,
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 1024,
      });
      content = res.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LLM request failed";
      return { error: { type: "llm_error", message: msg } };
    }

    const parsed = parseMaxStep(content);
    if ("error" in parsed) {
      return { error: { type: "invalid_query", message: parsed.error } };
    }

    if (parsed.action === "plan") {
      planSteps = parsed.steps;
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content: buildMaxExecuteStepPrompt(planSteps, 0, []),
      });
      continue;
    }

    if (parsed.action === "finish") {
      const insights: string[] = [parsed.analysis_summary];
      if (parsed.key_findings.length > 0) {
        insights.push("", "Key findings:", ...parsed.key_findings.map((f) => `• ${f}`));
      }

      return {
        mode: "max",
        title: generateTitle(message, parsed.chart),
        data: lastRows,
        chart_config: lastRows.length > 0 ? parsed.chart : lastChart,
        insights,
        badges: [],
        export: { csv_available: true, excel_available: true },
        meta: {
          db_source: config.name,
          query_time_ms: totalQueryTimeMs,
          sql: allQueries[allQueries.length - 1],
          diagnostic_queries: allQueries,
          queries_executed: allQueries.length,
        },
        analysis_summary: parsed.analysis_summary,
        key_findings: parsed.key_findings,
      };
    }

    const validation = validateAndSanitize(parsed.query, config.type as DbType);
    const nextUserContent = () =>
      planSteps !== null
        ? buildMaxExecuteStepPrompt(planSteps, steps.length, steps)
        : buildMaxStepPrompt(message, steps);

    if (!validation.valid) {
      steps.push({
        query: parsed.query,
        resultSummary: `Error: ${validation.error ?? ERR_SQL_VALIDATION_FAILED}. Fix the query and try again.`,
      });
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: nextUserContent() });
      continue;
    }

    allQueries.push(validation.sql!);
    let rows: Record<string, unknown>[];
    try {
      const result = await executeQuery(dbId, validation.sql!);
      rows = result.rows;
      totalQueryTimeMs += result.durationMs;
    } catch (err) {
      const msg = err instanceof Error ? err.message : ERR_QUERY_FAILED;
      console.error(`${LOG_PREFIX} Max query failed:`, err);
      steps.push({ query: parsed.query, resultSummary: `Error: ${msg}` });
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: nextUserContent() });
      continue;
    }

    lastRows = rows;
    lastChart = parsed.chart;
    const summary = buildDataSummary(rows, parsed.chart);
    steps.push({ query: parsed.query, resultSummary: summary });
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: nextUserContent() });
  }

  return {
    mode: "max",
    title: generateTitle(message, lastChart),
    data: lastRows,
    chart_config: lastChart,
    insights: [
      "Max analysis reached step limit.",
      lastRows.length > 0 ? buildDataSummary(lastRows, lastChart) : MSG_NO_DATA,
    ],
    badges: [],
    export: { csv_available: true, excel_available: true },
    meta: {
      db_source: config.name,
      query_time_ms: totalQueryTimeMs,
      sql: allQueries[allQueries.length - 1],
      diagnostic_queries: allQueries,
      queries_executed: allQueries.length,
    },
  };
}

export async function runChatPipeline(input: ChatInput): Promise<ChatResponseSuccess | ChatResponseError> {
  const { dbId, message, mode = "analyze", conversationState } = input;

  console.log(`${LOG_PREFIX} Input:`, { dbId, message, mode, hasConversationState: !!conversationState });

  const config = getConnectionConfig(dbId);
  if (!config) {
    return { error: { type: "not_found", message: ERR_DATABASE_NOT_FOUND } };
  }

  if (mode === "diagnose") {
    const tables = getSchemaForDb(dbId);
    if (tables.length === 0) {
      return { error: { type: "no_schema", message: ERR_NO_SCHEMA } };
    }
    return runDiagnosePipeline(dbId, message, config);
  }

  if (mode === "max") {
    const tables = getSchemaForDb(dbId);
    if (tables.length === 0) {
      return { error: { type: "no_schema", message: ERR_NO_SCHEMA } };
    }
    return runMaxPipeline(dbId, message, config);
  }

  const [entities, tablesRaw] = await Promise.all([
    extractQueryEntities(message),
    getSchemaForQuery(dbId, message),
  ]);
  if (tablesRaw.length === 0) {
    return { error: { type: "no_schema", message: ERR_NO_SCHEMA } };
  }

  const tableIds = tablesRaw.map((t) => t.id);
  const connectedIds = ensureConnectedTables(dbId, tableIds);
  const tables = connectedIds.length < tableIds.length
    ? tablesRaw.filter((t) => connectedIds.includes(t.id))
    : tablesRaw;

  const schemaText =
    formatSchemaForPrompt(tables) +
    (() => {
      const joins = getJoinsForTables(dbId, tables.map((t) => t.id));
      return joins.length > 0 ? "\n\nAvailable joins:\n" + joins.join("\n") : "";
    })();
  const intentContext = formatEntitiesForPrompt(entities);
  const systemPrompt = buildSystemPrompt(mode, schemaText, config.type, conversationState, intentContext);

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
    const msg = err instanceof Error ? err.message : ERR_LLM_REQUEST_FAILED;
    return { error: { type: "llm_error", message: msg } };
  }

  console.log(`${LOG_PREFIX} LLM raw output:`, llmResult.content);

  let parsed = parseLLMOutput(llmResult.content);
  if ("error" in parsed) {
    return { error: { type: "invalid_query", message: parsed.error } };
  }

  let validation = validateAndSanitize(parsed.query, config.type as DbType);
  if (!validation.valid) {
    return { error: { type: "invalid_sql", message: validation.error ?? ERR_SQL_VALIDATION_FAILED } };
  }

  console.log(`${LOG_PREFIX} LLM parsed JSON:`, JSON.stringify(parsed, null, 2));
  console.log(`${LOG_PREFIX} SQL generated:`, validation.sql);

  let rows!: Record<string, unknown>[];
  let queryTimeMs!: number;
  let currentParsed = parsed;
  let currentValidation = validation;

  for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
    try {
      const result = await executeQuery(dbId, currentValidation.sql!);
      rows = result.rows;
      queryTimeMs = result.durationMs;
      break;
    } catch (err) {
      const formattedError = formatQueryError(err);
      console.error(`${LOG_PREFIX} Query attempt ${attempt}/${MAX_SQL_ATTEMPTS} failed:`, formattedError);

      if (attempt >= MAX_SQL_ATTEMPTS) {
        return { error: { type: "query_error", message: formattedError } };
      }

      const retryUserContent = buildFixSqlRetryMessage(currentValidation.sql ?? "", formattedError);
      try {
        const retryResult = await llm.generate({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
            { role: "user", content: retryUserContent },
          ],
          jsonMode: true,
          temperature: 0.1,
        });
        console.log(`${LOG_PREFIX} LLM retry output:`, retryResult.content);
        const retryParsed = parseLLMOutput(retryResult.content);
        if ("error" in retryParsed) {
          return { error: { type: "invalid_query", message: retryParsed.error } };
        }
        const retryValidation = validateAndSanitize(retryParsed.query, config.type as DbType);
        if (!retryValidation.valid) {
          return { error: { type: "invalid_sql", message: retryValidation.error ?? "SQL validation failed" } };
        }
        currentParsed = retryParsed;
        currentValidation = retryValidation;
        console.log(`${LOG_PREFIX} SQL retry generated:`, currentValidation.sql);
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : ERR_LLM_RETRY_FAILED;
        return { error: { type: "llm_error", message: msg } };
      }
    }
  }

  parsed = currentParsed;
  validation = currentValidation;

  console.log(`${LOG_PREFIX} Results: rows=${rows.length}, head=`, JSON.stringify(rows.slice(0, 5), null, 2));

  const chartConfig: ChartConfig = {
    type: parsed.chart.type ?? "table",
    x_axis: parsed.chart.x_axis ?? "",
    y_axis: Array.isArray(parsed.chart.y_axis) ? parsed.chart.y_axis : [],
    group_by: parsed.chart.group_by,
    time_granularity: parsed.chart.time_granularity,
    stacked: parsed.chart.stacked,
    y_axis_right: Array.isArray(parsed.chart.y_axis_right) ? parsed.chart.y_axis_right : undefined,
    reference_line:
      parsed.chart.reference_line &&
      typeof parsed.chart.reference_line === "object" &&
      typeof (parsed.chart.reference_line as { value?: unknown }).value === "number"
        ? {
            value: (parsed.chart.reference_line as { value: number }).value,
            label: typeof (parsed.chart.reference_line as { label?: unknown }).label === "string"
              ? (parsed.chart.reference_line as { label: string }).label
              : undefined,
          }
        : undefined,
  };

  let finalRows = rows;
  let forecast_start_index: number | undefined;
  let forecast_upper: number[] | undefined;
  let forecast_lower: number[] | undefined;

  if (mode === "forecast" && rows.length >= 2) {
    const keys = Object.keys(rows[0] ?? {});
    const findKey = (name: string) => keys.find((k) => k === name || k.toLowerCase() === name.toLowerCase());
    const xKey = findKey(chartConfig.x_axis) ?? keys[0] ?? "";
    const yKey = findKey(chartConfig.y_axis?.[0] ?? "") ?? keys.filter((k) => k !== xKey)[0] ?? "";
    const horizon = parseForecastHorizon(message);

    const prophetResult = await runProphetForecast(rows, xKey, yKey, horizon.periods, horizon.unit);
    if (prophetResult) {
      finalRows = prophetResult.rows;
      forecast_start_index = prophetResult.forecast_start_index;
      forecast_upper = prophetResult.forecast_upper;
      forecast_lower = prophetResult.forecast_lower;
    } else {
      const { rows: withForecast } = computeForecast(rows, xKey, yKey, horizon.periods, horizon.unit);
      finalRows = withForecast;
    }
  }

  const dataSummary =
    mode === "forecast" && forecast_start_index != null && forecast_start_index > 0
      ? buildForecastDataSummary(finalRows, chartConfig, forecast_start_index)
      : buildDataSummary(finalRows, chartConfig);
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
  if (forecast_start_index !== undefined) {
    response.forecast_start_index = forecast_start_index;
    if (forecast_upper) response.forecast_upper = forecast_upper;
    if (forecast_lower) response.forecast_lower = forecast_lower;
  }

  return response;
}
