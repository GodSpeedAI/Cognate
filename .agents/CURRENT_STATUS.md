# Current status

**Status revision:** 87

**Stage:** PR 93 delta-6 review addressed

**Summary:** Final delta check of cbb3857 found 3 low. A continuation cancel that fails after a bound run's terminal committed is now retried: settleTerminalRun (idempotent, only for runs with an assignment) runs from the executor's terminal early return, cancelRun's terminal early return and startup recovery. A cancel of a legacy-failed run finishes it as run.failed with the recorded reason instead of overwriting it with run.cancelled (comments and EGM.md corrected); a legacy-completed one stays cancellable. finalizeStoppedRun lost its unused actor parameter and falls back to the principal recorded on a legacy run-stream failure for attribution. Earlier snapshot facts are carried forward.

## Verified

- assignment-lifecycle 48/48 (4 failed against cbb3857 sources), assignment 25, assignment-streaming 2, assignment-multiruntime-postgres 3, service-postgres alone 28/28, runtime-api assignment 74, protocol-connect assignment-wire 2, realitytrace interaction-event 14 and assignment-at17 4; typecheck clean; check 81/81; the one-command runtime-bun suite was not run on this head (left to a quiet window)
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
