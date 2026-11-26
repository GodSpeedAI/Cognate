# Current status

**Status revision:** 82

**Stage:** PR #94 review fixes: durable pending binding, cancel-first, typed provider refusal, leaf patches, fail-closed (ticket #113)

**Summary:** Review of PR #94 found four high, five medium and three low issues; each was verified against the code and fixed. H1: rlm.invoke writes the parent binding as pending-start BEFORE startRun and completes it after; inspect and cancel resolve a pending child by its correlation id (rlm:<parent>:<invocation>); a cancelled pending binding refuses the start. H2: rlm.cancel cancels the child first and only then reads whether it was dispatched; a failed or unrecorded provider cancel is retried by a second rlm.cancel even when the child is already terminal. H3: a provider throws RlmProviderRefusal (or an error with definite true) to say it did nothing, which fails the child with the reason as before; any other throw from invoke is a lost response that is inspected or parked, and only its error class reaches the outcome evidence; the fixture for the definite-failure case is restored. H4: the parent's /rlm state is patched at its own leaf (invocations/<id>, revoked/<id>) with an expectedVersion precondition and retry; revokeRlmGrant is the revocation writer; only a terminal parent's refusal is swallowed. M1: an agent without getService fails closed, and the parent check is repeated inside the dispatch step immediately before invoke. M2: reconciled true is in the child's output and terminal payload, an untied view's payment and evidence are dropped (foreign view ignored), and a resume without a result or failure is refused. M3: attempt must be a positive integer, and a new invocationId for the same parent and task digest is refused with the new code rlm-attempt-refused while a prior attempt is unresolved; the in-agent identity check that could never fire was removed. M4: Object.hasOwn in readInvocationBinding and readGrantRevocation. M5: real-crash tests (SIGKILLed process, PostgreSQL), a forced ConcurrencyError on the result-step append, the cancel race window with barriers, wildcard revocation, the no-getService refusal. L1: the intent event is emitted only after the dispatchable check. L2 documented: a crash between intent and invoke parks ambiguous. L3: reconciliation re-inspects the provider and records the fresh view. Parent-cancel cascade to provider.cancel is not implemented: DEBT-034 with a known-failing test.failing. Earlier facts carried forward.

## Verified

- Red: against the previous agent (6af8edb, with revokeRlmGrant stubbed) 17 of 45 rlm.test.ts tests failed (28 passed); removing Object.hasOwn from the readers fails 6 of 16 runtime-api rlm tests
- Green, each file run alone with pg0 on port 5439: runtime-bun rlm.test.ts 46 pass 0 fail; rlm-recovery.test.ts 7 pass 0 fail (4 graceful restart, 3 SIGKILL crash scenarios); runtime-api rlm.test.ts 16 pass 0 fail; service.test.ts 53/53; shutdown-recovery.test.ts 2/2; run-ownership.test.ts 3/3; assignment.test.ts 25/25; service-postgres.test.ts 28/28 and concurrency.test.ts 11/11 when run alone
- In the first sequential gate run, concurrency.test.ts (1 timeout) and service-postgres.test.ts (5 timeouts of 5 s or more) failed while other sessions' bun test processes loaded the host; both passed in full when rerun alone, and concurrency passed on main earlier
- bun run typecheck clean; bun run check: substrate check passed, 81 requirements (81 implemented, 0 blocked, 0 candidate)

## Limits

- Parent cancellation does not cascade to dispatched children (DEBT-034, known-failing test)
- A cancellation record on the binding is skipped when the parent is already terminal (the only swallowed failure); a retried rlm.cancel then asks the provider again
- A crash between the intent and invoke parks the child ambiguous although nothing ran (safe, needs an operator)
- Providers whose inspect does not name the invocation are never trusted after an interruption; providers should throw RlmProviderRefusal for a refusal that definitely did nothing
- A new invocationId for the same parent and task digest is refused while a prior attempt is unresolved, which also serializes deliberate parallel fan-out over one digest
- The review was by a non-independent Sonnet session; a stronger independent review has not been done

## Next

Review and merge PR #94 after hosted CI, release Cognate, then the SEA-Forge half of ticket #113 (inspect naming the invocation, RlmProviderRefusal, revokeRlmGrant).

## Evidence

- packages/runtime-bun/src/rlm.ts (patchRlmLeaf, revokeRlmGrant, pending-start binding, cancel, createRlmAgent)
- packages/runtime-api/src/rlm.ts (RlmProviderRefusal, rlm-attempt-refused, binding state, hasOwn readers)
- packages/runtime-bun/test/rlm.test.ts and packages/runtime-api/test/rlm.test.ts
- packages/runtime-bun/test/rlm-recovery.test.ts and fixtures/rlm-crash-runtime.ts (SIGKILL on PostgreSQL)
- .agents/DEBT.md DEBT-034
- packages/runtime-bun/src/EGM.md

Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd`. Ledger: `requirements/ledger.yaml`.
