# Run-write ownership evidence

Store-level slice of the run-write ownership contract
([contracts/run-write-ownership.md](../contracts/run-write-ownership.md)). RED/GREEN regressions
live in `packages/store-postgres/test/run-ownership.test.ts`; all three failed before the
extension existed (observed: `claimRunOwnership is not a function`) and pass after it.

## Observed

- `bun test packages/store-postgres/test/run-ownership.test.ts` — 3 pass / 71 assertions:
  exclusive claim with held-lease refusal, same-owner refresh, exact-identity renewal, reclaim
  after expiry with generation advance, release-keeps-enrollment, enrolled-run write fencing by
  owner and generation, fail-closed uncredited and wrong-owner writes, credential/runId smuggling
  refusal, legacy behavior for unenrolled runs, refused never-claimed credential, and a
  two-handle (two-process) journey where a reclaimed owner fences the killed owner's late write
  with nothing appended.
- `bun test packages/store-postgres` — 42 pass (conformance, commit order, idempotency pool,
  SQLite migration included), so the migration to schema version 5 and the commit-phase fencing
  preserve every existing store behavior.
- `bun test packages/runtime-bun` with the pinned pg0 on PATH — 155 pass / 0 fail / 17
  pre-existing skips: the executor's current writes are unenrolled and unchanged.
- `bun test packages/events` — passes; the extension types and errors are additive and optional.
- `PATH=<pinned pg0> just verify` — 81/81 gates pass on this branch head (the fixed-port E2E gate
  flakes occasionally when its port lingers between back-to-back runs; three consecutive runs
  observed 81/81).

## Boundary

This slice owns the store seam only. The executor-side integration is the next bounded change:
the dispatcher must claim ownership before executing a run, present the credential on every
run-scoped append, renew around external-effect steps, halt without retry on
`StaleRunOwnerError`, release on terminal states, and mark a prior generation's
started-but-unrecorded step ambiguous for reconciliation instead of replaying it. External
effects remain at least once; exactly-once physics is not claimed. The SQLite and memory stores
remain legacy single-process adapters until they implement the fenced methods. No merge,
publication or Workbench consumption has occurred; Workbench still consumes only published 0.5.0
packages.
