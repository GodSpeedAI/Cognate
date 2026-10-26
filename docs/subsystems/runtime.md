# Subsystem: the runtime

## Purpose

Turn an `AgentDefinition` into durable, replayable, resumable execution, and expose that
execution as a transport-independent service that any surface can consume.

The normative method-by-method listing is in
[../reference/runtime-service-and-agents.md](../reference/runtime-service-and-agents.md); the
end-to-end trace is in [../workflows/run-execution.md](../workflows/run-execution.md). This page
covers composition, ownership, and the contract's edges.

## Responsibilities

- The service and agent contracts (`packages/runtime-api`): `RuntimeService`, `Caller`,
  `RunView`, `ContinuationView`, `ServiceError`, `AgentDefinition`, `RunContext`, `StateUpdate`,
  and a service conformance kit.
- The Bun implementation (`packages/runtime-bun`): composition root, in-process `RuntimeService`,
  replay-based executor, the shared-state fold, cognition wiring, and the background loop.
- Authorization at the service boundary (`ActionPolicy`), tenancy enforcement, and typed error
  mapping.

## Non-responsibilities

- It does not define capabilities or lifecycles — that is [the kernel](kernel.md).
- It does not define the store — that is [durable state](durable-state.md).
- It does not serve HTTP. `@godspeedai/cognate-protocol-connect` and `protocol-connect-bun` do, over a
  contract this package owns.
- It does not implement cognition; it wires `cognitive-api` and degrades cleanly when absent.

## Position in the system

`runtime-api` depends only on `events` and `kernel-api`, which is the whole point (ADR-0011):
`protocol-connect`, `client`, `ag-ui`, `mcp`, `a2a`, and `protocol-connect-bun` can all depend on
the service contract without depending on Bun. `runtime-bun` depends on `runtime-api` plus the
implementations (`kernel-cordis`, `store-sqlite`, `store-memory`, `continuations`, `artifacts`,
`capabilities`, `cognitive-api`, `projections`).

Both profiles depend on `runtime-bun`; `cli` depends on the profiles and the service contract.

## Core abstractions

- **`AgentDefinition`** — `{ id, version, run(input, context): Promise<Json> }`. The return value
  becomes the run output.
- **`RunContext`** — `runId`, `agent`, `tenant`, `scopeId`, `correlationId`, `actor`, `signal`,
  and `step`, `emit`, `invoke`, `artifact`, `waitFor`, `recall`, `state`. Every method is durable
  and replay-safe.
- **`RuntimeService`** — `startRun`, `getRun`, `cancelRun`, `events`, `listContinuations`,
  `resolveContinuation`, `invoke`, `getArtifact`, `readProjection`, `listRuns`, `updateState`.
- **`Caller`** — `{ actor: Principal; tenant: string }`, established by the transport, never from
  a message body.
- **`ServiceError`** with a code from `not_found | permission_denied | invalid_argument |
  failed_precondition | unavailable | deadline_exceeded | already_exists | unauthenticated |
  resource_exhausted`. Transports map these to their own status codes; `protocol-connect` exports
  the table as `errorCodes`.
- **`RunView`** — a fold, not a stored row: `runId`, `agent`, `tenant`, `status`, `input`,
  `output`, `error`, `correlationId`, `startedBy`, `waitingOn`.
- **`RuntimeOptions`** — `store`, `policy`, `actions`, `agents`, `components?`, `cognition?`,
  `projections?`, `outboxFor?`, `tickMs?`, `system?`, and `execution?` (`maxConcurrentRuns` 1–64, `resourceKeys(run)`).
- **`ActionPolicy`** — the service-level allow/deny over `run.start`, `run.cancel`,
  `continuation.resume`, `continuation.cancel`, `run.state.update`. Default deny.
- **`ExecutionOptions`** — bounded native execution ([runtime-concurrency.md](../runtime-concurrency.md)):
  `maxConcurrentRuns` caps process-local concurrency (defaults to 1); `resourceKeys(run)` returns resource identities (e.g. `["workspace:repo-alpha"]`). Runs with common keys serialize; independent runs overlap.

> **Interactive models:**
> - Step through `agent.run` replay and step-id memoization in the **[Run Execution & Replay Stepper](../explainers/run-execution-replay.html)**.
> - Simulate bounded concurrency and PostgreSQL run-write ownership in the **[Concurrency, Fenced Outbox & Ownership Simulator](../explainers/concurrency-and-leases.html)**.

## Internal operation

`runtime.ts` is the composition root. It opens the store, creates the `Invoker` and the Cordis
kernel, mounts components, constructs the `ContinuationService` and `ArtifactService`, registers
the `run.resume@1` handler, builds the `run.execute` dispatcher, starts projection runners,
performs the recovery scan, and starts the loop. Full detail in
[startup-and-the-background-loop](../workflows/startup-and-the-background-loop.md).

