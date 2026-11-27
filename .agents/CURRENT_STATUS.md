# Current status

**Status revision:** 89

**Stage:** PR #94: CodeRabbit review threads verified and fixed (ticket #113)

**Summary:** Merged origin/main (PR #93, 4d9b80c9) into the PR #94 branch. Both behaviours hold: #93's lifecycle stream, durable guard and guard-only fences, and #94's rlm dispatch intent with its recorded dispatch-result, view and outcome steps. Every rlm agent step runs through the executor's step, which takes the fence before its callback for an assignment-bound run (an rlm child started by rlm.invoke is not bound, so the fence is a no-op for it), so the dispatch step is fenced like any other. Status history: main's revisions 81 to 87 (PR #93) are kept as they are; this branch's own earlier revisions 81 to 85 were not carried into the file (they remain in the branch history, commits 0d0923b to 9b6f291), so revision 88 is the one snapshot that carries both. DEBT-034 (#93, resume re-runs the body) and DEBT-035 (#94, no parent-cancel cascade) are both kept. PR #94 content, carried forward: the agent.rlm child records an intent step and rlm.dispatch.intended before provider.invoke and calls it at most once per (invocationId, attempt); a re-entry with an intent and no recorded result inspects the original invocation (tied terminal view closes the run, anything else parks on the ambiguous-invocation wait, operator reconciliation is recorded reconciled and refused if it contradicts a fresh tied failure without override true); the parent binding is written pending-start before the child exists and updated merge-only by a guarded read-modify-write of one leaf; the outcome is a recorded step; a provider throws the branded RlmProviderRefusal with a bounded code to declare that nothing ran and any other throw is a lost response; cancellation is recorded first when there is no child, the child cancelled before the provider is asked, and a failed or unsettled provider cancel is retried; attempts are positive integers and a new invocationId for a task with an unresolved prior attempt is refused atomically. BREAKING: createRlmAgent requires getService, and an ordinary throw from invoke no longer fails the child. CodeRabbit threads (27 unresolved) were each verified against the code. Fixed red-first: a clean invoke return closes the child only on a terminal view accepted as this invocation's, and an unnamed view is accepted only in the execution that made the call; a foreign view is never written to the step history; a pre-change child (events beyond run.started, no intent) never invokes again; the revocation and recorded cancellation are read last before invoke; a pending child is found by correlation id only if it really is this invocation's agent.rlm child; the outcome is read only from the rlm.outcome step; the omitted attempt defaults to 1 before comparing and the guarded pending write checks the held attempt; the idempotency key of a guarded write carries the content hash; revokeRlmGrant with the reason keep writes (symbol sentinel); readGrantRevocation lets a wildcard through a null or false specific entry; the JSON patch writer stores a __proto__ leaf; a stale not-dispatched cancel record never replaces a dispatched one; a cancelled predecessor whose provider cancel has not settled blocks a new attempt; error classes and cancel errors are allowlisted classes; inspect resolves the child once. Documented: the inspect/cancel key is the child run id (ctx.runId). Debt: DEBT-036 (the intent event's identity is payload-only because RunContext.emit has no metadata channel).

## Verified

- Red at 1c73ef2 against a4b27c9: 16 of 76 rlm.test.ts tests and 2 runtime-api tests failed
- Green, each file alone, pg0 port 5439: runtime-bun rlm.test.ts 76 pass 0 fail; rlm-recovery.test.ts 8/8; runtime-api rlm.test.ts 18/18 and the whole runtime-api package 92/92; service.test.ts 53/53; shutdown-recovery.test.ts 2/2; run-ownership.test.ts 3/3; concurrency.test.ts 11/11; service-postgres.test.ts 28/28; assignment.test.ts 25/25; assignment-lifecycle.test.ts 48/48; assignment-multiruntime-postgres.test.ts 3/3; assignment-streaming.test.ts 2/2
- bun run typecheck clean; bun run check: substrate check passed, 81 requirements (81 implemented, 0 blocked, 0 candidate)

## Limits

- The observation ordering coordinate of a progress event reads the lifecycle length at its guard; a control committing between that read and the commit can tie with it (not decreasing across controls read consistently)
- Not run against Cognate Workbench's browser journey; the fix reaches it only after a release and dependency bump
- Full bun test packages/runtime-bun not run as one command; files were run individually
- DEBT-034: resume re-runs the agent body, so effects outside a completed step repeat (known gap, exact double-effect test)
- Mixed-version fleets are unsupported for assignment runs (drain, then upgrade); no version fence
- Parent cancellation does not cascade to dispatched rlm children (DEBT-035, known-failing test.failing)
- The window between the rlm child's final getRun and provider.invoke remains: providers must make cancel for a not-yet-started run sticky (EGM.md)
- A crash between the rlm intent and invoke parks the child ambiguous although nothing ran
- just verify does not run rlm.test.ts; rlm-recovery.test.ts is in the CI PostgreSQL step
- The PR #94 reviews were non-independent Sonnet sessions

## Next

Review and merge PR #94 after hosted CI, release Cognate (breaking), then the SEA-Forge half of ticket #113.

## Evidence

- packages/runtime-bun/src/assignment.ts (readLifecycle, foldAssignment, append, finalizeStoppedRun)
- packages/runtime-bun/src/executor.ts (durableGuard, terminal commit loop)
- packages/runtime-bun/src/service.ts (cancelRun)
- packages/runtime-bun/src/fold.ts (assignmentControlStream)
- packages/runtime-bun/test/assignment-lifecycle.test.ts
- packages/runtime-bun/test/assignment-multiruntime-postgres.test.ts
- .agents/DEBT.md DEBT-033, DEBT-034
- packages/runtime-bun/src/rlm.ts, packages/runtime-api/src/rlm.ts, packages/runtime-bun/test/rlm.test.ts, rlm-recovery.test.ts, fixtures/rlm-crash-runtime.ts
- .agents/DEBT.md DEBT-034 and DEBT-035
- packages/runtime-bun/src/EGM.md (both sets of bullets)

Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd`. Ledger: `requirements/ledger.yaml`.
