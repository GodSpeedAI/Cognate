# Reference: `RuntimeService` and the agent surface

The transport-independent service contract (`@cognate/runtime-api`) and the agent authoring
surface. This is the interface every surface consumes and every implementation must satisfy.

## `Caller`

```ts
interface Caller {
  readonly actor: Principal;      // { id: string; kind: "user" | "service" | "system" | … }
  readonly tenant: string;
}
```

Established by the transport's authenticator. Never read from a request body.

## `ServiceError`

```ts
type ServiceErrorCode =
  | "not_found" | "permission_denied" | "invalid_argument" | "failed_precondition"
  | "unavailable" | "deadline_exceeded" | "already_exists" | "unauthenticated"
  | "resource_exhausted";

class ServiceError extends Error { constructor(readonly code: ServiceErrorCode, message: string) }
```

`protocol-connect` exports the code table as `errorCodes` and round-trips it in both directions.

## `RunView` and `ContinuationView`

```ts
type RunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

interface RunView {
  runId, agent, tenant, status, input, output, error, correlationId, startedBy,
  waitingOn: readonly string[]      // continuation ids currently awaited
}

interface ContinuationView {
  id, runId, type,
  status: "OPEN" | "RESUMED" | "CANCELLED" | "EXPIRED" | "FAILED" | "BLOCKED",
  condition, payload, version, expiresAt: number | null
}
```

`RunView` is a **fold** over the run's stream, not a stored row.

## `RuntimeService`

### `startRun(caller, request)`

```ts
{ agent: string; input: Json; idempotencyKey: string; correlationId?: string; state?: Json }
  → Promise<RunView>
```

- authorizes `run.start`; `not_found` if the agent is unregistered;
- commits in **one** transaction: `run.started` on `run-<id>`, an optional caller-seeded
  `state.changed{snapshot}` on `run-state-<id>`, a `runs` record, a `run.execute` outbox intent,
  and the idempotency result;
- the `state` seed participates in the idempotency fingerprint: the same key with a different seed
  is a different request → `already_exists`;
- `correlationId` defaults to a fresh uuid. AG-UI uses `agui-thread:<id>`; harness sessions use
  `session:<id>`.

Errors: `permission_denied`, `not_found`, `already_exists`.

### `getRun(caller, { runId })` → `RunView`

`not_found` for an unknown or foreign-tenant run.

### `cancelRun(caller, { runId, reason, idempotencyKey })` → `RunView`

Appends `run.cancelled` (CAS, 5 attempts), aborts the run's `AbortController` (which is
`ctx.signal`), and cancels every open continuation for the run. Already terminal → the current
view, not an error.

Errors: `permission_denied`, `not_found`, `already_exists`.

### `events(caller, { afterPosition?, runId?, signal?, follow? })` → `AsyncIterable<StoredEvent>`

Committed events visible to the caller's tenant, in store-position order, starting after
`afterPosition`. Subscribes before catching up, so nothing committed in between is missed. With
`follow`, keeps going until `signal` aborts. Resume after a disconnect by passing the last seen
position: no gaps, no duplicates.

### `listContinuations(caller, { runId?, status? })` → `ContinuationView[]`

Scoped to the caller's tenant.

### `resolveContinuation(caller, request)`

```ts
{ continuationId; action: "resume" | "cancel"; input?; reason?; idempotencyKey; expectedVersion? }
  → Promise<{ outcome: "transitioned" | "duplicate" | "already_terminal"; continuation: ContinuationView }>
```

Authorizes `continuation.resume` / `continuation.cancel`. Cancelling also kicks the run so its
wait closes promptly.

Errors: `not_found`, `permission_denied`, `failed_precondition` (version mismatch; the message
names the current version).

`duplicate` is returned when the *identical* request is retried — the record is already terminal
but its `lastTransition` matches the same `(actor, operation, idempotencyKey)`. A different key
against a terminal record gets `already_terminal` instead.

`@cognate/client`'s `resolveContinuation` wraps this: it mints a fresh `idempotencyKey` per call
and returns the unwrapped `ContinuationView`, not the `{ outcome, continuation }` envelope. Use the
service directly when you need the outcome or your own key.

### `invoke(caller, { capability, input, correlationId?, idempotencyKey?, deadline? })` → `Json`

Goes through the kernel and the `Policy`. **Does not** record an event. Failure mapping:

| invocation failure | `ServiceErrorCode` |
|---|---|
| `denied` | `permission_denied` |
| `unavailable` | `unavailable` |
| `deadline_exceeded` | `deadline_exceeded` |
| `cancelled` | `unavailable` |
| `failed` | `failed_precondition` |

### `getArtifact(caller, { artifactId, representation? })`

Returns `{ id, name, mediaType, contentHash, bytes }`.

