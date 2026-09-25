# Subsystem: the wire

## Purpose

Expose one application over several protocols without letting any of them define what the
application means, and without making the application's semantics depend on a transport.

## Responsibilities

- The canonical protobuf schema and its generated bindings (`@cognate/proto`).
- The `RuntimeService` ↔ Connect mapping, transport-independent (`@cognate/protocol-connect`).
- A `Bun.serve()` bridge for it (`@cognate/protocol-connect-bun`), plus a fetch transport and the
  dev token authenticator.
- Three optional protocol adapters: AG-UI, MCP, A2A.

## Non-responsibilities

- It does not own the service contract. `runtime-api` does; this subsystem maps it
  ([ADR-0011](../decisions/ADR-0011-runtime-service-contract-package.md)).
- It does not invent semantics. Wire representation is not ontology (spec §3.7): every adapter
  maps a stable internal contract onto a protocol's shapes and never the reverse.
- It does not trust the wire. Identity comes from the transport's authenticator; payloads are
  depth-checked and bounded; nothing untrusted constructs a runtime component.

## Position in the system

```text
                       RuntimeService  (runtime-api, transport-independent)
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
      protocol-connect   @cognate/client    @cognate/ag-ui
              │          (any surface)      (SSE endpoint)
      protocol-connect-bun
      (Bun.serve + fetch transport)
```

`mcp` and `a2a` depend on `runtime-api` and `events` directly and never touch Connect.

## Core abstractions

- **`RuntimeServiceDescriptor`** — the generated `cognate.v1.RuntimeService` service, and the
  `proto/cognate/v1/*.proto` sources behind it.
- **`registerRuntimeService(router, service, { authenticate, maxJsonDepth })`** — server routes.
  The caller comes from request headers; `google.protobuf.Value` inputs are depth-checked.
- **`createRemoteRuntimeService(transport, tokenFor)`** — a `RuntimeService` over any Connect
  transport. `ServiceError` codes round-trip exactly.
- **`errorCodes`** — the exported `ServiceErrorCode` ↔ Connect `Code` table.
- **`serveRuntime({ service, authenticate, port, hostname })`** and `connectTransport(baseUrl)`,
  `devToken`, `devTokenAuthenticator`.
- **`createAgUiHandler(options)`** and `createProjector({ threadId, runId })`; `matrix` — one row
  per AG-UI 1.0.0 `EventType`, all 31.
- **`createMcpServer({ service, caller, tools })`**; **`createA2AHandler(options)`**.

## Internal operation

`protocol-connect` converts JSON ↔ `google.protobuf.Value` at the boundary, and treats an absent
field or a `Value` with no `oneof` set as JSON `null` rather than raising — the generated client's
`create()` does not coerce plain JSON for a `Value` field the way it does for `Struct`/`ListValue`.

`protocol-connect-bun` adapts `Bun.serve()`'s `Request`/`Response` to the Connect router and
propagates `Connect-Timeout-Ms` as a deadline. Bun has no first-party Connect server adapter, which
is why this package exists.

The AG-UI handler's inbound path is the security-relevant one: a user message, a frontend-tool
result, a continuation response, or a cancellation is turned into a `RuntimeService` call **with
the authenticated caller**, so it takes exactly the same authorization path as a native client. A
continuation kind with no faithful AG-UI representation becomes a
`CUSTOM cognate.unsupported_interaction` event rather than a guess. `forwardedProps.cognate.cursor`
resumes from a durable position (snapshot, then newer events); an unknown cursor triggers a full
resync. Disconnecting never cancels the durable run.

The AG-UI thread → run mapping is durable, not in-process: runs started for a thread carry
correlation id `agui-thread:<threadId>` (sessions use `session:<id>`), and the handler resolves the
thread's latest run through `listRuns`, which is served from the indexed `runs` record collection.

MCP registers one tool per binding (name defaults to the capability id with `.` → `_`) and calls
`RuntimeService.invoke` as the connection's caller. A `ServiceError` returns `isError: true` with
`<code>: <message>` — never a partial success.

