# Reference: events, records, and the store

The data model. Everything the system knows is one of these.

## The event envelope

### `NewEvent` — what a decision submits

| Field | Type | Required | Notes |
|---|---|---|---|
| `eventType` | lower-case dotted string | yes | pattern `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$` |
| `schemaVersion` | positive integer | yes | |
| `occurredAt` | ISO-8601 | yes | source-claimed; provenance only, never ordering authority |
| `tenant` | non-empty | yes | |
| `correlationId` | non-empty | yes | groups a whole causal chain |
| `causationId` | text or `null` | yes | the event that caused this one |
| `runId` | text or `null` | yes | |
| `scopeId` | non-empty | yes | |
| `componentId`, `fiberId` | text | no | runtime identity |
| `semanticRef` | `SemanticRef` | no | namespace, id, kind?, source `{uri, digest}`, projectionVersion |
| `payload` | `Json` | yes | ≤ `MAX_PAYLOAD_BYTES` (1 MiB); nesting depth ≤ 64 |
| `metadata` | `Json` | no | routing facts; **not** erasable |
| `eventId` | text | no | pre-assigned when an outbox intent must commit with the event |

### `StoredEvent` — what the store returns

Everything above, plus:

| Field | Notes |
|---|---|
| `streamId` | the stream the event belongs to |
| `streamSequence` | 1-based, gap-free; the ordering authority **within** a stream |
| `position` | store-wide commit order; the checkpoint contract **across** streams |
| `recordedAt` | store acceptance time |
| `erasure` | `{ reason, erasedAt }` once erased; `payload` is then `null` |

The **payload/metadata split is load-bearing**: erasure deletes the payload and keeps the
envelope, so the audit chain survives while the content does not.

## Event types in use

| Type | Stream | Meaning |
|---|---|---|
| `run.started` | `run-<id>` | the run's first fact; `payload.input`, metadata `agent`, `agentVersion`, `startedBy`, `startedByKind`; `causationId: null` |
| `run.step.completed` | `run-<id>` | a `ctx.step` or `ctx.state` result; `metadata.stepId` |
| `run.invocation` | `run-<id>` | a capability invocation; `payload {input, result| failure}`, metadata `{stepId, capability, providerId, fiberId, decision, ok, failureKind}` |
| `run.recall` | `run-<id>` | a `ctx.recall` result |
| `run.artifact` | `run-<id>` | `payload {artifactId}` |
| `run.waiting` | `run-<id>` | a continuation was opened; metadata `continuationId` |
| `run.resumed` | `run-<id>` | `payload {input}` |
| `run.wait.closed` | `run-<id>` | `payload {reason}`; metadata `status` |
| `run.completed` | `run-<id>` | `payload {output}`; metadata `agent` |
| `run.failed` | `run-<id>` | `payload {error}` |
| `run.cancelled` | `run-<id>` | `payload {reason}`; metadata `cancelledBy` |
| `state.changed` | `run-<id>` or `run-state-<id>` | `payload {snapshot}` or `{patch}`; metadata `source: "caller"`, `actor` for caller writes |
| `message.delta` | `run-<id>` | `payload {text}`; agent-authored, via `ctx.emit` |
| `ui.render` | `run-<id>` | `payload {component, props}`; generative UI |
| `continuation.opened` / `.resumed` / `.cancelled` / `.expired` / `.failed` / `.blocked` | `continuation-<id>` | the continuation lifecycle |
| `commitment.intended` / `.reconciled` | `commitment-<id>` | external commitment transitions |
| `artifact.created` / `.tombstoned` | `artifact-<id>` | ids, hashes, access, retention — never content |
| `capability.selected` / `capability.outcome` | `capability-selection-<id>` | the learning record |
| `erasure.recorded` | `$erasures` | an erased payload's id, reason, actor |
| any agent `ctx.emit(type, …)` | `run-<id>` | `run.*` is reserved |

Two event types are deliberately **not** projected to AG-UI and are listed as explicitly ignored:
`run.step.completed` (internal replay bookkeeping), `run.resumed`, `run.wait.closed`,
`run.recall`.

## Streams

| Stream | Contents | Notes |
|---|---|---|
| `run-<id>` | the run's events | written only by the executor, CAS on its version |
| `run-state-<id>` | caller-written `state.changed` | a **separate** stream so a caller append cannot race the executor |
| `continuation-<id>` | the continuation lifecycle | one record, one stream |
| `artifact-<id>` | `artifact.created`, `artifact.tombstoned` | |
| `commitment-<id>` | commitment transitions | |
| `$erasures` | `erasure.recorded` | |

## Record collections

