# protocol-connect-bun source

## Overview
Serves `RuntimeService` on `Bun.serve` with authentication, payload limits, and deadlines, and provides a fetch transport (package description; [package.json:description]). Because there is no first-party Bun Connect adapter, the module indexes a `ConnectRouter`'s universal handlers by request path and bridges each through `createFetchHandler` [src/index.ts:createConnectFetchHandler]. The package is a single module [package.json:exports].

## Interface
- `serveRuntime(options)` — returns `RuntimeServer` (`url`, `stop`) [src/index.ts:serveRuntime]
- `ServeOptions` — `service`, `authenticate`, `port`, `hostname`, `limits` [src/index.ts:ServeOptions]
- `RuntimeServer` [src/index.ts:RuntimeServer]
- `connectTransport(baseUrl, options?)` — fetch-based Connect transport with `cache: "no-store"` [src/index.ts:connectTransport]
- `devTokenAuthenticator(headers)` and `devToken(caller)` — test/dev `Bearer <tenant>:<principalId>` [src/index.ts:devTokenAuthenticator]

## Invariants
- HTTP/1.1 only: unary plus server streaming (DEBT-004) [src/index.ts:1]
- A declared `content-length` above `maxBodyBytes` (default 1 048 576) is rejected as `resource_exhausted` with HTTP 429 before routing [src/index.ts:serveRuntime]
- When the client sends no `Connect-Timeout-Ms`, a `defaultDeadlineMs` (default 30 000) header is injected [src/index.ts:serveRuntime]
- `maxJsonDepth` (default 32) is passed to `registerRuntimeService` for `invalid_argument` rejection [src/index.ts:serveRuntime]
- Every response carries `cache-control: no-store` because Bun's fetch caches identical unary POST responses (DEBT-027) [src/index.ts:serveRuntime]
- Unknown paths answer 404 from the bridge rather than reaching the service [src/index.ts:createConnectFetchHandler]
- `devTokenAuthenticator` accepts only `Bearer` with exactly one colon and returns `undefined` otherwise; it is documented as not for production use [src/index.ts:devTokenAuthenticator]

## Side Effects
- Binds a listening socket on `port` (default 0, i.e. an ephemeral port) and `hostname` via `Bun.serve` [src/index.ts:serveRuntime]
- `stop()` calls `server.stop(true)` to force-close connections [src/index.ts:serveRuntime]
- Outbound fetches from `connectTransport` with `cache: "no-store"` [src/index.ts:connectTransport]

## Verification
- Run: `cd packages/protocol-connect-bun && bun test`
