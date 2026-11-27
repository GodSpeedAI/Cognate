# Current status

**Status revision:** 86

**Stage:** PR 93 delta-5 review addressed

**Summary:** Delta check of 34a167d found 1 medium and 3 low. A cancel of a legacy crash-state run is no longer refused: it commits only run.cancelled and leaves the recorded assignment state, so a re-run that parks or hangs can be ended (tested with a legacy-completed run parked on a wait). A legacy-failed run is finished as run.failed with its recorded reason without re-running the agent body (tested: the body runs once); a legacy-completed run is still re-run, its repeated effects are documented in EGM.md, and a failed re-run now says the assignment had completed before the crash. Continuation attribution is 'unknown' when no breacher was recorded, never the canceller, and a denied continuation cancel is a failure (not exercisable through the runtime, whose continuation policy allows everything). A PostgreSQL progress-fence test was added (the earlier PostgreSQL interrupt-before-terminal and cancel ordering test already existed, contrary to the reviewer's note). Earlier snapshot facts are carried forward.

## Verified

- host load average stayed 29-39 (other sessions) throughout this pass, so timing-sensitive PostgreSQL files flake at the default 5 s: bun test --timeout 60000 packages/runtime-bun as one command (340 tests, 25 files, 167 s): 322 pass, 1 fail (concurrency.test.ts capacity-two overlap, 2.5 s; the file alone passed 11/11 twice); service-postgres alone at default timeout 27/28 (conformance timeouts) and with --timeout 60000 27/28 (the self-managed pg0 boot test, 30 s internal limit), 28/28 on the two previous commits at lower load; assignment-lifecycle 45/45 (6 failed against 34a167d sources), assignment 25, assignment-streaming 2, assignment-multiruntime-postgres 3; runtime-api assignment 74, protocol-connect assignment-wire 2, realitytrace interaction-event 14 and assignment-at17 4; typecheck clean; check 81/81
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
