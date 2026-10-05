# Runtime service and client surface

The API the browser and the tests use. Every app action crosses this surface; nothing in the UI
touches the store, the kernel, or a capability handler directly.

## Two entry points to the same service

| Entry | From | Auth | Transport |
|---|---|---|---|
| `RuntimeService` (`runtime.service`) | server-side: capabilities, `server.ts`, and every test | the caller object is passed explicitly | in-process |
| `client` (`@cognate/client`) | the browser bundle | `devToken(caller)` in an `Authorization` header | Connect RPC over HTTP to `/cognate.v1.RuntimeService/*` |

`server.ts` registers the same `runtime.service` object with `registerRuntimeService`, so there is one
implementation and two ways to reach it. The client wraps it with the caller identity so callers do
not pass `{tenant, actor}` on every call.

---

## Methods

### `invoke(capabilityId, input)`

Invokes a capability. **This is not recorded as an event.** That property is load-bearing: it is why
`model.configure` can carry an API key without the key reaching the durable log.

```ts
await client.invoke("model.configure", { providerId, baseURL, protocol, model, apiKey });
await client.invoke("workspace.select", { path });
await client.invoke("settings.changeWorkDetails", { workDetails: "verbose" });
await client.invoke("onboarding.dismiss", { step: "notice" });
const history = await client.invoke("session.history", { sessionId });
```

Rejects when the capability is not in `GRANTED_CAPABILITIES`, when the actor is neither `user` nor
`system`, or when the handler throws (its message becomes the rejection message).

The server-side form takes a caller: `service.invoke(caller, {capability, input})` — used by
`J-G-persistence` to call `session.history` directly.

### `startRun(agent, input, options)`

Starts an agent run.

```ts
// client
const view = await client.startRun(
  "agent.coding",
  { sessionId, workspaceId, message } as never,
  { idempotencyKey: crypto.randomUUID(), correlationId: `session:${sessionId}` },
);
// → { runId, … }

// server side, from a capability
await service.startRun(SYSTEM_CALLER, {
  agent: "agent.config",
  input: { kind: "workspace.added", workspaceId, path, title },
  idempotencyKey: randomUUID(),
});
```

The `correlationId` is not cosmetic: `session:<id>` is what makes a run a session turn, and
`subagent:<parentRunId>:<toolCallId>` is what makes it a child. Without one, the `sessions` projection
ignores every event the run produces.

`agent.config` runs started by capabilities deliberately pass **no** correlation id — they are
configuration records, not turns.

`startRun` returns a run view immediately; it does not wait. Polling `getRun` is how callers wait.

### `getRun(caller, {runId})`

Returns the run's current view. This is the polling primitive every test uses:

```ts
for (let i = 0; i < 400; i++) {
  const run = await app.runtime.service.getRun(LOCAL_OPERATOR, { runId });
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return run;
  await new Promise((r) => setTimeout(r, 25));
}
```

`status` is one of `running`, `waiting`, `completed`, `failed`, `cancelled`. On `completed`, `output`
carries the agent's return value — for `agent.coding`, `{text}`.

### `listRuns(caller, {correlationId})`

Every run under a correlation. Two uses in the app:

- `session.history` lists `session:<id>` to reconstruct a conversation.
- `J-F-delegation` lists `subagent:<parentRunId>:<toolCallId>` to prove exactly one child exists.

### `cancelRun(runId, reason)`

```ts
await client.cancelRun(activeRunId, "user-cancelled");
```

Aborts the run's signal. The abort propagates to the in-flight invocation and, for a streaming model
call, to the underlying HTTP request. The run ends `cancelled`, partial streamed text is retained, and
`message.completed` is **not** emitted. Tests then confirm the provider really saw the abort via the
mock's `GET /__abort-count`.

### `readProjection(caller, {name})`

```ts
const rows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "sessions" });
const row = rows.find((r) => r.key === sessionId);
```

Returns the named public projection's rows **with the tenant prefix stripped**. See
[projections.md](projections.md) for the key conventions.

### `events(caller, {runId?, follow?, signal?})`

An async iterable of stored events — the durable record of what happened.

