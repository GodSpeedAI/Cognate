# Run-write ownership evidence

The run-write ownership contract
([contracts/run-write-ownership.md](../contracts/run-write-ownership.md)) is implemented at both
seams. RED/GREEN regressions live in `packages/store-postgres/test/run-ownership.test.ts` (store)
and `packages/runtime-bun/test/run-ownership.test.ts` (two-process runtime); the store journeys
all failed before the extension existed (observed: `claimRunOwnership is not a function`) and pass
after it.

## Observed

- `bun test packages/store-postgres/test/run-ownership.test.ts` — 3 pass / 78 assertions:
  exclusive claim with held-lease refusal, same-owner refresh, exact-identity renewal, reclaim
  after expiry with generation advance, release-keeps-enrollment, enrolled-run write fencing by
  owner and generation, refused wrong-owner and stale-generation credentialed writes with nothing
  appended, administrative uncredited writes committing under their own authorization, the
  credential-smuggling refusal, legacy behavior for unenrolled runs, refused never-claimed
  credential, and a two-handle (two-process) journey where a reclaimed owner fences the killed
  owner's late write.
- `bun test packages/runtime-bun/test/run-ownership.test.ts` — 2 pass / 11 assertions against two
  runtimes on one PostgreSQL store: the recovering worker reclaims after lease expiry, the stalled
  worker's late outcome write is fenced with no `run.invocation` recorded and the handler executed
  exactly once, the interrupted effect is recorded as `run.invocation.ambiguous` and the run
  completes only from an explicit reconciliation resolution under `ambiguousSteps: "wait"`; and the
  default `reexecute` mode preserves the historical restart behavior (handler re-executed under a
  fresh attempt number, no ambiguity event).
- `bun test packages/store-postgres` — 42 pass (conformance, commit order, idempotency pool,
  SQLite migration included): the migration to schema version 5 and the commit-phase fencing
  preserve every existing store behavior, and the PostgreSQL conformance kit passes with claims
  active.
- `bun test packages/runtime-bun` with the pinned pg0 on PATH — 174 pass / 0 fail / 17
  pre-existing skips: single-process execution is unchanged with automatic claiming (same-owner
  claims refresh without advancing generations, so intra-process recovery keeps replay semantics).
- `bun test packages/events` — passes; the extension types and errors are additive and optional.
- `PATH=<pinned pg0> just verify` — 81/81 gates pass on this branch head (the fixed-port E2E gate
  flakes when its port lingers between back-to-back runs; the gate passes individually and in
  consecutive full runs).

## Boundary

The executor claims ownership before every execution pass, presents its credential on every
run-scoped append (run events and thread-state updates), renews the lease before each capability
invocation, halts without retry on `StaleRunOwnerError`, and releases on pass end so suspended
runs are always claimed fresh by their resumer. External effects remain at least once: an
invocation that left no trace (no progress, no outcome) cannot be distinguished from one that
never started and re-executes; `ambiguousSteps: "wait"` gates only when a previous generation's
trace exists. Exactly-once physics is not claimed. The SQLite and memory stores remain legacy
single-process adapters until they implement the fenced methods. No merge, publication or
Workbench consumption has occurred; Workbench still consumes only published 0.5.0 packages.

