# events source — durable state plane contract

## Overview
This directory is the durable-state contract every store adapter satisfies (spec §7.3, §10, §11, §13): the `NewEvent`/`StoredEvent` envelope and `DurableStore` port, envelope validation, canonical request fingerprinting, the at-least-once outbox dispatcher, and a store conformance kit. `src/index.ts` re-exports all of it, and `./conformance` is a separate entry point [package.json:exports].

## Interface
- `DurableStore` — the store port: `commit`, stream/record reads, outbox claim and settle, projection checkpoints, blobs, `erasePayload`, `close` [src/types.ts:DurableStore]
- `NewEvent`, `StoredEvent`, `StreamAppend`, `RecordWrite`, `StoredRecord`, `CommitRequest`, `CommitOutcome`, `Idempotency` [src/types.ts:StoredEvent]
- `OutboxIntent`, `OutboxItem`, `OutboxStatus`, `OutboxSettlement`, `OutboxLease*`, `RunOwnership*`, `ProjectionCheckpoint`, `ProjectionSnapshot`, `ProjectionCommit`, `StoreHandle`, `StoreFactory` [src/types.ts:OutboxSettlement]
- `ConcurrencyError`, `RecordConflictError`, `IdempotencyMismatchError`, `EnvelopeValidationError`, `CheckpointConflictError`, `NotFoundError`, `StaleRunOwnerError`, `RunOwnershipHeldError` [src/errors.ts:ConcurrencyError]
- `validateNewEvent(event)` and `MAX_PAYLOAD_BYTES` (1 048 576) [src/validate.ts:MAX_PAYLOAD_BYTES]
- `fingerprint(value)` — key-order-independent sha256 request fingerprint [src/fingerprint.ts:fingerprint]
- `OutboxDispatcher`, `PermanentDeliveryError`, `Backoff`, `OutboxAdmission`, `DrainReport` [src/dispatcher.ts:OutboxDispatcher]
- `readProjectionSnapshot(store, name)`, `readProjectionSnapshotFallback(store, name)` [src/snapshot.ts:readProjectionSnapshot]
- `storeConformance(name, factory, options)`, `event(...)`, `StoreKitOptions` on the `./conformance` entry [src/conformance.ts:storeConformance]

## Invariants
- `streamSequence` is the gap-free per-stream ordering authority; `position` is store-wide commit order and `occurredAt` is provenance only [src/types.ts:StoredEvent]
- One `commit` applies appends, record writes, outbox intents, and result atomically, throwing `ConcurrencyError` / `RecordConflictError` / `IdempotencyMismatchError` and failing closed [src/types.ts:DurableStore]
- `eventType` must be lower-case dotted text, `payload` must be JSON under `MAX_PAYLOAD_BYTES`, and issues raise `EnvelopeValidationError` [src/validate.ts:validateNewEvent]
- A projection commit must match the stored `fromPosition`; `failProjection` records a poison event without advancing the checkpoint [src/types.ts:DurableStore]
- The fallback snapshot reads the checkpoint before the rows, so the reported checkpoint is never ahead of the rows [src/snapshot.ts:readProjectionSnapshotFallback]
- Dispatcher concurrency above one requires all three fenced lease methods, and the retry delay is `min(maxMs, baseMs * 2^(attempt-1))` [src/dispatcher.ts:drain, src/dispatcher.ts:delayFor]
- `PermanentDeliveryError` or `attempts >= backoff.maxAttempts` poisons an item instead of retrying it [src/dispatcher.ts:drain]
- `erasePayload` removes the payload, keeps the envelope, and appends `erasure.recorded` to stream `$erasures` [src/types.ts:DurableStore]

## Side Effects
- SHA-256 hashing through `node:crypto` [src/fingerprint.ts:fingerprint]
- Committed-event listeners are invoked only after the transaction commits [src/types.ts:DurableStore]
- Lease heartbeat and abort timers run while a delivery is in flight [src/dispatcher.ts:drain]
- The conformance entry imports `bun:test` and registers suites when called [src/conformance.ts:storeConformance]

## Verification
- Run: `cd packages/events && bun test`
