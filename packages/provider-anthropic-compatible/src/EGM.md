# provider-anthropic-compatible / src — Anthropic Messages adapter

## Overview

A `ModelProvider` over an Anthropic-compatible `/messages` endpoint, mapping Cognate `ModelRequest`/`ModelResponse` shapes to the Anthropic Messages wire format in both unary and SSE streaming modes `[index.ts:anthropicCompatible]`. It composes `@godspeedai/cognate-provider-auth` for credential headers and `@godspeedai/cognate-provider-wire` for `sendJson`, `readSSE`, and `requestSignal` `[index.ts:3]`. The module exports `anthropicCompatible` and the `AnthropicCompatibleOptions` type `[index.ts:AnthropicCompatibleOptions]`.

## Interface

- `anthropicCompatible` — builds the provider with `generate` and `stream` `[index.ts:anthropicCompatible]`
- `AnthropicCompatibleOptions` — id, baseURL, model, credentials, version, fetch, timeout, context limit `[index.ts:AnthropicCompatibleOptions]`
- `wire` — internal request translator to the Messages wire shape `[index.ts:wire]`
- `finalResponse` — internal unary translator including stop-reason mapping `[index.ts:finalResponse]`

## Invariants

- A request carrying `responseFormat` is rejected with `ModelProviderError("invalid_request")` because native JSON-schema output is not implemented `[index.ts:wire]`
- A tool message without `toolCallId` is rejected as `invalid_request` `[index.ts:wire]`
- System messages are folded into the top-level `system` string and never sent as message roles `[index.ts:wire]`
- `max_tokens` defaults to 1024 and the default `anthropic-version` is `2023-06-01` `[index.ts:anthropicCompatible]`
- A stream without `message_stop` throws `malformed_response` `[index.ts:anthropicCompatible]`
- A `content_block_delta` with no matching open block throws `malformed_response` `[index.ts:anthropicCompatible]`
- Unparseable SSE data throws `malformed_response`, and an `error` event throws `unavailable` `[index.ts:anthropicCompatible]`
- `stop_reason` maps to `length`, `tool_calls`, `stop`, `content_filter`, or `error` `[index.ts:finalResponse]`

## Side Effects

- Outbound HTTP POST to `${baseURL}/messages`, with a trailing slash stripped from the base `[index.ts:anthropicCompatible]`
- Credential acquisition through the injected `CredentialSource` on every request `[index.ts:anthropicCompatible]`
- Streaming network read via `readSSE` and timeout/abort signalling via `requestSignal` `[index.ts:anthropicCompatible]`

## Verification

- Run: `cd packages/provider-anthropic-compatible && bun test`
