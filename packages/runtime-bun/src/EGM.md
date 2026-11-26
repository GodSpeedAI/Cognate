# runtime-bun source — Bun reference runtime

## Overview
The Bun reference runtime composes kernel, durable store, runs, continuations, commitments, artifacts, and cognition behind `RuntimeService` (package description; [package.json:description]). `runtime.ts` is the composition root that opens the store, builds the Cordis kernel, the `Governor`, the `Invoker`, the continuation and artifact services, the projection runners, and the background loop [src/runtime.ts:startRuntime]. Run state is never a stored copy: it is a fold over the run stream, so payload erasure removes content from every derived view [src/fold.ts:foldRun].

## Interface
- `createRuntime(options)` — opens a `Runtime` from `RuntimeOptions` [src/index.ts:createRuntime]
- `Runtime` — `service`, `kernel`, `store`, `inspect(correlationId)`, `rebuildCognition()`, `erase(...)`, `pollApprovals()`, `idle(timeoutMs)`, `close()` [src/index.ts:Runtime]
- `RuntimeOptions` / `RuntimeStoreConfig` — store as SQLite path, injected store, `sqlite`, `postgres`, or `postgresPg0`; plus `policy`, `actions`, `agents`, `projections`, `execution`, `cognition` [src/index.ts:RuntimeOptions]
- `ActionPolicy` action names, `CognitionOptions`, `CausalChain`, `PendingEvent`, `OBSERVATION_OUTBOX_TOPIC` [src/index.ts:ActionPolicy, src/index.ts:OBSERVATION_OUTBOX_TOPIC]
- `Governor`, `validateGovernance`, `assertAuthorityClaims`, `isWorldRef`, `isSystemRead`, `parseTimeoutSeconds`, `timeoutSecsEnforcer`, `MAX_AUTHORITY_CLAIMS`, `MAX_AUTHORITY_CLAIM_LENGTH` [src/governed-operation.ts:Governor]
- `GovernanceOptions`, `GovernanceAuthority`, `GovernanceDecision`, `GovernanceConstraint`, `CapabilityHooks`, `Disposition`, `GovernedResult`, `ApprovalState` [src/governed-operation.ts:GovernanceOptions]
- `SeaForgeAuthority`, `buildAuthorityRequest`, `buildTransitionRequest`, `interpretDecision`, `interpretSettlement` and their receipt types [src/sea-forge-authority.ts:SeaForgeAuthority]
- `ENV_MODE`, `ENV_SOCKET`, `ENV_WORLD`, `ENV_ACTOR`, `governanceFromEnv(env)` [src/governance-env.ts:governanceFromEnv]
- Not exported: `Core`, `executeOnce`, `Invoker`, `ExecutionSlots`, `RemoteOfferRegistry`, `createService`, `inspectCorrelation` [src/core.ts:Core, src/executor.ts:executeOnce]

## Invariants
- Nothing outside `governed-operation.ts` may call `ActionPolicy.authorize` or the kernel `Policy`; only an `allow` disposition proceeds [src/governed-operation.ts:Governor]
- `sea-forge` mode without an authority and a valid `worldRef` fails at construction, and an unreachable authority yields `unknown`, never allow [src/governed-operation.ts:validateGovernance, src/governed-operation.ts:govern]
- A capability revalidation and its recorded decision belong to the owning call; nested calls never inherit approval or claims [src/invoker.ts:Invoker]
- Execution is deterministic replay: every `RunContext` call with a recorded result is answered from the stream [src/executor.ts:executeOnce]
- Run appends are serialized against one `expectedVersion`; `ConcurrencyError` retries the pass, `StaleRunOwnerError` never does [src/executor.ts:append]
- `execution.maxConcurrentRuns` must be 1–64 and capacity above one requires `resourceKeys` plus complete fenced outbox lease support [src/runtime.ts:startRuntime]
- Caller state writes land on `run-state-<id>`, never the run stream [src/fold.ts:runStateStream]
- Observations are keyed by tenant, world, and resource so equal resource strings in different worlds are distinct streams [src/fold.ts:observationStream]
- The runtime closes only a store it opened itself; an injected store belongs to its creator [src/runtime.ts:startRuntime]
- A run opened from an assignment records `assignment.issued` and `assignment.started` with `run.started`; interrupt, resume, spend and the terminal event are further events on the run stream, never a stored copy `[assignment.ts:foldAssignment]` `[service.ts:startRun]`
- An assignment id is issued to one run; a resume uses `resumeAssignment` on that run and is refused after the delegation link expired `[assignment.ts:createAssignmentService]`
- A spend above a numeric limit records the overrun, then fails the run with `ASSIGNMENT_BUDGET_EXCEEDED` `[assignment.ts:createAssignmentService]`
- `agent.rlm` records an intent step then `rlm.dispatch.intended` before `provider.invoke`, and calls it at most once per (invocationId, attempt), inside a recorded result step that is fenced by a parent-authority check immediately before the call; a re-entry with an intent and no recorded result (resume, restart, conflict retry, lost response) inspects the original invocation instead: a terminal view tied to the original `invocationId` closes the run, anything else parks on the `ambiguous-invocation` wait; a crash between intent and invoke parks it too (nothing ran, but only an operator can say so) `[rlm.ts:createRlmAgent]`
- A provider throws `RlmProviderRefusal` (or an error with `definite: true`) to say it did nothing: the child fails with its reason as before. Any other throw from `invoke` is a lost response; only its error class reaches the outcome evidence `[rlm.ts:createRlmAgent]`
- Operator reconciliation must state a `result` or `failure`; the provider is asked again at that moment and the fresh view recorded; a view that does not name the invocation is foreign and none of its spend or evidence is recorded; the outcome and the child's output carry `reconciled: true` `[rlm.ts:createRlmAgent]`
- The parent-to-child binding is written `pending-start` before the child run exists and completed after; inspect and cancel find a pending child by its correlation id. Parent `/rlm` state is only ever patched at its own leaf with a version precondition (never rewritten whole), so a revocation (`rlm.revoked.<invocationId>` or `*`, written by `revokeRlmGrant`) cannot be erased by a binding write `[rlm.ts:patchRlmLeaf]`
- A cancelled child, a cancelled parent or a withdrawn grant prevents a new dispatch, and an agent built without `getService` fails closed. `rlm.cancel` cancels the child first, then asks the provider only if an intent exists; a failed or unrecorded provider cancel is retried by a second `rlm.cancel` even on a terminal child; only a terminal parent's refusal to record is swallowed `[rlm.ts:createRlmComponent]`
- `attempt` is a positive integer; the same `invocationId` under another attempt is refused, and a new `invocationId` for the same parent and task digest is refused (`rlm-attempt-refused`) while a prior attempt of that task is unresolved. Known debt DEBT-034: cancelling a parent does not cascade to its dispatched children `[rlm.ts:createRlmComponent]`

## Side Effects
- Opens a SQLite file or a PostgreSQL connection, or starts a pg0-managed instance, depending on `RuntimeStoreConfig` [src/runtime.ts:startRuntime]
- Background timers: safety-net tick (default 250 ms), retry wake, and approval polling when `approvalPollMs > 0` [src/runtime.ts:startRuntime]
- Unix-socket NDJSON exchange with SEA-Forge for every governed decision in `sea-forge` mode [src/sea-forge-authority.ts:exchange]
- `erase` propagates erasure into continuations and the cognitive index [src/runtime.ts:startRuntime]

## Verification
- Run: `cd packages/runtime-bun && bun test`
