# provider-openai-compatible / src — Chat Completions over fetch

## Overview

`src/index.ts` is the whole package. It exports `openAICompatible(options)` returning a `ModelProvider` that speaks the Chat Completions shape to any compatible endpoint, plus `modelComponent(provider)` which publishes that provider onto the kernel as a `model.generate` contract. Unlike the Responses adapter it does not use `provider-wire`: framing, status classification, and signal composition are implemented here, and tool-call deltas are streamed incrementally as start/args/end events before the assembled call.

## Interface

- `OpenAICompatibleOptions` — `id`, `baseURL`, `model`, optional `apiKey` accessor, `features` overrides, `fetch`, `timeoutMs` `[packages/provider-openai-compatible/src/index.ts:OpenAICompatibleOptions]`
- `openAICompatible(options)` — returns a `ModelProvider` with id `openai-compatible:<id>` `[packages/provider-openai-compatible/src/index.ts:openAICompatible]`
- `modelComponent(provider)` — a `Component` whose `activate` calls `fiber.provide` on `modelContract(provider)` `[packages/provider-openai-compatible/src/index.ts:modelComponent]`
- `toOpenAIMessage`, `buildBody`, `buildHeaders`, `createSignals` — internal request-shaping helpers `[packages/provider-openai-compatible/src/index.ts:buildBody]`
- `mapFinishReason`, `parseToolCallArguments`, `parseModelResponse`, `toHttpError`, `mapAbortOrNetworkError` — internal response/error mapping `[packages/provider-openai-compatible/src/index.ts:mapFinishReason]`

## Invariants

- `DEFAULT_FEATURES` is `stream`, `tool_use`, `structured_output` true, `multimodal_input` false, `context_limit: 8192`; options `features` spread over it while `generate` stays fixed true `[packages/provider-openai-compatible/src/index.ts:DEFAULT_FEATURES]`
- The request URL is built once as `${baseURL}/chat/completions`, with no trailing-slash normalization `[packages/provider-openai-compatible/src/index.ts:openAICompatible]`
- Tool messages only carry `tool_call_id` when it is present; assistant `tool_calls` are emitted only when non-empty, as `{type:"function", function:{name, arguments: JSON.stringify(...)}}` `[packages/provider-openai-compatible/src/index.ts:toOpenAIMessage]`
- `max_tokens` and `temperature` are only sent when defined; `stream` is only set when streaming `[packages/provider-openai-compatible/src/index.ts:buildBody]`
- Structured output uses `response_format` `json_schema` named `response`, or `json_object` without a schema `[packages/provider-openai-compatible/src/index.ts:buildBody]`
- Status mapping: `401`/`403` to `unauthorized`, `429` to `rate_limited`, other `4xx` to `invalid_request`, else `unavailable`; the upstream `error.message` is surfaced verbatim, unlike the wire package which redacts it `[packages/provider-openai-compatible/src/index.ts:toHttpError]`
- Abort classification is ordered: caller-aborted is `cancelled`, timeout-aborted is `unavailable` with `request timed out`, otherwise `unavailable` with the network message `[packages/provider-openai-compatible/src/index.ts:mapAbortOrNetworkError]`
- Only four finish reasons are recognized (`stop`, `length`, `tool_calls`, `content_filter`); anything else becomes `error` `[packages/provider-openai-compatible/src/index.ts:mapFinishReason]`
- Unparseable tool arguments fail as `malformed_response` `tool call arguments were not valid JSON`, and a response without `choices[0]` fails as `malformed_response` `response had no choices` `[packages/provider-openai-compatible/src/index.ts:parseModelResponse]`
- Streaming frames are split on `\n\n` and only `data:` lines are consumed; `[DONE]` ends the loop and an empty payload is skipped `[packages/provider-openai-compatible/src/index.ts:stream]`
- A reader failure mid-stream is re-mapped through the same abort/network classifier, so it surfaces as a typed `ModelProviderError` `[packages/provider-openai-compatible/src/index.ts:stream]`
- Tool-call fragments are accumulated by `call.index`, defaulting to `0`; a synthetic id `index:<n>` is used when the upstream never sent one `[packages/provider-openai-compatible/src/index.ts:stream]`
- Streamed tool calls are emitted in sorted index order as `tool_call_start`, `tool_call_args` deltas, `tool_call_end`, then the assembled `tool_call`, and finally one `done` delta `[packages/provider-openai-compatible/src/index.ts:stream]`
- Using `modelComponent` without `request.stream`, or against a provider without the `stream` feature, runs `generate` instead; an exhausted stream without a `done` delta raises `malformed_response` `[packages/provider-openai-compatible/src/index.ts:modelComponent]`

## Side Effects

- Network: POST to the precomputed endpoint via `options.fetch ?? fetch` `[packages/provider-openai-compatible/src/index.ts:openAICompatible]`
- Clock: `AbortSignal.timeout(timeoutMs)` is created when a timeout is configured `[packages/provider-openai-compatible/src/index.ts:createSignals]`
- Secret access: `await options.apiKey()` runs per request; the key is placed in `authorization` and never retained on the provider `[packages/provider-openai-compatible/src/index.ts:buildHeaders]`
- Kernel: `activate` registers a contract and forwards each non-terminal delta to `ctx.progress` `[packages/provider-openai-compatible/src/index.ts:modelComponent]`

## Verification

- Run: `cd packages/provider-openai-compatible && bun test`
