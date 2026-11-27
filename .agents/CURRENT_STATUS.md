# Current status

**Status revision:** 85

**Stage:** PR 93 delta-4 review addressed

**Summary:** Delta check of ee96962 found 2 medium and 2 low plus a test gap. cancelRun on a budget-stopped run now finalizes first and aborts the local pass only after that commits (a finalization that cannot commit throws and leaves the pass running); a cancel of a legacy crash state is refused as terminal and the run's own pass finishes it, so a failed re-run is recorded as run.failed, never run.completed. Continuations are cancelled as core.system with the breaching principal named in the reason (in this runtime the continuation policy allows everything, so the reviewer's denied-breacher scenario cannot occur; the change is defensive). remoteOffers.take is fenced. A barrier test covers the approved second call's fence and goes red when it is removed. Earlier snapshot facts are carried forward.

## Verified

- bun test packages/runtime-bun as one command (336 tests, 25 files, 69 s): 319 pass, 0 fail; service-postgres alone 28/28; assignment-lifecycle 42/42 (5 failed against ee96962 sources, and the approved-call test is red with its fence removed); assignment 25/25, assignment-streaming 2/2, assignment-multiruntime-postgres 2/2; runtime-api assignment 74, protocol-connect assignment-wire 2, realitytrace interaction-event 14 and assignment-at17 4; typecheck clean; check 81/81
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