`service.ts` is the boundary. Every method:

1. resolves the caller's tenant and rejects a cross-tenant id as `not_found` (never
   `permission_denied` — that would confirm existence);
2. authorizes through `ActionPolicy`, throwing `ServiceError("permission_denied", reason)`;
3. does the work against the store, with CAS retries (5 attempts) and idempotency;
4. maps internal errors to `ServiceError` codes.

`executor.ts` is the replay engine; `fold.ts` holds the derivations (`foldRun`, `runStream`,
`runStateStream`, `isTerminal`, `toJson`, `messageOf`). `cognition.ts` holds the cognitive
projection (`runtime.cognition`, default extractor: one entry per `run.completed`) and the
authorized recall path that dereferences `run:<id>` back to a tenant-checked `RunView`.

`invoker.ts` decorates the caller's `Policy` so each invocation's decision lands in an
`AsyncLocalStorage` slot, which the executor then records on `run.invocation`.

## State

The runtime owns no tables. It owns:

- the run streams `run-<id>` and `run-state-<id>`, and the `runs` records;
- the in-memory `Map<runId, AbortController>` used to cancel `ctx.signal`;
- the per-run serialization chains and the pending set;
- the `controllers` map is cleared in a `finally`, so a crashed execution cannot leave a stale
  controller that `cancelRun` would abort.

Everything else lives in [durable state](durable-state.md).

## Lifecycle

`createRuntime` → mounted components `ACTIVE` → loop running → `idle()` when quiescent →
`close()`. `inspect(correlationId)` reconstructs a machine-readable `CausalChain` (runs, events,
invocations with their policy decisions, artifacts, observations) at any point.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| `not_found` for a run that exists | it belongs to another tenant | correct the caller's tenant; not a bug |
| `already_exists` on a mutating call | idempotency key reused with a different fingerprint | new key |
| `failed_precondition` from `updateState` | `expectedVersion` mismatch, or terminal run | re-read and retry |
| `unavailable` after five contended attempts | genuine contention | retry later |
| `ActivationTimeoutError` at startup | a component never settled | its capabilities stay unavailable; the app still starts |
| run stuck `running` after a hard kill | the recovery scan re-queues it on next start | automatic |
| slow agents block others | runs execute serially in one tick | DEBT-015 |
| recall always `degraded` | no cognition configured, or the index failed | `rebuildCognition()`, or configure `cognition` |

## Extension points

- **A new agent** — implement `AgentDefinition`. This is the primary surface.
- **A new `RuntimeService` implementation** — pass `runtime-api/conformance`. That is how
  `protocol-connect`'s remote client is proven to be equivalent to the in-process one
  (`CG-WIR-003`).
- **A new `outboxFor`** — derive additional intents from each pending event; the event id is
  pre-assigned so intents commit atomically. RealityTrace uses this.
- **Custom projection extraction** — `CognitionOptions.extract` replaces the default
  completed-run document.
- **A `tickMs`** — the loop interval, for tests that want to slow it down.

Not extension points: the step-id scheme, the two-stream state split, `foldRun`, or the
`ActionPolicy` action names. All four are contract.

## Source trail

- `packages/runtime-api/src/types.ts` — `RunContext`, `AgentDefinition`, `Caller`,
  `RuntimeService`, `ServiceError`, `RunView`, `ContinuationView`.
- `packages/runtime-api/src/state.ts` — `StateUpdate`, `applyStateUpdate`, `foldState`.
- `packages/runtime-api/src/conformance.ts` — the service kit.
- `packages/runtime-bun/src/index.ts` — `RuntimeOptions`, `Runtime`, `ActionPolicy`, `createRuntime`.
- `packages/runtime-bun/src/runtime.ts` — composition, tick, recovery, close.
- `packages/runtime-bun/src/service.ts` — authorization, tenancy, error mapping.
- `packages/runtime-bun/src/executor.ts` — replay.
- `packages/runtime-bun/src/fold.ts` — stream names and folds.
- `packages/runtime-bun/src/cognition.ts` — cognitive projection and recall.
- `packages/runtime-bun/src/invoker.ts` — policy decision capture.
- `packages/runtime-bun/test/service.ts`, `packages/runtime-bun/test/support.ts`,
  `tests/integration/{shared-state,causality,erasure,second-process}.test.ts`.
- [decisions/ADR-0011-runtime-service-contract-package.md](../decisions/ADR-0011-runtime-service-contract-package.md).

## Related

- [../workflows/run-execution.md](../workflows/run-execution.md) — the canonical trace.
- [../explanation/why-replay.md](../explanation/why-replay.md) — why it is built this way.
- [../reference/runtime-service-and-agents.md](../reference/runtime-service-and-agents.md) — every
  method, parameter, and error code.
- [../troubleshooting.md](../troubleshooting.md).
