# store-memory / src — in-memory DurableStore

## Overview

An in-process implementation of the `DurableStore` port from `@godspeedai/cognate-events`, exporting only `createMemoryStore` `[index.ts:createMemoryStore]`. All state lives in one mutable structure holding event arrays, per-stream versions, records, outbox items and lease generations, idempotency entries, projection checkpoints and rows, blobs, listeners, and the global position counter `[index.ts:State]`. It reuses the port's own `validateNewEvent` and error classes rather than redefining them `[index.ts:1]`.

## Interface

- `createMemoryStore` — returns a `DurableStore` with no open, close-on-dispose lifecycle beyond `close()` `[index.ts:createMemoryStore]`
- `State` — internal container for every store structure `[index.ts:State]`
- `settleOutboxItem` — internal settlement mapping to `delivered`, `pending` with `availableAt`, or `poisoned` `[index.ts:settleOutboxItem]`
- `buildStoredEvent` — internal envelope constructor from a `NewEvent` plus stream sequence and position `[index.ts:buildStoredEvent]`
- `recordKey` / `idempotencyKey` — internal NUL-joined composite keys `[index.ts:recordKey]`

## Invariants

- Values are deep-cloned with `structuredClone` on the way in and out, so callers never share mutable state with the store `[index.ts:clone]`
- A retry settlement returns the item to `pending` with a new `availableAt` and the recorded error; a poison settlement clears availability and stores the error `[index.ts:settleOutboxItem]`
- Records, idempotency entries, and outbox keys are namespaced with a NUL separator, so collection and id cannot collide `[index.ts:recordKey]`
- Every appended event is validated with `validateNewEvent` from the events port before commit `[index.ts:1]`
- Commit conflicts raise the port's own `ConcurrencyError`, `RecordConflictError`, `IdempotencyMismatchError`, `CheckpointConflictError`, and `NotFoundError` `[index.ts:2]`

## Side Effects

- Process memory only: no file, network, or subprocess effect `[index.ts:State]`
- `node:crypto` used for `randomUUID` and content hashing of blobs `[index.ts:1]`
- In-process listener invocation on `onCommitted` after a commit `[index.ts:State]`

## Verification

- Run: `cd packages/store-memory && bun test`
