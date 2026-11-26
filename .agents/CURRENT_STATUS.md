# Current status

**Status revision:** 79

**Stage:** DEBT-033 resolved in source: assignment control append backs off under stream contention

**Summary:** AssignmentService.append (packages/runtime-bun/src/assignment.ts) retried a lost stream-version race exactly five times with no pause and then refused with unavailable, so an operator interrupt, resume or spend landing while the bound run streamed events could be refused. It now makes up to eight attempts with a jittered exponential pause (5 ms doubling to a 40 ms cap, worst case about 195 ms in all) and keeps the same refusal (code unavailable, message 'too much contention on run <id>') when the bound is exhausted. Non-ConcurrencyError errors still propagate immediately and IdempotencyMismatchError and replayed-token behavior are unchanged. A deterministic regression suite wraps the store so the first N commits raise ConcurrencyError: fewer than the bound succeeds with exactly one assignment.interrupted event, at or over the bound is refused with no event recorded, and a non-race error fails after one attempt. The success case was observed failing against the old five-attempt loop before passing. Workbench benefits only after a Cognate release and a dependency bump. Earlier snapshot facts are carried forward in verified and limits.

## Verified

- bun test packages/runtime-bun/test/assignment.test.ts: 25 pass, 0 fail (4 new DEBT-033 tests); against the old five-attempt loop the DEBT-033 tests gave 2 pass, 2 fail (success case and attempt-count case)
- bun run typecheck: clean (tsc -p tsconfig.json, no errors)
- bun test of packages/runtime-bun/test/rlm.test.ts 15/15, service.test.ts 53/53, packages/protocol-connect assignment-wire 2/2, packages/runtime-api assignment 74/74, packages/realitytrace assignment-at17 4/4 and interaction-event 14/14, each run alone
- Pre-push: PR branch tree byte-identical across the rewrite; 0 residual path/username commits across all refs in the apply clone; main subject diff exactly the one became-empty commit
- Post-push fresh clone: 0 residual /home/<user>/ and 0 residual username across all reachable history; heads=5 and tags=1189 matching pre-rewrite; Gitleaks 12 findings all the known synthetic fixture files

## Limits

- Full `bun test packages/runtime-bun` was started and hung without output, so it was killed; only the files named in verified were run (the hang was not investigated and is not shown to predate this change)
- The fix reaches Workbench only after a Cognate release and a dependency bump; its two handoff tests still retry this refusal until then
- Downstream clones and the second local worktree still hold pre-rewrite history and must re-clone or fetch+reset
- GitHub's cached PR refs and any forks retain pre-rewrite objects outside this repository's control
- The pre-rewrite objects remain recoverable locally (original store un-gc'd; audit workspace clones); purging them is an operator decision
- The Protect Main bypass window existed for under a minute and the restore was diff-verified, but the window itself is recorded here rather than hidden

## Next

Review and merge the fix/assignment-append-backoff branch, release Cognate, bump the dependency in Workbench and drop the refusal retry in its J-CASE-ASSIGNMENT and E2E case-assignment handoff tests; then the operator items carried from revision 78 (PR #74, re-clone downstream).

## Evidence

- packages/runtime-bun/src/assignment.ts (APPEND_MAX_ATTEMPTS, appendBackoffMs, append loop)
- packages/runtime-bun/test/assignment.test.ts (control append under stream contention (DEBT-033))
- .agents/DEBT.md DEBT-033
- docs/security/repository-hygiene.md (history status section updated to applied)
- audit workspace /tmp/cognate-secaudit: APPLY-HISTORY-REWRITE.md (marked applied), ruleset-original.json, rewrite-apply clone, postverify clone scan outputs
- force-push transcript: main 6635684->d6e669f, branch 0a885c4->1b50702, 696 tags rewritten

Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd`. Ledger: `requirements/ledger.yaml`.
