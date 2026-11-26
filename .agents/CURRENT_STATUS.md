# Current status

**Status revision:** 84

**Stage:** PR 93 pass-3 review addressed: legacy crash states, fence at every effect boundary

**Summary:** Pass 3 (a Sonnet reviewer, not independent) found 1 high, 3 medium, 4 low. A terminal assignment event on the run stream is legacy, not torn: only a terminal on the lifecycle stream with a non-terminal run is re-read, so legacy crash states stay readable, refuse controls, and are finished by appending only the missing run terminal (the executor mirrors the assignment's terminal; cancelRun and recovery use finalizeStoppedRun, which now also handles legacy completed and failed, and a budget-failed run is finalized as failed rather than cancelled). durableGuard returns the length it validated and every commit uses that value; the shared mutable lifecycleLength is gone. The approved second call, artifacts.put and continuations.open are fenced. The breaching actor is recorded in the lifecycle event metadata and reused to cancel continuations. Tests: barrier tests park the guard-only fence before a step callback, an external dispatch, an artifact and a continuation; the multi-runtime interrupt test has no timing; H5 is test.failing with the single-effect expectation. The mixed-version fleet limit stays declared. Earlier snapshot facts are carried forward.

## Verified

- bun test packages/runtime-bun as one command (331 tests, 25 files, 98 s): 313 pass, 1 fail (a PostgreSQL conformance test timing out at 5 s; host load average above 35 from other jobs; service-postgres alone: 27 pass, 1 fail on the self-managed pg0 boot test, 28/28 on the previous commit at lower load; none of these runs a bound assignment); assignment-lifecycle 37/37 (7 failed against ec3f310 sources), assignment 25/25, assignment-streaming 2/2, assignment-multiruntime-postgres 2/2, typecheck clean, check 81/81, runtime-api assignment 74, protocol-connect assignment-wire 2, realitytrace interaction-event 14 and assignment-at17 4
- New packages/runtime-bun/test/assignment-lifecycle.test.ts (14 tests, 1 test.failing known gap) and assignment-multiruntime-postgres.test.ts: against b4f2195 sources 8 of 12 lifecycle tests and the multi-runtime test failed; after the change all pass
- bun run typecheck clean; bun run check substrate 81/81
- Each run alone: runtime-bun assignment 25, assignment-streaming 2, assignment-lifecycle 14, service 53, rlm 15, observation 11, cognition 2; with isolated PostgreSQL (pg0 port 5438): shutdown-recovery 2, run-ownership 3, concurrency 11, service-postgres 28, assignment-multiruntime-postgres 1; runtime-api assignment 74; protocol-connect assignment-wire 2; realitytrace interaction-event 14, assignment-at17 4

## Limits

- The observation ordering coordinate of a progress event reads the lifecycle length at its guard; a control committing between that read and the commit can tie with it (not decreasing across controls read consistently)
- Not run against Cognate Workbench's browser journey; the fix reaches it only after a release and dependency bump
- Full bun test packages/runtime-bun not run as one command; files were run individually
- DEBT-034: resume re-runs the agent body, so effects outside a completed step repeat (known gap, exact double-effect test)
- Mixed-version fleets are unsupported for assignment runs (drain, then upgrade); no version fence

## Next

Re-review PR 93, merge, release Cognate, bump the dependency in Workbench and drop the refusal retry in its handoff tests; then DEBT-034.

## Evidence

- packages/runtime-bun/src/assignment.ts (readLifecycle, foldAssignment, append, finalizeStoppedRun)
- packages/runtime-bun/src/executor.ts (durableGuard, terminal commit loop)
- packages/runtime-bun/src/service.ts (cancelRun)
- packages/runtime-bun/src/fold.ts (assignmentControlStream)
- packages/runtime-bun/test/assignment-lifecycle.test.ts
- packages/runtime-bun/test/assignment-multiruntime-postgres.test.ts
- .agents/DEBT.md DEBT-033, DEBT-034
