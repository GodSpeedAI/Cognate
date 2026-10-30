# continuations source

## Overview
Durable continuations and external commitments on the durable store (package description; [package.json:description]). `ContinuationService` implements spec §12 suspension and resume; `CommitmentService` implements spec §9.3 external effects with an explicit unknown state. Both are exported from the single package entry [src/index.ts:1].

## Interface
- `ContinuationService` — `open`, `get`, `list`, `resume`, `cancel`, `fail`, `expireDue`, `dispatchResumes`, `unblock`, `redactForRun`, `registerHandler` [src/continuations.ts:ContinuationService]
- `ContinuationServiceOptions` — `policy`, `now`, `ids`, `delivery` backoff, `deliveryConcurrency`, `deliveryAdmission` [src/continuations.ts:ContinuationServiceOptions]
- `CommitmentService` — `intend`, `get`, `dispatch`, `reconcile`, `resolveManually`, `compensate`, `registerTarget` [src/commitments.ts:CommitmentService]
- `CommitmentServiceOptions`, `IntendCommitment` [src/commitments.ts:IntendCommitment]
- `ContinuationStatus`, `ContinuationRecord`, `OpenContinuation`, `ContinuationAction`, `TransitionOutcome`, `ContinuationPolicy`, `ResumeHandler` [src/types.ts:ContinuationRecord]
- `CommitmentState`, `CommitmentRecord`, `CommitmentTarget`, `CommitmentRejectedError` [src/types.ts:CommitmentRecord]

## Invariants
- A record never holds a closure; resume goes through a registered handler id/version [src/types.ts:ContinuationRecord]
- One transition commits the CAS record, a `continuation-<id>` event, the idempotency result, and any resume outbox intent in a single decision [src/continuations.ts:ContinuationService]
- A handler that cannot interpret the stored version yields `BLOCKED` and appends `continuation.blocked` instead of resuming [src/continuations.ts:resume]
- `resume` and `cancel` retry a bounded five times on `RecordConflictError` / `ConcurrencyError`, then fall back to the terminal record [src/continuations.ts:resume]
- `expectedVersion`, when supplied, is a compare-and-swap check returning `version_mismatch` [src/continuations.ts:resume]
- Only an `OPEN` record is authorized by `ContinuationPolicy`; other statuses return `already_terminal` [src/continuations.ts:guard]
- `redactForRun` tombstones `payload` and `resolution.input`, appends `continuation.redacted`, and erases the transition events; it is idempotent so an interrupted pass can be retried [src/continuations.ts:redactForRun]
- Commitments move `INTENDED → DISPATCHING → SUCCEEDED | FAILED | UNKNOWN_RECONCILIATION_REQUIRED`; compensation is a separate commitment and the original record is never modified [src/types.ts:CommitmentRecord]
- `CommitmentRejectedError` from `dispatch` means the target definitively refused and the effect did not happen; any other error is an unknown outcome awaiting reconciliation [src/types.ts:CommitmentRejectedError]
- `targetIdempotent` is true only when the target documents dedup by idempotency key [src/types.ts:CommitmentRecord]

## Side Effects
- Durable commits on `continuation-<id>` and `commitment-<id>` streams plus the `continuations` / `commitments` record collections [src/continuations.ts:open]
- Outbox intents on `continuation.resume` and `commitment.dispatch`, delivered by an `OutboxDispatcher` with bounded backoff [src/continuations.ts:ContinuationService]
- `Date.now()` / ISO timestamps via the injectable `now` clock and `crypto.randomUUID()` ids by default [src/continuations.ts:ContinuationService]

## Verification
- Run: `cd packages/continuations && bun test`
