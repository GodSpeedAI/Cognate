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
Inside the append transaction, for every run named by the commit — a presented credential or an
appended event's `runId` — the store locks the ownership row and applies one rule:

- a credential presented for an enrolled run must exactly match the current owner and generation,
  whatever the lease expiry (expiry is reclaim eligibility, not ownership loss); a mismatch is
  refused with `StaleRunOwnerError` and nothing is appended;
- an uncredited write to an enrolled run is an administrative write — cancellation, continuation
  resolution, artifacts and erasure from other processes — and commits under its own
  authorization, which is separate from execution ownership;
- an unenrolled run without a credential writes exactly as before (legacy);
- an unenrolled run with a presented credential is refused with `StaleRunOwnerError`: ownership
  must be claimed before it can be presented.

The executor presents its credential on every run-scoped append, so a stale worker — the only
writer that can re-execute a step — is fenced at its first write after ownership loss. Old
binaries that never present credentials are not fenced; do not mix them with fenced workers.

The check runs under the append transaction's existing serialization, so claim, reclaim, release
and append cannot interleave.

## Execution, recovery and ambiguous effects

The executor integrates the contract directly: before executing a run it claims ownership (a
held lease from another live worker makes it back off — that worker is executing the run), it
presents the credential on every run-scoped append (run events and the thread-state updates its
steps write), it renews the lease before each capability invocation so a lost lease is detected
before the next external effect, it halts without retry on `StaleRunOwnerError` (the run is
executing elsewhere), and it releases ownership when its execution pass ends, so a suspended run's
resumer always claims fresh. Ownership is claimed automatically when the store implements the
extension; SQLite and memory stores keep the legacy single-process behavior.

Worker identity is per runtime instance, so a process restart reclaims with a new generation. The
executor stamps the owning generation on its `run.invocation.progress` events. When a recovering
owner re-enters an invocation that a previous generation started but never finished — progress
events exist with no recorded outcome — two behaviors are configured through
`execution.runOwnership.ambiguousSteps`:

- `reexecute` (default, the historical behavior) re-runs the handler under a fresh attempt number,
  preserving single-process restart semantics;
- `wait` records a `run.invocation.ambiguous` event and opens an `ambiguous-invocation`
  continuation: the recovering owner does not re-perform the external effect. The reconciler
  resolves the continuation with the observed outcome (`{ result }` or `{ failure }`), or lets it
  expire, and the run proceeds from that resolution.

Either way, delivery of external effects remains at least once and target-side idempotency
remains required; an invocation that left no trace at all (no progress, no outcome) cannot be
distinguished from one that never started and re-executes. This contract supplies authoritative
ownership, stale-write fencing and observable loss, not exactly-once physics.

## Boundary

Run ownership leases the execution right of one run and its run-scoped writes. It does not fence
shared-state threads, commitments, inbox processing or arbitrary external operations, and it does
not authenticate workers; production identities, tenant isolation and aggregate containment
remain separate debts. The SQLite and memory stores remain legacy single-process adapters until
they implement the fenced methods.
