# provider-local / src — deterministic rule-scripted provider

## Overview

A `ModelProvider` whose output is scripted by ordered rules instead of a model call: the same request yields the same response and the same stream chunking `[index.ts:localProvider]`. Matching is case-insensitive against the last user message, and the first matching rule wins `[index.ts:respondTo]`. The module exports `localProvider` and the `LocalRule` type `[index.ts:LocalRule]`.

## Interface

- `localProvider` — builds the provider with `generate` and `stream` `[index.ts:localProvider]`
- `LocalRule` — optional `when` text plus a `respond` function returning a response without `model` `[index.ts:LocalRule]`
- `respondTo` — internal first-match rule evaluation with a fixed fallback `[index.ts:respondTo]`
- `lastUserContent` — internal scan for the last `user` message `[index.ts:lastUserContent]`

## Invariants

- A rule with no `when` matches every request, so rule order determines precedence `[index.ts:respondTo]`
- No matching rule returns a fixed assistant sentence with `finishReason: "stop"` `[index.ts:NO_MATCH]`
- Provider id is `local:<id>` defaulting to `default`, and the model is always `local-rules` `[index.ts:localProvider]`
- Declared features are `generate`, `stream`, `tool_use`, `structured_output` true, `multimodal_input` false, `context_limit` 8192 `[index.ts:localProvider]`
- The stream slices the single response content by `chunkSize` (default 16) then yields one `done` delta `[index.ts:localProvider]`

## Side Effects

- None — no network, filesystem, or process effect; the provider is a pure function of rules and request `[index.ts:localProvider]`

## Verification

- Run: `cd packages/provider-local && bun test`
