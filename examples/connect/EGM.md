# connect — the runtime service over Connect RPC

## Overview
The same in-process runtime is served over Connect RPC and then consumed by a client
that holds only a transport and a token function. It demonstrates that
`RuntimeService` is transport-independent: `startRun` and `getRun` behave the same
remotely as they do locally.

## Interface
- `createRuntime` — runtime with `store: ":memory:"`, permissive policy and actions, and the `agent.echo` agent `[examples/connect/index.ts:createRuntime]`
- `serveRuntime` — serves `runtime.service` with `authenticate: devTokenAuthenticator` on `port: 0` `[examples/connect/index.ts:serveRuntime]`
- `devTokenAuthenticator` / `devToken` — the paired server-side authenticator and client-side token provider `[examples/connect/index.ts:devTokenAuthenticator]`
- `connectTransport` — wraps `server.url` into a client transport `[examples/connect/index.ts:connectTransport]`
- `createRemoteRuntimeService` — builds the remote service from a transport and a token function `[examples/connect/index.ts:createRemoteRuntimeService]`
- `AgentDefinition` — the echo agent returns `{ echoed: input }` unchanged `[examples/connect/index.ts:echoAgent]`

## Invariants
- The client must not reach `runtime` in process; it is constructed only from `connectTransport(...)` and `devToken` `[examples/connect/index.ts:remote]`.
- `startRun` carries an `idempotencyKey` (`"connect-example"`) alongside `agent` and `input` `[examples/connect/index.ts:remote.startRun]`.
- The remote run must settle to `status === "completed"` within the 8000 ms `waitUntil` budget `[examples/connect/index.ts:waitUntil]`.
- `done.output` must deep-equal `{ echoed: { hello: "world" } }`, proving the payload survived serialization `[examples/connect/index.ts:done.output]`.

## Side Effects
- Binds an ephemeral loopback TCP port (`port: 0`) and prints the resolved `server.url` `[examples/connect/index.ts:serveRuntime]`.
- `finally` awaits `server.stop()` and then `runtime.close()` `[examples/connect/index.ts:finally]`.

## Verification
- Run: `bun run example:connect`
