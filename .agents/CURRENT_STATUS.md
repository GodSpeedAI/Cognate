# Current status

**Status revision:** 84

**Stage:** PR #94 delta check of 822e4e4: pre-start cancel, record upgrade, reserved steps, bounded refusal code (ticket #113)

**Summary:** Pass 2 of the review of PR #94 found two high, five medium and three low issues; all were verified and fixed, red tests committed first (d99ac31). H1: bindings are merge-only through a guarded read-modify-write of one leaf (committed with the state version it decided against): cancellation is set once and never dropped, runId and state never regress; rlm.cancel records a cancellation first when there is no child yet; the start refuses and the child refuses to dispatch when a cancellation is recorded; a cancel record that lands after the child exists cancels it. H2: the agent records rlm.outcome as a named step, never an emit, so a provider's own emits cannot shift its id, and the provider's ctx refuses the reserved rlm.outcome and rlm.dispatch.* events. M1 (BREAKING, documented): createRlmAgent needs getService, an ordinary throw is a lost response; the agent cannot obtain the service from the runtime it is mounted in, so it stays fail-closed. M2: immediately before invoke the agent re-reads its own run status and signal. M3: the pending binding write is conditional on the state version the unresolved-attempt scan ran against. M4: an operator result that contradicts a fresh tied failed, timedOut or cancelled view is refused (closed failed, disagreement recorded) unless the resolution sets override true. M5: rlm-recovery.test.ts is in the PostgreSQL CI step and fails within 5 s with a clear message when no PostgreSQL is reachable. L1: Halt is exported and checked with instanceof. L2: only a branded RlmProviderRefusal counts as definite, and only its bounded code is recorded. L3: once the intent is durable the invocation reads running, not admitted. DEBT-034 renumbered DEBT-035 (PR #93 owns 034). Earlier facts carried forward. Delta check of 822e4e4 (N1-N5): a binding cancelled before any child existed counts as cancelled in the attempt scan, so it no longer blocks a new attempt of the task (N1); a held not-dispatched cancellation is upgraded when the child turns up, keeping the first requestedAt, so a failed provider cancel is retried (N2); the provider ctx refuses rlm.* step ids as well as reserved emits (N3); a refusal code must match [a-z0-9._-]{1,48} at record time, otherwise the throw is a lost response, and the contradiction message says override belongs in the original resolution (N5); the sticky-cancel provider obligation for the window before invoke is documented in EGM.md (N4).

## Verified

- Red at f87ae94 against 822e4e4: 5 of 58 rlm.test.ts tests and 1 runtime-api test failed (the N2 test failed on the held record, the N1 test on 'unresolved (admitted)')
- Green, each file alone, pg0 port 5439: runtime-bun rlm.test.ts 58 pass 0 fail; rlm-recovery.test.ts 8/8; runtime-api rlm.test.ts 16/16; service.test.ts 53/53; shutdown-recovery.test.ts 2/2; run-ownership.test.ts 3/3; concurrency.test.ts 11/11; service-postgres.test.ts 28/28; assignment.test.ts 25/25
- bun run typecheck clean; bun run check: substrate check passed, 81 requirements (81 implemented, 0 blocked, 0 candidate)
- run-ownership (1 timeout) and service-postgres (1 to 3 timeouts) failed in sequential runs while the host load average was 35 (other sessions); both passed alone once load fell (load 2.6 and 11.7 at the passing runs)

## Limits

- Parent cancellation does not cascade to dispatched children (DEBT-035, known-failing test.failing)
- A cancel from a second runtime is exercised only through a fake service (the last look re-reads run status) and an injected cancel at the last look, not through two real runtimes
- just verify does not run rlm.test.ts or rlm-recovery.test.ts; rlm-recovery is in the CI PostgreSQL step, rlm.test.ts runs only with a full bun test
- A cancellation record on the binding is skipped when the parent is already terminal; a retried rlm.cancel then asks the provider again
- A crash between the intent and invoke parks the child ambiguous although nothing ran (safe, needs an operator)
- A new invocationId for the same parent and task digest is refused while a prior attempt is unresolved, which also serializes deliberate parallel invocations over one digest
- The reviews were non-independent Sonnet sessions; no independent review of these fixes has been done
- Window between the child's final getRun and provider.invoke remains: providers must make cancel for a not-yet-started run sticky (documented in EGM.md)

## Next

Review and merge PR #94 after hosted CI (including the PostgreSQL step running rlm-recovery), release Cognate as a breaking change, then the SEA-Forge half of ticket #113.

## Evidence

- packages/runtime-bun/src/rlm.ts (commitRlmLeaf, mergeBinding, updateBinding, cancel, createRlmAgent)
- packages/runtime-api/src/rlm.ts (branded RlmProviderRefusal with code)
- packages/runtime-bun/src/executor.ts (Halt exported)
- packages/runtime-bun/test/rlm.test.ts, rlm-recovery.test.ts, fixtures/rlm-crash-runtime.ts, packages/runtime-api/test/rlm.test.ts
- .github/workflows/verify.yml (rlm-recovery in the PostgreSQL step)
- .agents/DEBT.md DEBT-035
- packages/runtime-bun/src/EGM.md

Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd`. Ledger: `requirements/ledger.yaml`.
