import type { Json } from "@cognate/events";
import { ModelProviderError, type ModelDelta, type ModelMessage, type ModelProvider, type ModelRequest, type ModelResponse, type ToolCall, modelContract } from "@cognate/capabilities";
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

const DEFAULT_FEATURES = { stream: true, tool_use: true, structured_output: true, multimodal_input: false, context_limit: 8192 } as const;

function toOpenAIMessage(message: ModelMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.role === "tool" && message.toolCallId) out.tool_call_id = message.toolCallId;
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    out.tool_calls = message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }));
  }
  return out;
}

function buildBody(options: OpenAICompatibleOptions, request: ModelRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { model: options.model, messages: request.messages.map(toOpenAIMessage) };
  if (stream) body.stream = true;
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
  }
  if (request.responseFormat) {
    body.response_format = request.responseFormat.schema
      ? { type: "json_schema", json_schema: { name: "response", schema: request.responseFormat.schema } }
      : { type: "json_object" };
  }
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  return body;
}

async function buildHeaders(options: OpenAICompatibleOptions): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey) headers.authorization = `Bearer ${await options.apiKey()}`;
  return headers;
}

function createSignals(callerSignal: AbortSignal | undefined, timeoutMs: number | undefined): { signal?: AbortSignal; timeoutSignal?: AbortSignal } {
  const timeoutSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
  const signals = [callerSignal, timeoutSignal].filter((s): s is AbortSignal => s !== undefined);
  if (signals.length === 0) return {};
  if (signals.length === 1) return { signal: signals[0], timeoutSignal };
  return { signal: AbortSignal.any(signals), timeoutSignal };
}

function mapAbortOrNetworkError(err: unknown, callerSignal: AbortSignal | undefined, timeoutSignal: AbortSignal | undefined): ModelProviderError {
  if (callerSignal?.aborted) return new ModelProviderError("cancelled", "request cancelled by caller");
  if (timeoutSignal?.aborted) return new ModelProviderError("unavailable", "request timed out");
  const message = err instanceof Error ? err.message : String(err);
  return new ModelProviderError("unavailable", `network error: ${message}`);
}

async function toHttpError(response: Response): Promise<ModelProviderError> {
  let message = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) message = body.error.message;
  } catch {
    // no JSON body; keep the default message
  }
  const status = response.status;
  if (status === 401 || status === 403) return new ModelProviderError("unauthorized", message, status);
  if (status === 429) return new ModelProviderError("rate_limited", message, status);
  if (status >= 400 && status < 500) return new ModelProviderError("invalid_request", message, status);
  return new ModelProviderError("unavailable", message, status);
}

function mapFinishReason(reason: unknown): ModelResponse["finishReason"] {
  if (reason === "stop" || reason === "length" || reason === "tool_calls" || reason === "content_filter") return reason;
  return "error";
}

function parseToolCallArguments(raw: string): Json {
  try {
    return JSON.parse(raw) as Json;
  } catch {
    throw new ModelProviderError("malformed_response", "tool call arguments were not valid JSON");
  }
}

function parseModelResponse(data: any, fallbackModel: string): ModelResponse {
  const choice = data?.choices?.[0];
  if (!choice) throw new ModelProviderError("malformed_response", "response had no choices");
  const message = choice.message ?? {};
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call: any) => ({
    id: call.id,
    name: call.function?.name,
    arguments: parseToolCallArguments(call.function?.arguments ?? "{}"),
  }));
  const response: ModelResponse = {
    message: { role: "assistant", content: message.content ?? "" },
    toolCalls,
    finishReason: mapFinishReason(choice.finish_reason),
    model: data.model ?? fallbackModel,
  };
  if (data.usage) return { ...response, usage: { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 } };
  return response;
}

export function openAICompatible(options: OpenAICompatibleOptions): ModelProvider {
  const fetchFn = options.fetch ?? fetch;
  const features = { generate: true as const, ...DEFAULT_FEATURES, ...options.features };
  const id = `openai-compatible:${options.id}`;
  const url = `${options.baseURL}/chat/completions`;

  async function generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const body = buildBody(options, request, false);
    const { signal: reqSignal, timeoutSignal } = createSignals(signal, options.timeoutMs);
    const headers = await buildHeaders(options);
    let response: Response;
    try {
      response = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body), signal: reqSignal });
    } catch (err) {
      throw mapAbortOrNetworkError(err, signal, timeoutSignal);
    }
    if (!response.ok) throw await toHttpError(response);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ModelProviderError("malformed_response", "response body was not valid JSON");
    }
    return parseModelResponse(data, options.model);
  }

  async function* stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelDelta> {
    const body = buildBody(options, request, true);
    const { signal: reqSignal, timeoutSignal } = createSignals(signal, options.timeoutMs);
    const headers = await buildHeaders(options);
    let response: Response;
    try {
      response = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body), signal: reqSignal });
    } catch (err) {
      throw mapAbortOrNetworkError(err, signal, timeoutSignal);
    }
    if (!response.ok) throw await toHttpError(response);
    if (!response.body) throw new ModelProviderError("malformed_response", "stream response had no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason: ModelResponse["finishReason"] = "stop";
    let model = options.model;
    let usage: ModelResponse["usage"];
    const toolCallAcc = new Map<number, { id?: string; name?: string; arguments: string }>();

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") break outer;
          if (data === "") continue;
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            throw new ModelProviderError("malformed_response", "stream event was not valid JSON");
          }
          if (parsed.model) model = parsed.model;
          if (parsed.usage) usage = { inputTokens: parsed.usage.prompt_tokens ?? 0, outputTokens: parsed.usage.completion_tokens ?? 0 };
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};
          if (typeof delta.content === "string" && delta.content.length > 0) {
            content += delta.content;
            yield { type: "text", text: delta.content };
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const call of delta.tool_calls) {
              const index = call.index ?? 0;
              const acc = toolCallAcc.get(index) ?? { arguments: "" };
              if (call.id) acc.id = call.id;
              if (call.function?.name) acc.name = call.function.name;
              if (call.function?.arguments) acc.arguments += call.function.arguments;
              toolCallAcc.set(index, acc);
            }
          }
          if (choice.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
        }
      }
    }

    const toolCalls: ToolCall[] = [...toolCallAcc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, acc]) => ({ id: acc.id ?? "", name: acc.name ?? "", arguments: parseToolCallArguments(acc.arguments || "{}") }));
    for (const call of toolCalls) yield { type: "tool_call", call };

    const response2: ModelResponse = { message: { role: "assistant", content }, toolCalls, finishReason, model };
    yield { type: "done", response: usage ? { ...response2, usage } : response2 };
  }

  return { id, model: options.model, features, generate, stream };
}

/** A kernel component publishing `model.generate` for a provider (JSON in: ModelRequest, out: ModelResponse). */
export function modelComponent(provider: ModelProvider): Component {
  const contract = modelContract(provider);
  return {
    id: `model:${provider.id}`,
    provides: [contract],
    activate(fiber) {
      fiber.provide(contract, async (input, ctx) => provider.generate(input as ModelRequest, ctx.signal));
    },
  };
}
