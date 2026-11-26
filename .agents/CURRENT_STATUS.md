# Current status

**Status revision:** 82

**Stage:** PR 93 review addressed: assignment lifecycle stream version is the lifecycle revision

**Summary:** Independent review of PR 93 (b4f2195) found 5 high, 7 medium and 1 low findings in the control-stream design. Resolved: the lifecycle stream run-assignment-<runId> now guards every lifecycle write by its version. Interrupt, resume, spend, a budget breach with its durable stop (assignment.spend + assignment.failed, committed together, with a run.execute intent), the executor's terminal decision (assignment terminal event and run terminal event in one commit, re-decided on conflict so a late interrupt wins and the terminal carries the final spend) and cancelRun (assignment.cancelled with run.cancelled) all use expectedVersion on it; executor progress never does. A control is returned only if its event is in the folded view; the terminal-wins discard is gone. The two streams are read as a consistent pair. The owning worker checks the durable lifecycle at execution boundaries (before each step callback and invocation dispatch, and before each append), so an interrupt committed in another process stops it (PostgreSQL two-runtime test). finalizeStoppedRun writes run.failed and cancels continuations after a breach, from the call, the next executor pass or a restart. Replay shortcut checks both streams; ctx.emit reserves assignment.* and the fold ignores emitted assignment events; failure causation chains to the run-stream tail with breachEventId in metadata; observation streamSequence is a run-wide coordinate. DEBT-034 (an interrupted step's effect runs again on resume) is recorded as a known gap with a test.failing test. No Workbench-visible event type or payload shape changed; assignment.completed, assignment.failed and assignment.cancelled now have streamId run-assignment-<runId> rather than run-<runId> (the run-scoped events API is unchanged), and streamSequence for assignment-run observations is run-wide. Earlier snapshot facts are carried forward.

## Verified

- New packages/runtime-bun/test/assignment-lifecycle.test.ts (14 tests, 1 test.failing known gap) and assignment-multiruntime-postgres.test.ts: against b4f2195 sources 8 of 12 lifecycle tests and the multi-runtime test failed; after the change all pass
- bun run typecheck clean; bun run check substrate 81/81
- Each run alone: runtime-bun assignment 25, assignment-streaming 2, assignment-lifecycle 14, service 53, rlm 15, observation 11, cognition 2; with isolated PostgreSQL (pg0 port 5438): shutdown-recovery 2, run-ownership 3, concurrency 11, service-postgres 28, assignment-multiruntime-postgres 1; runtime-api assignment 74; protocol-connect assignment-wire 2; realitytrace interaction-event 14, assignment-at17 4
- bun test of packages/runtime-bun/test/rlm.test.ts 15/15, service.test.ts 53/53, packages/protocol-connect assignment-wire 2/2, packages/runtime-api assignment 74/74, packages/realitytrace assignment-at17 4/4 and interaction-event 14/14, each run alone
- Pre-push: PR branch tree byte-identical across the rewrite; 0 residual path/username commits across all refs in the apply clone; main subject diff exactly the one became-empty commit
- Post-push fresh clone: 0 residual /home/<user>/ and 0 residual username across all reachable history; heads=5 and tags=1189 matching pre-rewrite; Gitleaks 12 findings all the known synthetic fixture files

## Limits

- DEBT-034: interrupting while a step callback runs can run its effect twice on resume (known gap, test.failing)
- The observation ordering coordinate of a progress event reads the lifecycle length at its guard; a control committing between that read and the commit can tie with it (not decreasing across controls read consistently)
- Not run against Cognate Workbench's browser journey; the fix reaches it only after a release and dependency bump
- Full bun test packages/runtime-bun not run as one command; files were run individually

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
