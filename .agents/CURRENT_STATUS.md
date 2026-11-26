# Current status

**Status revision:** 81

**Stage:** DEBT-033 fixed structurally: assignment controls moved off the run stream onto a control stream

**Summary:** Root cause of DEBT-033: AssignmentService.append committed operator controls (interrupt, resume, spend) as foreign appends to the run stream with expectedVersion = its length, racing the executor's own serialized appends. Losing repeatedly refused the control (unavailable, too much contention); winning made the executor's next append raise ConcurrencyError, halt(true) and re-run the pass (churn). This broke the rule fold.ts documents for runStateStream (spec 29.1). Fix (design a): interrupt, resume and in-budget spend are now events on a dedicated stream run-assignment-<runId> (fold.ts assignmentControlStream); foldAssignment folds the run stream plus the control stream merged by store position (terminal lifecycle wins over a control event recorded after it); executor start, executor close and cancelRun read the merged view (readAssignment). Interrupt still reaches the executor through core.controllers abort. A budget overrun ends the run, so its assignment.failed and run.failed stay on the run stream (as cancelRun's do) in one commit with the spend event on the control stream, guarded by both stream versions. Event types, payload shapes, ids (asg_<base>_<i> replay rule, checked on the control stream), authorization, the state machine, outbox and the run-scoped events API are unchanged. The DEBT-033 backoff is kept for the residual control-versus-control and overrun-versus-executor races. Earlier snapshot facts are carried forward.

## Verified

- New regression packages/runtime-bun/test/assignment-streaming.test.ts (streaming agent plus a store that holds control commits 8 ms): red on main (2 fail, both 'too much contention'), green after the fix (2 pass)
- bun run typecheck clean; bun run check substrate 81/81
- Each run alone: runtime-bun assignment 25/25, assignment-streaming 2/2, service 53/53, rlm 15/15, observation 11/11, cognition 2/2; with isolated PostgreSQL (pg0 port 5438, COGNATE_TEST_POSTGRES_URL) shutdown-recovery 2/2, run-ownership 3/3, concurrency 11/11, service-postgres 28/28; runtime-api assignment 74/74, protocol-connect assignment-wire 2/2, realitytrace interaction-event 14/14 and assignment-at17 4/4
- bun run typecheck clean; runtime-bun service.test.ts 53/53 and rlm.test.ts 15/15; bun run check substrate 81/81
- bun run typecheck: clean (tsc -p tsconfig.json, no errors)
- bun test of packages/runtime-bun/test/rlm.test.ts 15/15, service.test.ts 53/53, packages/protocol-connect assignment-wire 2/2, packages/runtime-api assignment 74/74, packages/realitytrace assignment-at17 4/4 and interaction-event 14/14, each run alone
- Pre-push: PR branch tree byte-identical across the rewrite; 0 residual path/username commits across all refs in the apply clone; main subject diff exactly the one became-empty commit
- Post-push fresh clone: 0 residual /home/<user>/ and 0 residual username across all reachable history; heads=5 and tags=1189 matching pre-rewrite; Gitleaks 12 findings all the known synthetic fixture files

## Limits

- A control that lands between the executor's final assignment read and its terminal append can precede assignment.completed in position order; the fold shows the terminal state (an interrupt after completion is ignored) but an interrupt immediately before is possible and not guarded cross-stream
- Not run against Cognate Workbench's browser journey; the fix reaches it only after a release and dependency bump
- Full bun test packages/runtime-bun not run as one command; files were run individually
- Downstream clones and the second local worktree still hold pre-rewrite history and must re-clone or fetch+reset
- GitHub's cached PR refs and any forks retain pre-rewrite objects outside this repository's control
- The pre-rewrite objects remain recoverable locally (original store un-gc'd; audit workspace clones); purging them is an operator decision
- The Protect Main bypass window existed for under a minute and the restore was diff-verified, but the window itself is recorded here rather than hidden

## Next

Review and merge the fix/assignment-controls-off-run-stream PR, release Cognate, bump the dependency in Workbench and drop the refusal retry in its J-CASE-ASSIGNMENT and E2E case-assignment handoff tests; then the operator items carried from revision 78.

## Evidence

- packages/runtime-bun/src/assignment.ts (foldAssignment control merge, readAssignment, append to control stream)
- packages/runtime-bun/src/fold.ts (assignmentControlStream)
- packages/runtime-bun/src/executor.ts and service.ts (merged reads)
- packages/runtime-bun/test/assignment-streaming.test.ts
- packages/runtime-bun/src/EGM.md
- .agents/DEBT.md DEBT-033
- docs/security/repository-hygiene.md (history status section updated to applied)
- audit workspace /tmp/cognate-secaudit: APPLY-HISTORY-REWRITE.md (marked applied), ruleset-original.json, rewrite-apply clone, postverify clone scan outputs
- force-push transcript: main 6635684->d6e669f, branch 0a885c4->1b50702, 696 tags rewritten
