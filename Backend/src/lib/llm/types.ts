/**
 * LLM provider-agnostic interface
 * Swap Groq/OpenAI/Anthropic without changing callers
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  /** Request JSON mode - response must be parseable JSON */
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMGenerateResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ILLMProvider {
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResult>;
}
