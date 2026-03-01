/**
 * API client for Pulse backend
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type ApiError = { message: string; details?: string };

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const headers: Record<string, string> = hasBody ? { "Content-Type": "application/json" } : {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body as { error?: string | { message?: string }; details?: string };
    const message =
      err.details ??
      (typeof err.error === "string" ? err.error : err.error?.message) ??
      res.statusText ??
      "Request failed";
    const error = new Error(message) as Error & ApiError;
    error.message = message;
    error.details = err.details;
    throw error;
  }
  return res.json();
}

export const api = {
  health: () => fetchApi<{ status: string }>("/api/health"),

  getDatabases: () => fetchApi<{ databases: { id: string; name: string; type: string }[] }>("/api/databases"),

  addDatabase: (body: {
    name: string;
    type: "postgresql" | "mysql";
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl_required?: boolean;
  }) => fetchApi<{ id: string; name: string; type: string }>("/api/databases", { method: "POST", body: JSON.stringify(body) }),

  testDatabase: (id: string) =>
    fetchApi<{ ok: boolean }>(`/api/databases/${id}/test`, { method: "POST", body: "{}" }),

  deleteDatabase: (id: string) => fetchApi<{ deleted: string }>(`/api/databases/${id}`, { method: "DELETE" }),

  ingestSchema: (dbId: string) =>
    fetchApi<{ tables: number; columns: number; dbId: string }>(`/api/schema/${dbId}/ingest`, {
      method: "POST",
      body: "{}",
    }),

  getSchema: (dbId: string) => fetchApi<{ dbId: string; tables: unknown[] }>(`/api/schema/${dbId}`),

  chat: (body: { dbId: string; message: string; mode?: string; conversationId?: string }) =>
    fetchApi<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify(body) }),

  exportCsv: async (data: Record<string, unknown>[], filename: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/api/export/csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, filename }),
    });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },
};

export type ChartConfig = {
  type: "line" | "bar" | "area" | "pie" | "table";
  x_axis: string;
  y_axis: string[];
  group_by?: string[];
  time_granularity?: string;
};

export type ChatResponseSuccess = {
  mode: string;
  title: string;
  data: Record<string, unknown>[];
  chart_config: ChartConfig;
  insights: string[];
  badges: { type: string; value: string }[];
  export: { csv_available: boolean; excel_available: boolean };
  meta: { db_source: string; query_time_ms: number; sql?: string };
  conversationId?: string;
};

export type ChatResponseError = { error: { type: string; message: string } };

export type ChatResponse = ChatResponseSuccess | ChatResponseError;

export function isChatError(r: ChatResponse): r is ChatResponseError {
  return "error" in r;
}
