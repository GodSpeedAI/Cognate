import type { ModelDelta, ModelProvider, ModelRequest, ModelResponse } from "@godspeedai/capabilities";

export interface LocalRule {
  /** Matches when the last user message contains this text (case-insensitive), or always when omitted. */
  readonly when?: string;
  readonly respond: (request: ModelRequest) => Omit<ModelResponse, "model">;
}

const NO_MATCH: Omit<ModelResponse, "model"> = { message: { role: "assistant", content: "I have no scripted answer for that." }, toolCalls: [], finishReason: "stop" };

function lastUserContent(request: ModelRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i -= 1) {
    const message = request.messages[i];
    if (message?.role === "user") return message.content;
  }
  return "";
}

function respondTo(rules: readonly LocalRule[], request: ModelRequest): Omit<ModelResponse, "model"> {
  const last = lastUserContent(request).toLowerCase();
  for (const rule of rules) {
    if (rule.when === undefined || last.includes(rule.when.toLowerCase())) return rule.respond(request);
  }
  return NO_MATCH;
}

/** Deterministic, rule-scripted provider: same request → same response and same stream chunking. */
export function localProvider(options: { readonly id?: string; readonly rules?: readonly LocalRule[]; readonly chunkSize?: number }): ModelProvider {
  const id = `local:${options.id ?? "default"}`;
  const model = "local-rules";
  const rules = options.rules ?? [];
  const chunkSize = options.chunkSize ?? 16;

  async function generate(request: ModelRequest): Promise<ModelResponse> {
    return { ...respondTo(rules, request), model };
  }

  async function* stream(request: ModelRequest): AsyncIterable<ModelDelta> {
    const response = await generate(request);
    const { content } = response.message;
    for (let i = 0; i < content.length; i += chunkSize) yield { type: "text", text: content.slice(i, i + chunkSize) };
    yield { type: "done", response };
  }

  return {
    id,
    model,
    features: { generate: true, stream: true, tool_use: true, structured_output: true, multimodal_input: false, context_limit: 8192 },
    generate,
    stream,
  };
}
