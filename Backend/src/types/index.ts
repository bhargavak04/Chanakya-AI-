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
export type ChartType = "line" | "bar" | "area" | "pie" | "scatter" | "table";
export type ChatMode = "analyze" | "forecast" | "simulate" | "diagnose" | "max";

export interface ChartConfig {
  type: ChartType;
  x_axis: string;
  y_axis: string[];
  group_by?: string[];
  time_granularity?: "day" | "week" | "month";
  /** Stack bars when group_by present. Omit for simple bar charts. */
  stacked?: boolean;
  /** Secondary Y-axis columns (different scale). Use only when comparing metrics on different magnitudes. */
  y_axis_right?: string[];
  /** Target/threshold/breakeven line. Use only when user asks for target, breakeven, or threshold. */
  reference_line?: { value: number; label?: string };
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
    /** Diagnose mode: all SQL queries run during investigation */
    diagnostic_queries?: string[];
    /** Diagnose mode: number of queries executed */
    queries_executed?: number;
  };
  /** Diagnose mode: root cause analysis summary */
  diagnosis_summary?: string;
  /** Diagnose mode: identified root causes */
  root_causes?: string[];
  /** Diagnose mode: actionable recommendations */
  recommendations?: string[];
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
