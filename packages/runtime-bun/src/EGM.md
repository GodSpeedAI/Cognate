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
- `agent.rlm` records an intent step then `rlm.dispatch.intended` before `provider.invoke` and calls it at most once per (invocationId, attempt), inside a recorded result step. Immediately before the call it re-checks the parent (cancelled, revoked), the binding's recorded cancellation, its own run status and its signal; a re-entry with an intent and no recorded result (resume, restart, conflict retry, lost response) inspects the original invocation instead: a terminal view tied to the original `invocationId` closes the run, anything else parks on the `ambiguous-invocation` wait; a crash between intent and invoke parks it too (nothing ran, but only an operator can say so). Once the intent is durable the invocation reads `running`, not `admitted` `[rlm.ts:createRlmAgent]`
- **BREAKING (#113):** `createRlmAgent` needs `getService` (the same late-bound `() => runtime.service` that `createRlmComponent` takes); without it a dispatch fails closed with `rlm-authority-exceeds-parent`. An ordinary throw from `invoke` no longer fails the child: it is a lost response, inspected or parked. A provider throws `RlmProviderRefusal` (only that branded class, with a bounded `code`) to say it did nothing, which fails the child recording just the code `[rlm.ts:createRlmAgent]`
- The agent records its outcome as a named step (`rlm.outcome`), never an `emit`, so a provider's own emits cannot shift its id; the provider's ctx refuses the reserved `rlm.outcome` and `rlm.dispatch.*` events `[rlm.ts:createRlmAgent]`
- Operator reconciliation must state a `result` or `failure`; the provider is asked again at that moment and the fresh view recorded; a view that does not name the invocation is foreign and none of its spend or evidence is recorded; an operator `result` that contradicts a fresh tied `failed`, `timedOut` or `cancelled` view is refused (the invocation closes failed with the disagreement as evidence) unless the resolution carries `override: true`; the outcome and the child's output carry `reconciled: true` `[rlm.ts:createRlmAgent]`
- The parent-to-child binding is written `pending-start` before the child run exists and completed after; inspect and cancel find a pending child by its correlation id. Parent `/rlm` state is changed only by a guarded read-modify-write of one leaf (`commitRlmLeaf`, committed with the state version it decided against), never rewritten whole; a binding is merged, never replaced: `cancellation` is set once and never dropped, `runId` and `state` never regress. A revocation (`rlm.revoked.<invocationId>` or `*`, written by `revokeRlmGrant`) cannot be erased by a binding write `[rlm.ts:commitRlmLeaf]`
- A cancelled child, a cancelled parent, a recorded cancellation or a withdrawn grant prevents a new dispatch. `rlm.cancel` records a cancellation first when there is no child yet, cancels the child, then asks the provider only if an intent exists; a failed or unrecorded provider cancel is retried by a second `rlm.cancel` even on a terminal child; only a terminal parent's refusal to record is swallowed `[rlm.ts:createRlmComponent]`
- `attempt` is a positive integer; the same `invocationId` under another attempt is refused, and a new `invocationId` for the same parent and task digest is refused (`rlm-attempt-refused`) while a prior attempt of that task is unresolved, decided atomically with the write of its pending binding. Known debt DEBT-035: cancelling a parent does not cascade to its dispatched children `[rlm.ts:createRlmComponent]`

## Side Effects
- Opens a SQLite file or a PostgreSQL connection, or starts a pg0-managed instance, depending on `RuntimeStoreConfig` [src/runtime.ts:startRuntime]
- Background timers: safety-net tick (default 250 ms), retry wake, and approval polling when `approvalPollMs > 0` [src/runtime.ts:startRuntime]
- Unix-socket NDJSON exchange with SEA-Forge for every governed decision in `sea-forge` mode [src/sea-forge-authority.ts:exchange]
- `erase` propagates erasure into continuations and the cognitive index [src/runtime.ts:startRuntime]

## Verification
- Run: `cd packages/runtime-bun && bun test`
