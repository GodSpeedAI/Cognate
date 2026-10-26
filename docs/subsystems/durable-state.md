# Subsystem: durable state

## Purpose

Hold what happened, in a form that can be appended to atomically, folded deterministically, and
survived by anything that needs to rebuild itself.

The invariant this implements is argued in
[../explanation/why-projection-not-storage.md](../explanation/why-projection-not-storage.md); this
page is the mechanism and the exact field/table shapes. The catalog of event types, streams, and
collections is in [../reference/events-and-stores.md](../reference/events-and-stores.md).

## Responsibilities

- The event envelope and the store port (`packages/events`), plus the conformance kit every store
  must pass (`CG-EVT-008`).
- The authoritative SQLite implementation (`packages/store-sqlite`) for single-process low-latency apps.
- The authoritative PostgreSQL implementation (`packages/store-postgres`, [ADR-0013](../decisions/ADR-0013-postgresql-authoritative-store.md)) for multi-worker environments with locked-counter commit ordering and cross-process LISTEN/NOTIFY.
- An in-memory twin with the same semantics for tests (`packages/store-memory`).
- Checkpointed, rebuildable projections (`packages/projections`).
- At-least-once delivery of work committed alongside an event (the outbox dispatcher with fenced leases, [contracts/fenced-outbox-leases.md](../contracts/fenced-outbox-leases.md)).
- Multi-process run ownership and write fencing (`claimRunOwnership`, [contracts/run-write-ownership.md](../contracts/run-write-ownership.md)).

> **Interactive model:** Simulate outbox `FOR UPDATE SKIP LOCKED` leases, heartbeat renewal, and two-worker run ownership fencing in the **[Concurrency, Fenced Outbox & Ownership Simulator](../explainers/concurrency-and-leases.html)**.

## Non-responsibilities

- It does not decide *what* to record; the runtime, continuations, artifacts, and capabilities do.
- It is not queried directly by application code. Reads go through folds and the service.
- It does not implement erasure policy, only the primitive (`erasePayload`) plus a
  `$erasures` stream.
- It is not a document store: payloads are JSON with a 1 MiB ceiling, and there is no update or
  delete on the events table.

## Position in the system

Everything durable depends on `events`. `runtime-bun` owns one store; `continuations`,
`artifacts`, `capabilities`, `cognitive-rvf`, and `realitytrace` all write through it. `events`
depends only on `kernel-api` (for `SemanticRef`). `store-sqlite`, `store-postgres`, and `store-memory` depend only on
`events`. `projections` depends only on `events`.

## Core abstractions

- **`NewEvent`** — what a decision submits: `eventType`, `schemaVersion`, `occurredAt` (source-
  claimed, provenance only), `tenant`, `correlationId`, `causationId`, `runId`, `scopeId`,
  optional `componentId`/`fiberId`/`semanticRef`, `payload`, `metadata`, optional `eventId`.
- **`StoredEvent`** — what the store returns: the above plus `streamId`, `streamSequence`
  (1-based, gap-free, the ordering authority *within* a stream), `position` (store-wide commit
  order, the checkpoint contract *across* streams), `recordedAt`, and an `erasure` marker.
- **`StreamAppend`** — `{ streamId, expectedVersion, events }`, a compare-and-swap.
- **`RecordWrite`** — `{ collection, id, expectedVersion, value }`.
- **`OutboxIntent`** — `{ id, topic, payload }` committed atomically with the events.
- **`CommitRequest`** — `{ idempotency?, appends, records?, outbox?, result? }`. Everything in one
  request commits or none of it does.
- **`DurableStore`** — the port: `commit`, `streamVersion`, `readStream`, `readAll`, `getEvent`,
  `onCommitted`, record CRUD, outbox claim/settle/requeue/list, projection checkpoint/state,
  blobs, `erasePayload`, `close`.

## Internal operation

`store-sqlite` keeps payloads in a **separate `payloads` table** from the `events` envelope. That
is the mechanism behind erasure: `erasePayload` can delete content while `event_id`, `position`,
`causation_id`, `correlation_id`, and timing all survive.

Migrations are numbered and recorded in `schema_versions`, applied in one `db.transaction(...).immediate()`:

1. base tables: `event_streams`, `events`, `payloads`, `idempotency`, `records`, `outbox`,
   `projection_checkpoints`, `projection_state`, `blobs`;
2. **append-only triggers** — `BEFORE DELETE` always aborts; `BEFORE UPDATE` aborts when any
   causality-bearing column changes or an erasure is already recorded. Enforced in the database so
   raw SQL cannot bypass the API (`CG-EVT-007`);
3. **partial expression indexes** on `records` for `collection = 'runs'` over
   `json_extract(value, '$.tenant' | '$.correlationId' | '$.agent')`, so `listRuns` is an index
   search rather than a scan (DEBT-019).

