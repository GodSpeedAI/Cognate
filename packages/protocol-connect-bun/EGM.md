# protocol-connect-bun

## Overview

Serves `RuntimeService` on `Bun.serve` over the Connect protocol with caller authentication, payload limits, and a default deadline `[src/index.ts:serveRuntime]`. There is no first-party Bun adapter for Connect, so the package indexes a `ConnectRouter`'s universal handlers by request path and bridges each to the Fetch API `[src/index.ts:createConnectFetchHandler]`. The entry point re-exports `serveRuntime`, `connectTransport`, `devTokenAuthenticator`, and `devToken` from `./src/index.ts` `[package.json:exports]`, depending on `@godspeedai/cognate-protocol-connect`, `@godspeedai/cognate-runtime-api`, `@connectrpc/connect` 2.2.0, and `@connectrpc/connect-web` 2.2.0 `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — server, fetch handler bridge, client transport factory, and the dev authenticator `[src/index.ts:serveRuntime]`
- test/ — `limits.test.ts` and `no-store.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- Default limits are a 1 048 576-byte body, JSON nesting depth 32, and a 30 000 ms server deadline `[src/index.ts:serveRuntime]`
- A declared `content-length` above the body limit returns Connect code `resource_exhausted` with HTTP 429 `[src/index.ts:serveRuntime]`
- A missing `Connect-Timeout-Ms` header is filled with the default deadline before dispatch `[src/index.ts:serveRuntime]`
- Every response is forced to `cache-control: no-store` because Bun's fetch caches repeated identical unary POST responses `[src/index.ts:serveRuntime]`
- The HTTP version pinned into the fetch bridge is `http/1.1`, so only unary and server-streaming calls are served `[src/index.ts:createConnectFetchHandler]`
- `connectTransport` defaults to `useBinaryFormat: false` and installs a `cache: "no-store"` fetch wrapper `[src/index.ts:connectTransport]`
- `devTokenAuthenticator` accepts only `Bearer <tenant>:<principalId>` and is labelled as not for production use `[src/index.ts:devTokenAuthenticator]`
- An unmatched path returns HTTP 404 `[src/index.ts:createConnectFetchHandler]`

## Global Side Effects

- Binds a TCP listener via `Bun.serve` on `options.port ?? 0` and the optional hostname `[src/index.ts:serveRuntime]`
- `stop()` force-stops the server with `server.stop(true)` `[src/index.ts:serveRuntime]`
- Outbound HTTP when a client uses the returned transport `[src/index.ts:connectTransport]`

## Verification

- Run: `cd packages/protocol-connect-bun && bun test`
