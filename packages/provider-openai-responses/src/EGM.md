# provider-openai-responses / src — Responses API request and stream mapping

## Overview

`src/index.ts` exports `openAIResponses(options)` plus its options interface. It converts framework `ModelRequest` values into the Responses API body (`input` items, `instructions`, `tools`, `max_output_tokens`, `text.format`), POSTs once per call through the shared wire helpers, and either parses the completed JSON response or consumes the event stream until `response.completed`. Streaming is settlement-oriented: the terminal `done` delta carries the fully assembled `ModelResponse`.

## Interface

- `OpenAIResponsesOptions` — `id`, `baseURL`, `model`, `credentials: CredentialSource`, optional `fetch`, `timeoutMs`, and optional `subscription` grant/usage-mode pair `[packages/provider-openai-responses/src/index.ts:OpenAIResponsesOptions]`
- `openAIResponses(options)` — returns a `ModelProvider` with id `openai-responses:<id>` `[packages/provider-openai-responses/src/index.ts:openAIResponses]`
- `wireInput(request)` — flattens messages into Responses input items `[packages/provider-openai-responses/src/index.ts:wireInput]`
- `body(options, request, stream)` — builds the JSON request body `[packages/provider-openai-responses/src/index.ts:body]`
- `result(raw, fallbackModel)` — maps a completed response payload to `ModelResponse` `[packages/provider-openai-responses/src/index.ts:result]`

## Invariants

- `store` is always `false` in the request body `[packages/provider-openai-responses/src/index.ts:body]`
- A `tool` message becomes a `function_call_output` item keyed by `call_id`; assistant tool calls become sibling `function_call` items with `arguments` stringified `[packages/provider-openai-responses/src/index.ts:wireInput]`
- Tools are sent as `{type:"function", name, description, parameters: inputSchema}`, unwrapped unlike Chat Completions `[packages/provider-openai-responses/src/index.ts:body]`
- `responseFormat.schema` maps to `text.format` `json_schema` named `response`; without a schema it maps to `json_object` `[packages/provider-openai-responses/src/index.ts:body]`
- A payload whose `status` is not `"completed"` or whose `output` is not an array is rejected as `malformed_response` `[packages/provider-openai-responses/src/index.ts:result]`
- Non-object function `arguments` fail closed as `malformed_response` `invalid response function arguments` rather than yielding empty arguments `[packages/provider-openai-responses/src/index.ts:result]`
- `finishReason` is `tool_calls` when any call was parsed, otherwise `stop` `[packages/provider-openai-responses/src/index.ts:result]`
- The advertised feature set is fixed at `context_limit: 128000` with `multimodal_input: false`; options cannot widen it `[packages/provider-openai-responses/src/index.ts:openAIResponses]`
- If a subscription grant is configured, `assertSubscriptionUse` runs before signals and credentials on every request `[packages/provider-openai-responses/src/index.ts:post]`
- The URL is `baseURL` with one trailing slash removed plus `/responses` `[packages/provider-openai-responses/src/index.ts:post]`
- Stream events `response.failed`, `error`, and `response.incomplete` raise `unavailable` `Responses did not complete` `[packages/provider-openai-responses/src/index.ts:stream]`
- Text deltas are only re-sent on `done` when no `response.output_text.delta` was yielded, avoiding duplication `[packages/provider-openai-responses/src/index.ts:stream]`
- A stream that ends without `response.completed` is `malformed_response`, including a bare `[DONE]` `[packages/provider-openai-responses/src/index.ts:stream]`

## Side Effects

- Network: one injected `fetch` POST per call, defaulting to the global `fetch` when `options.fetch` is absent `[packages/provider-openai-responses/src/index.ts:openAIResponses]`
- Clock: a timeout signal is created from `timeoutMs` through `requestSignal` `[packages/provider-openai-responses/src/index.ts:post]`
- Secret access: the caller's `CredentialSource.acquire` is awaited per request and its headers are forwarded, never stored `[packages/provider-openai-responses/src/index.ts:post]`

## Verification

- Run: `cd packages/provider-openai-responses && bun test`
