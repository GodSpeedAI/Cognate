/**
 * Subscription-backed (ChatGPT plan) Responses provider. Wraps the shared Responses adapter so
 * that EVERY request honors the SIWC preview constraints: store:false, stream:true, no
 * temperature/max_output_tokens/system-role input items on this route. Settlement still requires
 * response.completed; partial output is never a settled success.
 */
import { ModelProviderError, type ModelRequest, type ModelProvider, type ModelDelta, type ModelResponse } from "@godspeedai/cognate-capabilities";
import { assertSubscriptionUse, type UsageMode } from "@godspeedai/cognate-provider-auth";
import { openAIResponses } from "@godspeedai/cognate-provider-openai-responses";
import { subscriptionCredentialSource, subscriptionGrant, type SiwcOptions } from "./session.ts";

export interface SubscriptionProviderOptions {
  readonly id: string;
  readonly model: string;
  readonly clientId: string;
  readonly siwc: SiwcOptions;
  /** Resolved per request: interactive by default, automation only with recorded consent. */
  readonly usageMode?: () => UsageMode;
  readonly fetch?: Parameters<typeof openAIResponses>[0]["fetch"];
  readonly timeoutMs?: number;
}

/**
 * SIWC preview constraint: system-role input items are rejected on this route. System text moves
 * to the request's `instructions`; temperature/max_tokens are stripped (the plan route requires
 * omitting them). Used only for plan-backed requests — direct API-key traffic keeps the
 * untouched adapter.
 */
export function subscriptionRequest(request: ModelRequest): ModelRequest {
  const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return {
    ...request,
    messages: request.messages.filter((message) => message.role !== "system"),
    ...(system ? { instructions: [request.instructions, system].filter(Boolean).join("\n\n") } : {}),
    temperature: undefined,
    maxTokens: undefined,
  };
}

export function subscriptionResponsesProvider(options: SubscriptionProviderOptions): ModelProvider {
  const credentials = subscriptionCredentialSource(options.siwc, options.clientId);
  const usageMode = options.usageMode ?? (() => "interactive" as const);
  const provider = openAIResponses({
    id: options.id,
    baseURL: "https://api.openai.com/v1",
    model: options.model,
    credentials: {
      acquire: async (signal?: AbortSignal) => {
        // Local governance first: automation needs recorded consent, independent of token validity.
        const grant = await subscriptionGrant(options.siwc, options.clientId);
        assertSubscriptionUse(grant, usageMode());
        return credentials.acquire(signal);
      },
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
  return {
    id: `openai-subscription:${options.id}`,
    model: options.model,
    features: { ...provider.features, stream: true },
    // generate() is served through the stream so every plan-backed request is stream:true
    // (a preview requirement); settlement still requires response.completed.
    async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
      const mapped = subscriptionRequest(request);
      let final: ModelResponse | undefined;
      for await (const delta of provider.stream(mapped, signal)) {
        if (delta.type === "done") final = delta.response;
      }
      if (!final) throw new ModelProviderError("malformed_response", "subscription stream settled without a final response");
      return final;
    },
    async *stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelDelta> {
      yield* provider.stream(subscriptionRequest(request), signal);
    },
  };
}
