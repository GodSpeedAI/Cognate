# provider-wire / src — HTTP and SSE boundary over injected fetch

## Overview

`src/index.ts` is the only module. It defines an injectable `HttpFetch` type, composes caller signals with an optional timeout, classifies upstream HTTP statuses into `ModelProviderError` kinds, posts JSON bodies, and parses Server-Sent Events from a `Response` body with incremental UTF-8 decoding. Callers supply both the URL and the fetch implementation, so the module owns protocol framing and error typing rather than transport selection.

## Interface

- `HttpFetch` — `(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>` `[packages/provider-wire/src/index.ts:HttpFetch]`
- `requestSignal(signal?, timeoutMs?)` — returns the caller signal, or its combination with an abort-on-timeout signal `[packages/provider-wire/src/index.ts:requestSignal]`
- `httpError(status)` — maps a status to a `ModelProviderError` `[packages/provider-wire/src/index.ts:httpError]`
- `sendJson(url, body, headers, fetchFn, signal?)` — POSTs JSON and returns the successful `Response` `[packages/provider-wire/src/index.ts:sendJson]`
- `SSEEvent` — `{ event: string; data: string }` `[packages/provider-wire/src/index.ts:SSEEvent]`
- `readSSE(response, signal?)` — async generator of parsed frames `[packages/provider-wire/src/index.ts:readSSE]`

## Invariants

- Status mapping is fixed: `401`/`403` to `unauthorized`, `429` to `rate_limited`, other `4xx` to `invalid_request`, everything else to `unavailable` `[packages/provider-wire/src/index.ts:httpError]`
- The upstream error message is deliberately discarded; the error text is only `model upstream HTTP <status>` so tokens or user payload cannot leak `[packages/provider-wire/src/index.ts:httpError]`
- A thrown fetch is `cancelled` when the signal is aborted, otherwise `unavailable` `[packages/provider-wire/src/index.ts:sendJson]`
- `sendJson` merges `content-type: application/json` under the caller headers, so a caller header wins `[packages/provider-wire/src/index.ts:sendJson]`
- A response body without a stream fails as `malformed_response` with `missing event stream` `[packages/provider-wire/src/index.ts:readSSE]`
- Frames are split on `\r?\n\r?\n`; only `event:` and `data:` lines are read, multiple `data:` lines join with `\n`, and a frame with no `data:` line is skipped `[packages/provider-wire/src/index.ts:decode]`
- A trailing frame without a blank-line terminator is still emitted when the stream ends `[packages/provider-wire/src/index.ts:readSSE]`
- Mid-stream failure is `cancelled` when the signal aborted and `unavailable` otherwise, because callers may retry the latter `[packages/provider-wire/src/index.ts:readSSE]`
- The reader lock is released in a `finally`, so an aborted consumer does not strand the body `[packages/provider-wire/src/index.ts:readSSE]`

## Side Effects

- Issues the network request through the caller's `fetchFn` only, with no ambient global fetch lookup `[packages/provider-wire/src/index.ts:sendJson]`
- Creates timers via `AbortSignal.timeout(timeoutMs)` only when the caller passes a timeout `[packages/provider-wire/src/index.ts:requestSignal]`
- Holds the response body stream and its reader until the generator completes `[packages/provider-wire/src/index.ts:readSSE]`

## Verification

- Run: `cd packages/provider-wire && bun test`
