# provider-openai-responses

## Overview

`@godspeedai/cognate-provider-openai-responses` (version `0.8.0`) is the "OpenAI Responses API ModelProvider with streaming settlement and credential leasing", publishing one entry at `./src/index.ts` `[packages/provider-openai-responses/package.json:exports]`. Its three workspace dependencies show it is a composition layer rather than a self-contained client: `@godspeedai/cognate-capabilities` for the `ModelProvider` types and `ModelProviderError`, `@godspeedai/cognate-provider-auth` for credential leasing and the subscription gate, and `@godspeedai/cognate-provider-wire` for signals, HTTP error classification, JSON POST, and SSE framing `[packages/provider-openai-responses/package.json:dependencies]`. The package therefore writes no fetch, retry, or stream-framing logic of its own; it maps `ModelRequest` into the Responses wire body and the Responses event stream back into `ModelDelta` values `[packages/provider-openai-responses/src/index.ts:openAIResponses]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `openAIResponses` factory, request body mapping, and stream settlement
- test/ — one suite, `responses.test.ts`; no `EGM.md` on disk, so it is not linked

## Global Invariants

- Only `src` is published (`files: ["src"]`), so the suite is not distributed `[packages/provider-openai-responses/package.json:files]`
- Transport, timeout composition, HTTP status classification, and SSE framing are delegated; the package imports `sendJson`, `readSSE`, and `requestSignal` instead of reimplementing them `[packages/provider-openai-responses/src/index.ts:import]`
- Credentials arrive only as a `CredentialSource` lease and are never an `apiKey` string option, unlike the compatible package `[packages/provider-openai-responses/src/index.ts:OpenAIResponsesOptions]`
- The `Bun >= 1.4.0` engine constraint is declared by the manifest rather than enforced by the code `[packages/provider-openai-responses/package.json:engines]`

## Global Side Effects

- One outbound HTTPS POST per `generate` or `stream` call, performed by the injected fetch through `sendJson` `[packages/provider-openai-responses/src/index.ts:post]`
- An optional usage-mode resolver and subscription grant are consulted on every request before credentials are leased `[packages/provider-openai-responses/src/index.ts:post]`

## Verification

- Run: `cd packages/provider-openai-responses && bun test`
