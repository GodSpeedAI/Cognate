import type { ModelProvider, ModelRequest, ModelResponse } from "@cognate/capabilities";

export interface LocalRule {
  /** Matches when the last user message contains this text (case-insensitive), or always when omitted. */
  readonly when?: string;
  readonly respond: (request: ModelRequest) => Omit<ModelResponse, "model">;
}

/** Deterministic, rule-scripted provider: same request → same response and same stream chunking. */
export function localProvider(_options: { readonly id?: string; readonly rules?: readonly LocalRule[]; readonly chunkSize?: number }): ModelProvider {
  throw new Error("provider-local: not implemented");
}