| Collection | Key | Holds |
|---|---|---|
| `runs` | `runId` | `{ tenant, agent, correlationId, startedBy, scopeId }` — **ids and routing only** |
| `continuations` | `continuationId` | the full record; internal `lastTransition` never leaks out |
| `commitments` | `commitmentId` | state, attempts, remote ref, idempotency key |
| `artifacts` | `artifactId` | access, retention, representations, state, tombstone |
| `observations` | `eventId` | `{ state, attempts, targetRef, lastError, observationId }` |
| `rvf_snapshots` | snapshot id | lineage, checkpoint, digest, tenants |
| *(projection name)* | caller-chosen | projection state; `public` projections key `<tenant>/<key>` |

All are versioned by compare-and-swap. A write with `expectedVersion: 0` requires the record not to
exist.

## Outbox

| Topic | Committed with | Delivered by |
|---|---|---|
| `run.execute` | `run.started` | the runtime loop → `execute(runId)` |
| `continuation.resume` | a continuation transition | the loop → the `run.resume@1` handler |
| `commitment.dispatch` | `commitment.intended` | `CommitmentService.dispatch()` |
| `observation.deliver` | the observed event | `ObservationDelivery` |

Item id convention: `<topic>:<subject>` (e.g. `run.execute:<runId>`). Status: `pending` →
`delivered` (with a receipt) / `poisoned`, or retried with `retryAt = now + min(maxMs,
baseMs·2^(attempts-1))`. Claim and settle are separate transactions; delivery happens outside the
database. `requeueOutbox(id, now)` is the operator replay path for a poisoned item.

## Projections

```ts
interface Projection { name: string; version: string; apply(event, state): readonly ProjectionWrite[] }
interface ProjectionCheckpoint { name, version, position, status: "ok" | "error", error: { position, eventId, message } | null }
```

The runner applies batches in `position` order and commits derived writes with the checkpoint
atomically. On failure it commits the successful prefix and records the error **at the failing
event** — it does not skip it. A version mismatch yields `rebuild_required`; `rebuild()` replays
from 0. `null` as a write value deletes the key.

## Blobs

`putBlob(bytes)` returns `sha256:<hex>` and is idempotent. `deleteBlob(hash)` is the primitive;
`artifacts` owns the policy (delete only when no available artifact still references the hash).

## The SQLite schema

`packages/store-sqlite/src/schema.ts`, three numbered migrations applied in one transaction and
recorded in `schema_versions`:

1. `event_streams`, `events`, `payloads`, `idempotency`, `records`, `outbox`,
   `projection_checkpoints`, `projection_state`, `blobs`, plus `outbox_topic_idx`.
2. **append-only triggers** — `BEFORE DELETE` always aborts; `BEFORE UPDATE` aborts when a
   causality-bearing column changes or an erasure is already recorded. Enforced in the database so
   raw SQL cannot bypass the API.
3. **partial expression indexes** on `records` for `collection = 'runs'` over
   `json_extract(value, '$.tenant')`, `'$.correlationId'`, `'$.agent'`, so `listRuns` is an index
   search (DEBT-019).

`openSqliteStore({ path })`; `":memory:"` for an ephemeral database. One writer process
(DEBT-011).

## Errors

| Error | Raised when |
|---|---|
| `ConcurrencyError` | a stream or record `expectedVersion` was stale |
| `RecordConflictError` | a record CAS failed |
| `IdempotencyMismatchError` | a key was reused with a different fingerprint |
| `EnvelopeValidationError` | a §10 field is missing, or the payload is not JSON / too large |
| `CheckpointConflictError` | two runners advanced the same projection |
| `NotFoundError` | a record or blob does not exist |

## Source trail

- `packages/events/src/types.ts` — every type above.
- `packages/events/src/validate.ts` — `validateNewEvent`, `MAX_PAYLOAD_BYTES`.
- `packages/events/src/errors.ts` — the error set.
- `packages/store-sqlite/src/schema.ts` — the migrations.
- `packages/store-sqlite/src/index.ts` — `openSqliteStore`, `buildListRecordsQuery`, `erasePayload`.
- `packages/store-memory/src/index.ts` — the same semantics in memory.
- `packages/projections/src/{types,runner}.ts`.
- `packages/continuations/src/continuations.ts`, `commitments.ts` — the lifecycle events.
- `packages/artifacts/src/index.ts` — the artifact events.
- `packages/capabilities/src/selector.ts` — the selection events.
- [../subsystems/durable-state.md](../subsystems/durable-state.md) — the subsystem page.

## Related

- [runtime-service-and-agents.md](runtime-service-and-agents.md) — who writes these.
- [../workflows/run-execution.md](../workflows/run-execution.md) — the main writer.
- [../security.md](../security.md) — erasure, tenants, and secrets.
