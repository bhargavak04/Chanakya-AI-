/**
 * Shared types for Pulse backend
 */

// --- Database Connection ---
export type DbType = "postgresql" | "mysql";

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // encrypted at rest in production
  ssl_required: boolean;
  created_at: string;
}

export interface DatabaseConnectionCreate {
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_required?: boolean;
}

// --- Schema ---
export interface SchemaTable {
  id: string;
  db_id: string;
  table_name: string;
  description: string | null;
  row_count_estimate: number | null;
}

export interface SchemaColumn {
  id: string;
  table_id: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  description: string | null;
}

export interface TableWithColumns extends SchemaTable {
  columns: SchemaColumn[];
}

// --- LLM Structured Output (all chat modes) ---
export type ChartType = "line" | "bar" | "area" | "pie" | "table";
export type ChatMode = "analyze" | "forecast" | "simulate" | "diagnose" | "max";

export interface ChartConfig {
  type: ChartType;
  x_axis: string;
  y_axis: string[];
  group_by?: string[];
  time_granularity?: "day" | "week" | "month";
}

export interface LLMAnalyzeOutput {
  mode: ChatMode;
  query: string;
  chart: ChartConfig;
  metadata?: {
    requires_comparison?: boolean;
    requires_anomaly_detection?: boolean;
  };
}

// --- API Response ---
export interface ChatResponseSuccess {
  mode: string;
  title: string;
  data: Record<string, unknown>[];
  chart_config: ChartConfig;
  insights: string[];
  badges: { type: string; value: string }[];
  export: {
    csv_available: boolean;
    excel_available: boolean;
  };
  meta: {
    db_source: string;
    query_time_ms: number;
    sql?: string;
  };
}

export interface ChatResponseError {
  error: {
    type: string;
    message: string;
  };
}

export type ChatResponse = ChatResponseSuccess | ChatResponseError;

// --- Conversation Memory ---
export interface ConversationState {
  db_id: string;
  filters: Record<string, unknown>;
  date_range?: string;
  last_metric?: string;
  last_query?: string;
  last_chart_config?: ChartConfig;
}

export interface ConversationTurn {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  structured_state: ConversationState | null;
  created_at: string;
}
