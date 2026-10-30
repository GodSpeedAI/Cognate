# projections / src — deterministic derivation runner

## Overview

Implements the `Projection` port and the `ProjectionRunner` that drives it against a `DurableStore` `[runner.ts:ProjectionRunner]`. The module's exports are exactly `./types.ts` as types plus `ProjectionRunner` and `ProjectionRunnerOptions` `[index.ts:1]`. A projection must be a deterministic derivation from events: any nondeterministic input must already have been recorded as an event `[types.ts:Projection]`.

## Interface

- `Projection` — `name`, `version`, and `apply(event, state) => writes` `[types.ts:Projection]`
- `ProjectionState` — batch-local read view that reflects writes earlier in the same batch `[types.ts:ProjectionState]`
- `ProjectionWrite` — key/value pair where `null` deletes the key `[types.ts:ProjectionWrite]`
- `CatchUpResult` — `ok` with position and applied count, `error` with the failing position/event/message, or `rebuild_required` `[types.ts:CatchUpResult]`
- `ProjectionRunner` — `catchUp`, `retry`, `rebuild`, `start`, `stop`, `waitFor` `[runner.ts:ProjectionRunner]`
- `ProjectionRunnerOptions` — `batchSize`, defaulting to 256 `[runner.ts:ProjectionRunnerOptions]`

## Invariants

- A stored checkpoint whose `version` differs from the projection's version returns `rebuild_required` instead of reinterpreting state `[runner.ts:runOnce]`
- A checkpoint in `error` status is surfaced as an error until `retry` bypasses the error check `[runner.ts:runOnce]`
- Every run — manual or live-triggered — is serialized through one queue so batches never overlap `[runner.ts:ProjectionRunner]`
- A batch's writes and checkpoint commit atomically, and a `CheckpointConflictError` re-reads the checkpoint and restarts from it `[runner.ts:applyBatch]`
- A failure stops at the failing event, still commits prior writes, and records a poison event without advancing past it `[runner.ts:applyBatch]`
- Between batches state is rebuilt from `listProjection`, so `ProjectionState` reflects earlier writes in the same batch `[runner.ts:applyBatch]`
- `waitFor` rejects on timeout rather than resolving optimistically `[runner.ts:waitFor]`

## Side Effects

- Durable reads (`getProjection`, `readAll`, `listProjection`) and writes (`commitProjection`, `failProjection`, `resetProjection`) `[runner.ts:runOnce]`
- Subscription registration on `store.onCommitted` while `start()` is active `[runner.ts:start]`
- `setTimeout` timers for `waitFor` deadlines `[runner.ts:waitFor]`

## Verification

- Run: `cd packages/projections && bun test`
