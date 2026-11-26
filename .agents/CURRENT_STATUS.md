# Current status

**Status revision:** 81

**Stage:** RLM child no longer re-invokes its provider after a resume or restart (SEA-Forge #113, Cognate half)

**Summary:** The agent.rlm child (packages/runtime-bun/src/rlm.ts createRlmAgent) re-ran its body after a resume and called provider.invoke a second time for the same invocation (2 invokes for 1 child run). It now records an rlm.dispatch.intended event and a replay-safe intent step (invocationId, providerId, attempt, parentRunId) before provider.invoke, and calls invoke at most once per (invocationId, attempt) inside a recorded result step; a throw after the provider may have acted is a lost response, not a failure. A re-entry that finds an intent and no recorded result (resume, restart, executor retry, lost response) never invokes: it inspects the original invocation (recorded as a step so replay does not re-ask) and closes completed or failed only when the view carries the original invocationId (new additive InvocationView.invocationId); a view that is unknown, untied or missing parks on the existing ambiguous-invocation wait, and an operator resolution is recorded as rlm.outcome reconciled:true (now surfaced as RlmInspectOutput.reconciled). A cancelled child or a withdrawn parent grant (parent cancelled, or rlm.revoked.<invocationId> or rlm.revoked.* in parent state) prevents dispatch; rlm.cancel asks the provider to cancel only when an intent exists and records dispatched and providerCancel on the binding (and in its result). The same invocationId with a different attempt is refused rlm-invocation-ambiguous; a retry needs a new invocationId (attempt recorded on the binding). All contract changes are additive (RlmInvokeInput.attempt, RlmInvokeRequest.attempt, InvocationView.invocationId, RlmInvocationBinding.attempt and cancellation, RlmInspectOutput.reconciled, RlmCancelOutput detail, readGrantRevocation). createRlmAgent takes an optional getService so the child can observe the parent. A provider whose inspect does not name the invocation is never trusted after an interruption: it parks ambiguous. Earlier facts are carried forward in verified and limits.

## Verified

- Red: the new regression (resuming a reconciled ambiguous invocation never invokes the provider a second time) failed with spawns 2 against origin/main; against the old agent the 10 new rlm.test.ts tests failed (16 pass, 10 fail) and the 4 new PostgreSQL restart tests failed (0 pass, 4 fail)
- Green: packages/runtime-bun/test/rlm.test.ts 26 pass 0 fail; rlm-recovery.test.ts (PostgreSQL via pg0, 4 restart scenarios, exactly one invoke in total each) 4 pass 0 fail; packages/runtime-api/test/rlm.test.ts 8 pass 0 fail
- service.test.ts 53/53, shutdown-recovery.test.ts 2/2, run-ownership.test.ts 3/3, service-postgres.test.ts 28/28, concurrency.test.ts 11/11 when run alone (one PostgreSQL overlap case timed out once under host load and passed twice alone and on main), each file run individually
- bun run typecheck clean; bun run check: substrate check passed, 81 requirements (81 implemented, 0 blocked, 0 candidate)

## Limits

- An rlm.cancel result and the binding cancellation record: the binding write is on the parent run state and is skipped when the parent is already terminal (state writes to a terminal run are refused), so then the outcome is in the cancel result and the child's run.cancelled event only
- Revocation is a state convention (rlm.revoked.<invocationId> or rlm.revoked.*, or a cancelled parent) the owner of the parent run writes; no capability or event writes it yet, and a standalone agent without getService only checks its own cancellation
- No automatic retry is implemented; a retry is an explicit rlm.invoke with a new invocationId, and nothing yet enforces a new grant or reservationRef beyond the existing budget rule
- Provider inspect must name the invocation (InvocationView.invocationId) for a recovery to complete or fail the run; existing providers that do not will park ambiguous after an interruption until updated
- The assignment-controls branch (PR #93) was not rebased onto; assignment.ts and fold.ts are untouched here

## Next

Review and merge this PR, release Cognate, then have the SEA-Forge half of ticket #113 (provider inspect naming the invocation, revocation writer, parent-side reconciliation) consume the additive fields.

## Evidence

- packages/runtime-bun/src/rlm.ts (createRlmAgent, createRlmComponent cancel and invoke)
- packages/runtime-api/src/rlm.ts (additive attempt, invocationId, cancellation, reconciled, readGrantRevocation)
- packages/runtime-bun/test/rlm.test.ts (dispatch intent, lost response, cancellation, revocation, attempt tests)
- packages/runtime-bun/test/rlm-recovery.test.ts (PostgreSQL restart between intent and result)
- packages/runtime-bun/src/EGM.md (new invariants)

Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd`. Ledger: `requirements/ledger.yaml`.
