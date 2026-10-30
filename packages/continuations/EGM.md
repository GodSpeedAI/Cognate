# continuations

## Overview

Durable continuations and external commitments layered on the `DurableStore` port `[src/index.ts:1]`. Each continuation transition commits the record (CAS), an event on stream `continuation-<id>`, the idempotency result, and any resume outbox intent in one decision `[src/continuations.ts:ContinuationService]`. Commitments model an external side effect as INTENT → DISPATCHING → SUCCEEDED | FAILED | UNKNOWN_RECONCILIATION_REQUIRED `[src/commitments.ts:CommitmentService]`. The entry point re-exports `./types.ts`, `CommitmentRejectedError`, `ContinuationService`, and `CommitmentService` `[src/index.ts:1]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — continuation lifecycle and commitment dispatch over the store `[src/continuations.ts:ContinuationService]`
- test/ — `lifecycle.test.ts` and `commitments.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- `ContinuationStatus` is exactly `OPEN`, `RESUMED`, `CANCELLED`, `EXPIRED`, `FAILED`, `BLOCKED` `[src/types.ts:ContinuationStatus]`
- `CommitmentState` is exactly `INTENDED`, `DISPATCHING`, `SUCCEEDED`, `FAILED`, `UNKNOWN_RECONCILIATION_REQUIRED` `[src/types.ts:CommitmentState]`
- Continuation records live in collection `continuations` and resume deliveries use outbox topic `continuation.resume` `[src/continuations.ts:COLLECTION]`
- Commitments live in collection `commitments` and dispatch on outbox topic `commitment.dispatch` `[src/commitments.ts:COLLECTION]`
- A commitment is never a reversible effect; compensation must be a separate commitment `[src/commitments.ts:CommitmentService]`
- Default commitment backoff is 1000 ms base, 30000 ms max, 8 attempts `[src/commitments.ts:CommitmentService]`
- Handler registration returns an unregister function, so the effect is reversible `[src/continuations.ts:registerHandler]`
- A rejected commitment raises `CommitmentRejectedError` `[src/index.ts:CommitmentRejectedError]`

## Global Side Effects

- Durable commits through the injected `DurableStore`, including outbox intents `[src/continuations.ts:ContinuationService]`
- Clock reads via the injectable `now` (default `Date.now`) and ids via injectable `ids` (default `randomUUID`) `[src/continuations.ts:ContinuationService]`
- Outbox delivery of resumed continuations and commitment dispatch through `OutboxDispatcher` `[src/continuations.ts:1]`

## Verification

- Run: `cd packages/continuations && bun test`
