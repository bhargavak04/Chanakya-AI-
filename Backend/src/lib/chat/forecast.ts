/**
 * Forecast: Prophet (via optional service) or fallback to simple linear regression.
 * Horizon parsing supports days, weeks, months, years from natural language.
 */
import { getConfig } from "../../config.js";
import { LOG_PREFIX } from "../../core/constants.js";
import { callForecastService } from "../forecast/client.js";

export type ForecastUnit = "day" | "week" | "month" | "year";

export interface ForecastHorizon {
  periods: number;
  unit: ForecastUnit;
}

/** Map unit to Prophet/pandas freq: D=day, W=week, MS=month start, YS=year start */
export const UNIT_TO_FREQ: Record<ForecastUnit, string> = {
  day: "D",
  week: "W",
  month: "MS",
  year: "YS",
};

/**
 * Parse forecast horizon from user message: "next 6 months", "next 2 weeks", "next 7 days", "next 1 year", etc.
 * Returns periods and unit; defaults to 7 days if nothing matched.
 */
export function parseForecastHorizon(message: string): ForecastHorizon {
  const lower = message.toLowerCase().trim();

  // Years: "next 2 years", "2 years ahead", "next year" (1)
  const yearNext = lower.match(/next\s+(\d+)\s+years?\s*(?:ahead|forward|out)?/i);
  if (yearNext) {
    const n = Math.min(parseInt(yearNext[1]!, 10) || 1, 5);
    return { periods: n, unit: "year" };
  }
  const yearOne = lower.match(/(?:next|in)\s+year\s*(?:ahead|forward)?/i) || lower.match(/1\s+year\s*(?:ahead|forward)?/i);
  if (yearOne) return { periods: 1, unit: "year" };
  const yearsAhead = lower.match(/(\d+)\s+years?\s*(?:ahead|forward|out)?/i);
  if (yearsAhead) {
    const n = Math.min(parseInt(yearsAhead[1]!, 10) || 1, 5);
    return { periods: n, unit: "year" };
  }

  // Months: "next 6 months", "6 months ahead", "next month" (1), "quarter" (3)
  const monthNext = lower.match(/next\s+(\d+)\s+months?\s*(?:ahead|forward|out)?/i);
  if (monthNext) {
    const n = Math.min(parseInt(monthNext[1]!, 10) || 1, 24);
    return { periods: n, unit: "month" };
  }
  const monthOne = lower.match(/(?:next|in)\s+month\s*(?:ahead|forward)?/i) || lower.match(/1\s+month\s*(?:ahead|forward)?/i);
  if (monthOne) return { periods: 1, unit: "month" };
  const quarter = lower.match(/quarter|3\s+months?\s*(?:ahead|forward)?/i);
  if (quarter) return { periods: 3, unit: "month" };
  const monthsAhead = lower.match(/(\d+)\s+months?\s*(?:ahead|forward|out)?/i);
  if (monthsAhead) {
    const n = Math.min(parseInt(monthsAhead[1]!, 10) || 1, 24);
    return { periods: n, unit: "month" };
  }

  // Weeks: "next 4 weeks", "2 weeks ahead", "next week" (1)
  const weekNext = lower.match(/next\s+(\d+)\s+weeks?\s*(?:ahead|forward|out)?/i);
  if (weekNext) {
    const n = Math.min(parseInt(weekNext[1]!, 10) || 1, 52);
    return { periods: n, unit: "week" };
  }
  const weekOne = lower.match(/(?:next|in)\s+week\s*(?:ahead|forward)?/i) || lower.match(/1\s+week\s*(?:ahead|forward)?/i);
  if (weekOne) return { periods: 1, unit: "week" };
  const weeksAhead = lower.match(/(\d+)\s+weeks?\s*(?:ahead|forward|out)?/i);
  if (weeksAhead) {
    const n = Math.min(parseInt(weeksAhead[1]!, 10) || 1, 52);
    return { periods: n, unit: "week" };
  }

  // Days: "next 7 days", "30 days ahead", "next 90 days", etc.
  const dayNext = lower.match(/next\s+(\d+)\s+days?\s*(?:ahead|forward|out)?/i);
  if (dayNext) {
    const n = Math.min(parseInt(dayNext[1]!, 10) || 7, 365);
    return { periods: n, unit: "day" };
  }
  const daysAhead = lower.match(/(\d+)\s+days?\s*(?:ahead|forward|out)?/i);
  if (daysAhead) {
    const n = Math.min(parseInt(daysAhead[1]!, 10) || 7, 365);
    return { periods: n, unit: "day" };
  }
  const dayPhrases = [
    { pattern: /next\s+week\s*(?:ahead|forward)?/i, n: 7 },
    { pattern: /next\s+(?:few\s+)?days?/i, n: 7 },
    { pattern: /next\s+month\s*(?:ahead|forward)?/i, n: 30 },
  ];
  for (const { pattern, n } of dayPhrases) {
    if (pattern.test(lower)) return { periods: Math.min(n, 365), unit: "day" };
  }

  return { periods: 7, unit: "day" };
}

