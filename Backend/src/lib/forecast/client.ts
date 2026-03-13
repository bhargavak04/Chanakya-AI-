/**
 * HTTP client for the Python Prophet forecast service.
 * When FORECAST_SERVICE_URL is not set or the request fails, the pipeline falls back to local linear regression.
 */

export interface ForecastSeriesPoint {
  ds: string; // YYYY-MM-DD
  y: number;
}

export interface ProphetForecastResult {
  history: { ds: string; y: number }[];
  forecast: { ds: string; y: number }[];
  upper_bound: number[];
  lower_bound: number[];
}

const FORECAST_TIMEOUT_MS = 30_000;

/** Pandas/Prophet frequency: D=day, W=week, MS=month start, YS=year start. Default D. */
export async function callForecastService(
  baseUrl: string,
  series: ForecastSeriesPoint[],
  periods: number,
  freq: string = "D"
): Promise<ProphetForecastResult | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/forecast`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series, periods, freq }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[forecast] Service ${url} returned ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as ProphetForecastResult;
    if (
      !Array.isArray(data.history) ||
      !Array.isArray(data.forecast) ||
      !Array.isArray(data.upper_bound) ||
      !Array.isArray(data.lower_bound)
    ) {
      console.warn("[forecast] Invalid response shape from service");
      return null;
    }
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[forecast] Service request failed:", msg);
    return null;
  }
}
