import type { ModelProvider } from "@cognate/capabilities";
import type { Component } from "@cognate/kernel-api";

export interface OpenAICompatibleOptions {
  /** Instance id, e.g. `local`; the provider id becomes `openai-compatible:<id>`. */
  readonly id: string;
  readonly baseURL: string;
  readonly model: string;
  /** Credential source, read per request and never stored in contracts, events, or errors (spec §32). */
  readonly apiKey?: () => string | Promise<string>;
  readonly features?: Partial<{ stream: boolean; tool_use: boolean; structured_output: boolean; multimodal_input: boolean; context_limit: number }>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export function openAICompatible(_options: OpenAICompatibleOptions): ModelProvider {
  throw new Error("provider-openai-compatible: not implemented");
}

/** A kernel component publishing `model.generate` for a provider (JSON in: ModelRequest, out: ModelResponse). */
export function modelComponent(_provider: ModelProvider): Component {
  throw new Error("provider-openai-compatible: not implemented");
}