/** @deprecated Use parseForecastHorizon. Kept for compatibility. */
export function parseForecastDays(message: string): number {
  return parseForecastHorizon(message).periods;
}

function parseDate(val: unknown): Date | null {
  if (val == null) return null;
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function addYears(d: Date, n: number): Date {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + n);
  return out;
}

function addByUnit(d: Date, n: number, unit: ForecastUnit): Date {
  switch (unit) {
    case "day":
      return addDays(d, n);
    case "week":
      return addWeeks(d, n);
    case "month":
      return addMonths(d, n);
    case "year":
      return addYears(d, n);
  }
}

function formatDateForDb(d: Date, lastFormat: string): string {
  if (lastFormat.includes("T") && lastFormat.includes("Z")) {
    return d.toISOString();
  }
  return d.toISOString().slice(0, 10);
}

export interface ForecastResult {
  rows: Record<string, unknown>[];
  forecastRowCount: number;
  /** When using Prophet service: index into rows where forecast segment starts */
  forecast_start_index?: number;
  /** When using Prophet service: upper/lower bounds for forecast segment (same length as forecast) */
  forecast_upper?: number[];
  forecast_lower?: number[];
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build series for Prophet from query rows. Returns null if insufficient valid points.
 */
export function buildForecastSeries(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string
): { ds: string; y: number }[] | null {
  const points: { ds: string; y: number }[] = [];
  for (const row of data) {
    const dateVal = row[xKey];
    const numVal = row[yKey];
    const d = parseDate(dateVal);
    const y = typeof numVal === "number" ? numVal : Number(numVal);
    if (d && !Number.isNaN(y)) {
      points.push({ ds: toYYYYMMDD(d), y });
    }
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a.ds.localeCompare(b.ds));
  return points;
}

/**
 * Run Prophet forecast via external service if configured; otherwise returns null (caller uses computeForecast).
 */
export async function runProphetForecast(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  periods: number,
  unit: ForecastUnit = "day"
): Promise<ForecastResult | null> {
  const baseUrl = getConfig().FORECAST_SERVICE_URL;
  if (!baseUrl) return null;

  const series = buildForecastSeries(data, xKey, yKey);
  if (!series) return null;

  const freq = UNIT_TO_FREQ[unit];
  console.log(`${LOG_PREFIX} Calling forecast service: periods=${periods}, unit=${unit}, freq=${freq}`);
  const result = await callForecastService(baseUrl, series, periods, freq);
  if (!result) return null;

  const historyRows: Record<string, unknown>[] = result.history.map((p) => ({ [xKey]: p.ds, [yKey]: p.y }));
  const forecastRows: Record<string, unknown>[] = result.forecast.map((p) => ({
    [xKey]: p.ds,
    [yKey]: p.y,
  }));

  return {
    rows: [...historyRows, ...forecastRows],
    forecastRowCount: forecastRows.length,
    forecast_start_index: historyRows.length,
    forecast_upper: result.upper_bound,
    forecast_lower: result.lower_bound,
  };
}

export function computeForecast(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  periods: number,
  unit: ForecastUnit = "day"
): ForecastResult {
  if (data.length < 2 || !xKey || !yKey) {
    return { rows: data, forecastRowCount: 0 };
  }

  const points: { x: number; y: number; date: Date; raw: Record<string, unknown> }[] = [];
  for (const row of data) {
    const dateVal = row[xKey];
    const numVal = row[yKey];
    const d = parseDate(dateVal);
    const y = typeof numVal === "number" ? numVal : Number(numVal);
    if (d && !Number.isNaN(y)) {
      points.push({ x: d.getTime(), y, date: d, raw: { ...row } });
    }
  }
  if (points.length < 2) return { rows: data, forecastRowCount: 0 };

  points.sort((a, b) => a.x - b.x);
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { rows: data, forecastRowCount: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const lastPoint = points[points.length - 1]!;
  const lastFormat = String(lastPoint.raw[xKey] ?? "");

  const forecastRows: Record<string, unknown>[] = [];
  for (let i = 1; i <= periods; i++) {
    const nextDate = addByUnit(lastPoint.date, i, unit);
    const nextX = nextDate.getTime();
    const predictedY = slope * nextX + intercept;
    const formattedDate = formatDateForDb(nextDate, lastFormat);
    forecastRows.push({
      ...Object.fromEntries(Object.keys(lastPoint.raw).map((k) => [k, null])),
      [xKey]: formattedDate,
      [yKey]: Math.round(predictedY * 100) / 100,
    });
  }

  const combined = [...data, ...forecastRows];
  return { rows: combined, forecastRowCount: periods };
}
