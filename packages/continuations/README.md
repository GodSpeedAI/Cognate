# @godspeedai/cognate-continuations

Durable continuations and external commitments (spec §9.3, §12).

## Continuations

States: `OPEN → RESUMED | CANCELLED | EXPIRED | FAILED`; `RESUMED` can also land in
`BLOCKED` (unsupported handler version) and return via `unblock` to `RESUMED`.

Every transition is one `store.commit`: a CAS write to the `continuations` record
plus one event on `continuation-<id>` plus an idempotency entry keyed by
`${actor.id}:continuation.<action>` + the caller's idempotency key, so a repeated
key returns the original result (`duplicate`) instead of transitioning twice. A
losing race (`RecordConflictError`/`ConcurrencyError`) triggers a re-read; if the
record is now terminal the caller gets `already_terminal`, never a second
terminal event.

Resume delivery is at-least-once via the outbox (topic `continuation.resume`),
drained by `OutboxDispatcher`. A missing handler retries with backoff; a
registered handler whose `supports()` rejects the stored version poisons the
outbox item and commits `RESUMED → BLOCKED`.

## Commitments

States: `INTENDED → DISPATCHING → SUCCEEDED | FAILED | UNKNOWN_RECONCILIATION_REQUIRED`.

`intend` commits `INTENDED` + an outbox dispatch intent (topic
`commitment.dispatch`) atomically, idempotent by `idempotencyKey` per
target+operation. `dispatch` commits `DISPATCHING` (attempts+1) *before*
calling the target; success is `SUCCEEDED`, `CommitmentRejectedError` is
`FAILED` (no retry), any other error is `UNKNOWN_RECONCILIATION_REQUIRED` and
retried only if the target is idempotent (otherwise poisoned). Finding a
record already `DISPATCHING` on claim (crash) skips the target call entirely
for non-idempotent targets. `reconcile` asks `target.status`; `resolveManually`
appends `commitment.reconciled`; `compensate` requires `SUCCEEDED` and creates
a new record with `compensates` set — the original is never mutated.
