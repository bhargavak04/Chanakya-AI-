/**
 * LLM module - provider-agnostic
 * Change provider here; all callers use ILLMProvider
 */
import { GroqProvider } from "./groq-provider.js";
import type { ILLMProvider } from "./types.js";

let provider: ILLMProvider | null = null;

export function getLLMProvider(apiKey?: string): ILLMProvider {
  if (!provider) {
    provider = new GroqProvider(apiKey);
  }
  return provider;
}

/** For testing or switching provider - call with new instance */
export function setLLMProvider(p: ILLMProvider): void {
  provider = p;
}

export type { ILLMProvider, LLMMessage, LLMGenerateOptions, LLMGenerateResult } from "./types.js";
