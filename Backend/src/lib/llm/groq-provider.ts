/**
 * Groq LLM provider - Llama 3.3 70B Versatile
 * Replace this file to switch providers - interface stays the same
 */
import Groq from "groq-sdk";
import type { ILLMProvider, LLMGenerateOptions, LLMGenerateResult } from "./types.js";
import { getConfig } from "../../config.js";

export class GroqProvider implements ILLMProvider {
  private client: Groq;

  constructor(apiKey?: string) {
    const key = apiKey ?? getConfig().GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is required. Set it in .env");
    this.client = new Groq({ apiKey: key });
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const { messages, jsonMode = false, maxTokens = 4096, temperature = 0.1 } = options;

    const completion = await this.client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage
      ? { promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens }
      : undefined;

    return { content, usage };
  }
}
