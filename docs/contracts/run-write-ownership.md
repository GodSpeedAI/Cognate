# Run-write ownership contract (proposal)

This extension lets a store-backed runtime tell whether it still owns a run's execution and
writes. It closes the gap the fenced outbox leases left open: outbox rows are leased, but run
execution, run-scoped appends and arbitrary external effects performed while executing a run are
not owned or fenced, so a second process recovering a stalled run can race the stalled worker's
writes and effects. As with outbox leases, this mechanism does not make external effects exactly
once; it makes ownership authoritative at the store, fences stale run writes, and makes ownership
loss observable so ambiguous effects can be reconciled instead of blindly repeated.

## Compatibility

The existing `commit` API remains supported unchanged. Stores may additionally expose the fenced
run-ownership methods and accept the optional per-append `runOwnership` credential. A run that was
never claimed stays **unenrolled**: its writes behave exactly as before, so single-process
runtimes and older adapters keep working against the same database. Once a run is enrolled (a
claim exists), uncredited writes to that run are refused — the same enrollment rule the fenced
outbox uses. Do not mix an old binary that issues the previous SQL directly with fenced workers
against the same runs; worker-version admission remains a prerequisite for supported mixed
deployment.

## Ownership rows

The store keeps one ownership row per enrolled run: current owner, a store-maintained lease
generation, and a caller-clock expiration. Generation zero never exists for run ownership (the
absence of a row is the unenrolled state); the first claim assigns generation 1. Every reclaim or
release advances the generation, immediately fencing every earlier worker, even before another
worker claims.

## Fenced claim

`claimRunOwnership({ runId, ownerId, now, leaseMs })` succeeds and returns the current lease when
no row exists, when the caller is already the current owner (a refresh that keeps the generation),
or when the current lease has expired (`expiresAt <= now`, reclaim advances the generation and
replaces the owner). It refuses while a different owner holds an unexpired lease by raising
`RunOwnershipHeldError` carrying the current lease, so the claiming worker backs off with truth
instead of guessing. `now` is caller-observed epoch milliseconds, as in the fenced outbox: this is
not authoritative wall time across machines; clock skew may cause premature or delayed reclaim.
Fencing still prevents an old generation from writing after a newer claim or release.

## Renew and release

`renewRunOwnership(lease, { now, leaseMs })` extends the lease only while the exact owner and
generation are current and unexpired; anything else returns `false` without modifying the row.
`releaseRunOwnership(lease)` completes ownership: it clears the owner and advances the generation,
keeping the row enrolled so late writes from the released generation are refused. Terminal runs
therefore stay fenced after completion.

## Fenced run writes

`CommitRequest` appends may carry a `runOwnership` credential `{ runId, ownerId, generation }`.
Inside the append transaction, for every run named by the commit — the credential's run or any
appended event's `runId` — the store locks the ownership row and applies one rule:

- an enrolled run accepts the write only when the credential exactly matches the current owner
  and generation, whatever the lease expiry (expiry is reclaim eligibility, not ownership loss);
- an enrolled run without a matching credential is refused with `StaleRunOwnerError` and nothing
  is appended;
- an unenrolled run without a credential writes exactly as before (legacy);
- an unenrolled run with a presented credential is refused with `StaleRunOwnerError`: ownership
  must be claimed before it can be presented.

The check runs under the append transaction's existing serialization, so claim, reclaim, release
and append cannot interleave.

## Execution, recovery and ambiguous effects

The executor-side integration is the next bounded slice over this contract: the dispatcher claims
ownership before executing a run, presents the credential on every run-scoped append, renews
around long-running or external-effect steps, halts without retry on `StaleRunOwnerError` (the
run is executing elsewhere), and releases on terminal states; recovery claims a fresh generation
and thereby fences the stalled worker. A worker that loses ownership while a tool invocation is in
flight cannot record that outcome; the recovering owner must observe the prior generation's
started-but-unrecorded step, mark it ambiguous and require reconciliation rather than silently
replaying the external effect. Delivery of external effects remains at least once and target-side
idempotency remains required; this contract supplies authoritative ownership, stale-write
fencing and observable loss, not exactly-once physics.

## Boundary

Run ownership leases the execution right of one run and its run-scoped writes. It does not fence
shared-state threads, commitments, inbox processing or arbitrary external operations, and it does
not authenticate workers; production identities, tenant isolation and aggregate containment
remain separate debts. The SQLite and memory stores remain legacy single-process adapters until
they implement the fenced methods.
