# src — the Connect client, server, and Bun adapter

## Overview
Three hand-written TypeScript modules. `connect-fetch-adapter.ts` bridges a Connect
router to a `(req: Request) => Promise<Response>` handler that `Bun.serve()` accepts.
`server.ts` registers the `EchoService` implementation behind that bridge, and
`client.ts` builds a client from a fetch-based transport.

## Interface
- `createConnectFetchHandler` — builds the fetch handler from Connect service registrations `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:createConnectFetchHandler]`
- `ConnectFetchAdapterOptions` — extends `ConnectRouterOptions` with `routes` and an optional `httpVersion` `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:ConnectFetchAdapterOptions]`
- `createFixtureFetchHandler` — registers the `EchoService` implementation and returns the handler `[compatibility/phase0/connect/src/server.ts:createFixtureFetchHandler]`
- `serverStreamCancellation` — a mutable probe flag the server-stream handler sets when it observes an abort `[compatibility/phase0/connect/src/server.ts:serverStreamCancellation]`
- `createFixtureTransport` — builds a `Transport` from `createConnectTransport` `[compatibility/phase0/connect/src/client.ts:createFixtureTransport]`
- `createFixtureClient` — `createClient(EchoService, transport)` `[compatibility/phase0/connect/src/client.ts:createFixtureClient]`
- `FixtureClientOptions` — `baseUrl`, optional `useBinaryFormat`, `defaultTimeoutMs`, and a `fetch` override `[compatibility/phase0/connect/src/client.ts:FixtureClientOptions]`

## Invariants
- Handlers are indexed by `requestPath` and anything unmatched returns a `404` response, never a thrown error `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:handlersByPath]`.
- The byte-level conversion is delegated to `createFetchHandler` imported from the `@connectrpc/connect/protocol` subpath, not the package root `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:createFetchHandler]`.
- `httpVersion` defaults to `"1.1"`, matching `Bun.serve()` without TLS or h2c negotiation `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:httpVersion]`.
- The unary handler treats `__permission_denied__` as a `Code.PermissionDenied` throw and `__slow__` as a 500 ms delay that rejects from `context.signal` `[compatibility/phase0/connect/src/server.ts:unary]`.
- The server-stream handler yields `sequence` from 0 upward, one message per 20 ms, and returns early when `context.signal.aborted` `[compatibility/phase0/connect/src/server.ts:serverStream]`.
- The default content type is JSON because `useBinaryFormat` falls back to `false` `[compatibility/phase0/connect/src/client.ts:createFixtureTransport]`.

## Side Effects
- The adapter reads `new URL(req.url).pathname` per request and performs no I/O of its own `[compatibility/phase0/connect/src/connect-fetch-adapter.ts:fetchHandler]`.
- The `__slow__` path starts a `setTimeout` and clears it on abort `[compatibility/phase0/connect/src/server.ts:unary]`.
- The server-stream loop sleeps 20 ms between messages so an in-flight abort is observable `[compatibility/phase0/connect/src/server.ts:serverStream]`.

## Verification
- Run: `cd compatibility/phase0/connect && bun test`
