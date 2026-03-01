/**
 * Simple linear regression forecast for time series
 */
export function parseForecastDays(message: string): number {
  const lower = message.toLowerCase();
  const m7 = lower.match(/next\s+7\s+days?|7\s+days?\s+(?:ahead|forward)/i);
  if (m7) return 7;
  const m14 = lower.match(/next\s+14\s+days?|2\s+weeks?/i);
  if (m14) return 14;
  const m30 = lower.match(/next\s+30\s+days?|next\s+month|1\s+month/i);
  if (m30) return 30;
  const m90 = lower.match(/next\s+90\s+days?|3\s+months?|quarter/i);
  if (m90) return 90;
  const generic = lower.match(/next\s+(\d+)\s+days?/i);
  if (generic) return Math.min(parseInt(generic[1]!, 10) || 7, 90);
  return 7;
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

function formatDateForDb(d: Date, lastFormat: string): string {
  if (lastFormat.includes("T") && lastFormat.includes("Z")) {
    return d.toISOString();
  }
  return d.toISOString().slice(0, 10);
}

export interface ForecastResult {
  rows: Record<string, unknown>[];
  forecastRowCount: number;
}

export function computeForecast(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  forecastDays: number
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
  for (let i = 1; i <= forecastDays; i++) {
    const nextDate = addDays(lastPoint.date, i);
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
  return { rows: combined, forecastRowCount: forecastDays };
}