A2A serves `/.well-known/agent-card.json` and JSON-RPC at `/a2a`. The A2A task id **is** the
Cognate run id; an open continuation surfaces as `TASK_STATE_INPUT_REQUIRED`; completion returns
`TASK_STATE_COMPLETED` with the run output in artifacts.

## State

None. The wire is stateless with respect to the framework: it reads and writes through
`RuntimeService` and holds no store, no registry, and no cache of its own. The one piece of
"state" is the AG-UI cursor, which is a *position*, not a session.

## Lifecycle

Per request. Connect handlers are registered once at startup and then invoked per RPC; the AG-UI
handler is an HTTP endpoint; MCP owns a long-lived server object for the connection; A2A owns a
handler for the process.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| client/bidi streaming rejected | `@connectrpc/connect-web`'s fetch transport rejects streaming request bodies over HTTP/1.1 | DEBT-004; unary and server-streaming are the supported modes |
| `permission_denied` from Connect | `authenticate` returned `undefined` or the `ActionPolicy` denied | the caller comes from headers, not the body |
| a `Value` field throws "must have a value" | a bare object literal in `create()` | the adapter normalizes this; if you hit it outside the adapter, set a oneof |
| a very deep payload is rejected | `maxJsonDepth` | the server enforces the bound deliberately |
| AG-UI reports `waiting_unsupported` | the run is waiting on a continuation AG-UI cannot express | resolve it from the native UI |
| AG-UI reconnect resyncs instead of resuming | the cursor is unknown or expired | expected; a full snapshot is sent |
| "no Cognate run is known for thread" | pre-`d634cbf` behavior (in-process mapping) | fixed; the mapping is now durable |
| MCP tool returns `isError` | the authorized invocation failed | read `<code>: <message>` |
| A2A first `SendMessage` returns input-required | the agent opened a continuation | send the follow-up with the same `taskId` |

## Extension points

- **A new RPC method** — add it to `runtime-api` *and* the `.proto`, regenerate, then map it in
  `protocol-connect`. This is a contract revision: `runtime-api/AGENTS.md` names the packages that
  must change together.
- **A new transport** — implement the service contract on your own transport and pass
  `runtime-api/conformance`. This is what makes Connect replaceable (`CG-WIR-003`).
- **A new protocol adapter** — map `RuntimeService` onto the protocol. See
  [how-to/add-a-protocol-adapter.md](../how-to/add-a-protocol-adapter.md).
- **A new AG-UI interaction** — the matrix is the declaration point; add a row with the framework
  source or the reason it is unsupported.

Not extension points: the `ServiceError` code set, the caller-from-headers rule, the generated
files (regenerate; never hand-edit), or the AG-UI matrix's meaning.

## Source trail

- `proto/cognate/v1/*.proto` — the canonical schema.
- `packages/proto/src/index.ts`, `packages/proto/scripts/generate.ts`,
  `packages/proto/test/codegen.test.ts` — generation and its determinism check.
- `packages/protocol-connect/src/index.ts` — `registerRuntimeService`,
  `createRemoteRuntimeService`, `errorCodes`, the `Value` conversion.
- `packages/protocol-connect/test/service.test.ts` — the same conformance kit over JSON and binary.
- `packages/protocol-connect-bun/src/index.ts` — `serveRuntime`, `connectTransport`, dev auth.
- `packages/ag-ui/src/index.ts` — `matrix`, `createProjector`, `createAgUiHandler`,
  `threadCorrelationId`.
- `packages/mcp/src/index.ts`, `packages/a2a/src/index.ts`.
- `compatibility/phase0/connect/`, `compatibility/phase0/ag-ui/`, `compatibility/phase0/mcp/` — the
  dependency characterization fixtures.
- [../protocols.md](../protocols.md) — canonical page for this plane.
- [decisions/ADR-0003](../decisions/ADR-0003-wire-connect-protobuf.md),
  [ADR-0008](../decisions/ADR-0008-ag-ui.md), [ADR-0010](../decisions/ADR-0010-mcp.md).

## Related

- [../workflows/client-and-ui-session.md](../workflows/client-and-ui-session.md) — the consumer
  side.
- [../reference/wire-and-protocols.md](../protocols.md) — routes, codes, and the
  AG-UI matrix.
- [../security.md](../security.md) — the trust boundary.