| Artifact state | Result |
|---|---|
| available and authorized | the bytes |
| denied, tombstoned, or absent | `not_found` — deliberately indistinguishable (spec §32) |
| record present, bytes gone | `unavailable` |

### `readProjection(caller, { name })` → `{ key, value }[]`

Only names registered `public`. Filters to the `<tenant>/` key prefix, strips it, returns `[]` for
an empty partition, and `not_found` for an unknown name.

### `listRuns(caller, { correlationId?, agent? })` → `RunView[]`

The caller's tenant's runs, oldest first by `run.started` position, optionally narrowed to one
correlation id (an AG-UI thread, a harness session) and/or agent. Served from the indexed `runs`
record collection, not an event-log scan.

Errors: none specific; tenancy is implicit.

### `updateState(caller, request)`

```ts
{ runId; update: StateUpdate; idempotencyKey: string; expectedVersion?: number }
  → Promise<{ state: Json; version: number }>
```

Writes shared state as the caller. Appends `state.changed` to `run-state-<id>`, validated against
the current state, authorized as `run.state.update`, idempotent, and optionally guarded by
`expectedVersion` — the count of **caller writes so far** (the state stream's length). Agent
emits do not advance it.

| Condition | Error |
|---|---|
| run terminal | `failed_precondition` |
| `expectedVersion` mismatch | `failed_precondition` (current version in the message) |
| patch does not apply | `invalid_argument` |
| key reused with a different request | `already_exists` |
| five contended attempts | `unavailable` |

## `AgentDefinition`

```ts
interface AgentDefinition {
  readonly id: string;        // the capability id, e.g. "agent.refund"
  readonly version: string;
  run(input: Json, context: RunContext): Promise<Json>;   // the return value is the run output
}
```

Deterministic given the recorded step results.

## `RunContext`

| Member | Records | Replay behavior |
|---|---|---|
| `runId`, `agent`, `tenant`, `scopeId`, `correlationId`, `actor` | — | constants for the run |
| `signal` | — | aborted on cancellation; the only non-durable member |
| `step<T>(id, fn)` | `run.step.completed` under `step:<id>` | returns the recorded result |
| `emit(eventType, payload)` | that event under `emit:<n>` | skipped |
| `invoke(capability, input, { version? })` | `run.invocation` under `invoke:<n>` | returns the recorded result, or throws `InvocationFailedError` |
| `artifact(input)` | `run.artifact` under `artifact:<n>` | returns the recorded id |
| `waitFor(id, spec)` | `run.waiting` → `run.resumed` / `run.wait.closed` under `wait:<id>` | returns the resume input, or throws `ContinuationClosedError` |
| `recall(id, { text, k })` | `run.recall` under `recall:<id>` | returns the recorded result |
| `state(id)` | `run.step.completed` under `state:<id>` | returns the value read at that point |

`emit` rejects an `eventType` starting with `run.` — that prefix belongs to the runtime.

## Supporting types

```ts
interface WaitSpec { type: string; condition: Json; payload: Json; expiresAt?: number; semanticRef?: SemanticRef }
interface ArtifactInput { name; mediaType; bytes; readers?: string[]; representations?: { mediaType; bytes }[] }
type StateUpdate = { snapshot: Json } | { patch: readonly JsonPatchOp[] };   // RFC 6902
```

Errors thrown to agent code: `InvocationFailedError(capability, failure)`,
`ContinuationClosedError`.

## Conformance

`@cognate/runtime-api/conformance` exports `runtimeServiceConformance`, the fixtures (`alice`,
`kitAgents`, …), and the setup contract. Any implementation of `RuntimeService` — the in-process
one, a Connect remote client, a future transport — must pass it unchanged. That is the mechanism
behind `CG-WIR-003` (transport replaceability).

## Source trail

- `packages/runtime-api/src/types.ts` — every declaration above.
- `packages/runtime-api/src/state.ts` — `StateUpdate`, `JsonPatchOp`, `StatePatchError`.
- `packages/runtime-api/src/conformance.ts` — the kit.
- `packages/runtime-bun/src/service.ts` — the reference implementation and its error mapping.
- `packages/protocol-connect/src/index.ts` — the wire mapping and `errorCodes`.
- `packages/client/src/index.ts` — the client wrapper.
- [../workflows/run-execution.md](../workflows/run-execution.md) — the trace these serve.
- [../subsystems/runtime.md](../subsystems/runtime.md) — the subsystem page.
- [decisions/ADR-0011-runtime-service-contract-package.md](../decisions/ADR-0011-runtime-service-contract-package.md).

## Related

- [../concepts.md](../concepts.md) — vocabulary.
- [../how-to/verify-a-change.md](../how-to/verify-a-change.md) — proving a change to this surface.
- [wire-and-protocols.md](../subsystems/wire-and-protocols.md) — the same contract over Connect.