`buildListRecordsQuery` is exported so a test can run `EXPLAIN QUERY PLAN` on the *exact* SQL the
real code path executes. It inlines the collection name (SQLite only matches a partial index
against a literal, not a bound parameter) and adds an `INDEXED BY` hint, because without statistics
the planner may prefer the always-present `(collection, id)` primary key on a small table.

`OutboxDispatcher.drain` claims available items under a lease, calls `deliver`, and settles each
one as `delivered` (with a receipt), `retry` (with `retryAt = now + min(maxMs, baseMs·2^(attempts-1))`),
or `poisoned` (a `PermanentDeliveryError`, or `attempts >= maxAttempts`).

`ProjectionRunner` applies batches in `position` order and commits derived writes **with** the
checkpoint, atomically. On failure it commits the successful prefix and records the error at the
failing event rather than skipping it. A stored checkpoint whose `version` differs yields
`rebuild_required`; `rebuild()` replays from position 0.

## State

Collections in use: `runs`, `continuations`, `commitments`, `artifacts`, `observations`,
`rvf_snapshots`, plus each projection's own name. Streams: `run-<id>`, `run-state-<id>`,
`continuation-<id>`, `artifact-<id>`, `$erasures`. Outbox topics: `run.execute`,
`continuation.resume`, `commitment.dispatch`, `observation.deliver`.

Consistency boundaries: one `BEGIN IMMEDIATE` transaction per `commit`; claim and settle are
separate transactions by design (delivery happens outside the database). A single writer process
is assumed (DEBT-011) — `store-sqlite`'s own `AGENTS.md` requires `commit` to stay free of `await`
before the transaction call so same-process concurrency serializes correctly.

## Lifecycle

Open → migrate → use → (optionally) erase individual payloads → close. Reopening the same file
resumes from the recorded schema version; a closed store's data is the only durable state in the
system apart from `.sea` digests and RVF files.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| `ConcurrencyError` | `expectedVersion` was stale | re-read and re-decide; the executor retries automatically |
| `RecordConflictError` | a record CAS failed | re-read the record, re-check state, retry |
| `IdempotencyMismatchError` | key reused with a different fingerprint | use a new key; the service maps it to `already_exists` |
| `EnvelopeValidationError` | missing §10 field, non-JSON payload, or > 1 MiB | fix the event; the store fails closed |
| `CheckpointConflictError` | two runners advancing one projection | one runner per name |
| projection status `error` | a handler threw at a recorded position | fix the handler, then `rebuild()` or `retry()` |
| `events are append-only` from SQLite | a direct DELETE/UPDATE | there is none — correct an event by appending another |
| `FsyncFailed` under RVF concurrency | upstream RVF 0.3.4 | DEBT-018; the E2E app retries |
| second writer process | unsupported configuration | DEBT-011; run one writer |

## Extension points

- **A new store** — implement `DurableStore` and pass `events/conformance` unchanged. This is how
  `store-memory` exists.
- **A new projection** — `{ name, version, apply(event, state) }`. State access is
  `get`/`set`/`delete`; writes are committed with the checkpoint. A projection marked `public` is
  readable through `RuntimeService.readProjection`, and public projections must key state
  `<tenant>/<key>` — the service strips that prefix and returns only the caller's partition.
- **A new outbox topic** — a dispatcher of your own, following the at-least-once contract. The
  runtime uses three: `run.execute`, `continuation.resume`, `commitment.dispatch`.
- **Blobs** — `putBlob`/`getBlob`/`deleteBlob`; `artifacts` owns the GC policy.

Not extension points: the `events` table shape, `streamSequence`/`position` semantics, the
append-only triggers, or `foldRun`/`foldState`.

## Source trail

- `packages/events/src/types.ts` — every type above.
- `packages/events/src/validate.ts` — `validateNewEvent`, `MAX_PAYLOAD_BYTES` (1 MiB), the JSON
  depth limit of 64.
- `packages/events/src/dispatcher.ts` — `OutboxDispatcher`, `PermanentDeliveryError`, `delayFor`.
- `packages/events/src/conformance.ts` — the store kit.
- `packages/store-sqlite/src/schema.ts` — `MIGRATIONS`, `migrate`.
- `packages/store-sqlite/src/index.ts` — `openSqliteStore`, `buildListRecordsQuery`, `erasePayload`.
- `packages/store-sqlite/test/runs-index.test.ts` — `EXPLAIN QUERY PLAN` on the real query.
- `packages/store-memory/src/index.ts` — the in-memory twin.
- `packages/projections/src/runner.ts` — `ProjectionRunner`, `catchUp`, `rebuild`, `retry`.
- `tests/integration/{append-only,rebuild,crash,second-process,erasure}.test.ts`.
- [../reference/events-and-stores.md](../reference/events-and-stores.md) — the full event and
  record catalog.

## Related

- [../mental-model.md](../mental-model.md) — why everything is a fold.
- [runtime.md](runtime.md) — the main consumer.
- [../workflows/run-execution.md](../workflows/run-execution.md) — a write-heavy trace.
- [../security.md](../security.md) — erasure and the payload/metadata split.