```ts
// a finite pass over one run's history
const events: StoredEvent[] = [];
for await (const e of app.runtime.service.events(LOCAL_OPERATOR, { runId })) events.push(e);

// the live tenant stream, as server.ts uses it
for await (const event of runtime.service.events(LOCAL_OPERATOR, { follow: true, signal })) { … }
```

`follow: true` is a tail; `stop()` aborts the controller and the `catch` absorbs it.

### `subscribe(filter, handler)` (client only)

The browser's live subscription — a Connect stream, not a poll. Returns an unsubscribe function.

```ts
const unsubscribe = client.subscribe({ runId }, (event) => {
  if (event.eventType === "run.invocation.progress") …
});
const unsubscribe2 = client.subscribe({}, (event) => { … });   // {} = the whole tenant
```

`useStreamingTurn` and `useToolTimeline` both use `{runId}`; the tests that collect a whole run's
events use `{}`.

**Retry-aware delta handling:** `run.invocation.progress` events carry `metadata.attempt`. A delta from
a higher attempt **replaces** the accumulated text, one from the current attempt appends, and one from a
superseded lower attempt is discarded. Without that comparison a retried request would concatenate the
failed attempt's partial text with the successful one.

### `listContinuations(caller, {runId})`

Every continuation on a run, with `id`, `type`, `status` (`OPEN` or resolved), and `payload`.

```ts
const open = (await app.runtime.service.listContinuations(LOCAL_OPERATOR, { runId }))
  .find((c) => c.status === "OPEN" && c.type === "plan-review");
```

`type` is how the two gate mechanisms are distinguished: `tool-approval` versus `plan-review`.

### `resolveContinuation(...)`

Two forms, depending on the caller.

```ts
// client
await client.resolveContinuation(continuation.id, "resume", { approved: true });
await client.resolveContinuation(continuation.id, "resume", { approved: false, feedback: "…" });

// server side
await service.resolveContinuation(caller, {
  continuationId: open.id, action: "resume", input: { approved: true }, idempotencyKey: randomUUID(),
});
```

The resume input's shape depends on the continuation type. See [events.md](events.md#continuations).

### `idle()` (runtime only)

```ts
await app.runtime.idle();
```

Waits for in-flight work to settle before the test reads projections. Used wherever a test asserts a
projection that is written asynchronously from a run.

### `close()` (runtime only)

Called by `AppServer.stop()` after `server.stop(true)`. Aborts the event follower first.

---

## React hooks — `@cognate/react`

| Hook | Returns | Used for |
|---|---|---|
| `useCognate()` | the client | `invoke`, `startRun`, `cancelRun`, `resolveContinuation`, `subscribe` |
| `useProjection(name, caller)` | the projection's rows, kept current | every read of the seven projections |
| `useContinuations(runId)` | `{open, resolve}` for one run's continuations | `ApprovalBar` finds the `tool-approval`; `PlanReviewCard` the `plan-review` |

`App.tsx` wraps `useProjection` in nine named hooks (`useSessions`, `usePlans`, …) so each read has a
name at its call site.

## The browser entry

`cognate/.generated/entry.tsx` is regenerated on every boot:

```ts
const caller = { tenant: "local", actor: { id: "operator", kind: "user" } };
const transport = connectTransport(window.location.origin);
const service = createRemoteRuntimeService(transport, () => devToken(caller));
const client = createClient({ service, caller });
createRoot(root).render(<CognateProvider client={client}><App /></CognateProvider>);
```

The caller identity is compiled into the bundle. The dev token is fetched through the closure at
request time rather than baked in.

## Auth

| | |
|---|---|
| Mechanism | `Authorization: Bearer <tenant>:<actor>` |
| Verifier | `devTokenAuthenticator` from `@cognate/protocol-connect-bun` |
| Applied to | Connect requests only. `/`, `/app.js`, the stylesheets, and `/health` are unauthenticated. |
| Status | The server prints the token at startup and states it is **not** production auth. |

## Related

- [capabilities.md](capabilities.md) — what `invoke` can reach
- [events.md](events.md) — what the event stream carries
- [projections.md](projections.md) — what `readProjection` returns
- [configuration.md](configuration.md) — the HTTP routes
- [../subsystems/server-runtime.md](../subsystems/server-runtime.md) — how the service is registered
- [../subsystems/web-ui.md](../subsystems/web-ui.md) — the client-side hooks
