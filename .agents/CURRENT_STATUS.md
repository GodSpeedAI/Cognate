# Current status

**Status revision:** 83

**Stage:** PR 93 pass-2 review addressed: cancel guarded, progress fenced, reads never torn, finalizer throws

**Summary:** Pass 2 (a Sonnet reviewer, not independent) found 1 high, 5 medium, 5 low. cancelRun now retries with the DEBT-033 jittered backoff and throws unavailable on exhaustion, aborting the local pass only after the cancel commits or the run is seen terminal. readLifecycle re-reads only when the two streams' terminal states disagree and throws instead of returning a torn pair. Executor progress commits carry a guard-only append on the lifecycle stream at the version the durable guard read (re-guard on conflict), and step callbacks and invoke dispatch are preceded by the same guard-only commit; the already-started external call stays unfenceable (EGM.md). finalizeStoppedRun throws on exhaustion and the executor finalizes when its guard sees a budget stop. The post-commit check matches the committed event id (spend included). Runtime principal comes from Core.system. Orderings now covered with barriers: cancel against interrupt, spend and terminal, resume against cancel, breach against terminal, crash between assignment.failed and run.failed (next pass and restart), a legacy run through the terminal commit, a PostgreSQL interrupt-then-cancel ordering; sleep holds replaced by barriers. DEBT-034 scope corrected. Mixed-version fleets documented as unsupported. Earlier snapshot facts are carried forward.

## Verified

- bun test packages/runtime-bun as one command: 303 pass, 1 fail (sea-forge-authority LIST_RESPONSE_LIMIT, a 5 s timeout under load; the file alone is 56/56); assignment-lifecycle 27/27 (4 failed against dc51e2b sources), assignment 25/25, assignment-streaming 2/2, assignment-multiruntime-postgres 2/2 (isolated PostgreSQL); typecheck clean; check 81/81; runtime-api assignment 74, protocol-connect assignment-wire 2, realitytrace interaction-event 14 and assignment-at17 4
- New packages/runtime-bun/test/assignment-lifecycle.test.ts (14 tests, 1 test.failing known gap) and assignment-multiruntime-postgres.test.ts: against b4f2195 sources 8 of 12 lifecycle tests and the multi-runtime test failed; after the change all pass
- bun run typecheck clean; bun run check substrate 81/81
- Each run alone: runtime-bun assignment 25, assignment-streaming 2, assignment-lifecycle 14, service 53, rlm 15, observation 11, cognition 2; with isolated PostgreSQL (pg0 port 5438): shutdown-recovery 2, run-ownership 3, concurrency 11, service-postgres 28, assignment-multiruntime-postgres 1; runtime-api assignment 74; protocol-connect assignment-wire 2; realitytrace interaction-event 14, assignment-at17 4
- bun test of packages/runtime-bun/test/rlm.test.ts 15/15, service.test.ts 53/53, packages/protocol-connect assignment-wire 2/2, packages/runtime-api assignment 74/74, packages/realitytrace assignment-at17 4/4 and interaction-event 14/14, each run alone

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
