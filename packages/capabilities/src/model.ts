// Model provider contract (spec §26). Plain types: no LLM SDK is required by the kernel or this package.
import type { Json } from "@cognate/events";
import type { CapabilityContract } from "@cognate/kernel-api";

export type ModelRole = "system" | "user" | "assistant" | "tool";

export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: string;
  /** For role `tool`: the call this message answers. */
  readonly toolCallId?: string;
  /** For role `assistant`: tool calls it made. */
  readonly toolCalls?: readonly ToolCall[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the tool input. */
  readonly inputSchema: { readonly [key: string]: Json };
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Json;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ToolDefinition[];
  /** Request structured JSON output, optionally constrained by a JSON Schema. */
  readonly responseFormat?: { readonly type: "json"; readonly schema?: { readonly [key: string]: Json } };
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface ModelResponse {
  readonly message: { readonly role: "assistant"; readonly content: string };
  readonly toolCalls: readonly ToolCall[];
  readonly finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  readonly model: string;
}

export type ModelDelta = { readonly type: "text"; readonly text: string } | { readonly type: "tool_call"; readonly call: ToolCall } | { readonly type: "done"; readonly response: ModelResponse };

/** Capability flags a provider declares; eligibility filters on them (spec §26, §8.2). */
export interface ModelFeatures {
  readonly generate: true;
  readonly stream: boolean;
  readonly tool_use: boolean;
  readonly structured_output: boolean;
  readonly multimodal_input: boolean;
  readonly context_limit: number;
}

export class ModelProviderError extends Error {
  override readonly name = "ModelProviderError";
  constructor(
    readonly kind: "unauthorized" | "rate_limited" | "invalid_request" | "unavailable" | "cancelled" | "malformed_response",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface ModelProvider {
  /** Provider instance id, e.g. `local` or `openai-compatible:gpt-4o-mini`. */
  readonly id: string;
  readonly model: string;
  readonly features: ModelFeatures;
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelDelta>;
}

/** The capability contract a provider publishes: id `model.generate`, features as attributes. Never includes credentials. */
export function modelContract(provider: ModelProvider): CapabilityContract {
  const { generate: _generate, ...features } = provider.features;
  return { id: "model.generate", version: "1.0.0", attributes: { ...features, provider: provider.id, model: provider.model } };
}
