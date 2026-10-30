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

## Side Effects
- Opens a SQLite file or a PostgreSQL connection, or starts a pg0-managed instance, depending on `RuntimeStoreConfig` [src/runtime.ts:startRuntime]
- Background timers: safety-net tick (default 250 ms), retry wake, and approval polling when `approvalPollMs > 0` [src/runtime.ts:startRuntime]
- Unix-socket NDJSON exchange with SEA-Forge for every governed decision in `sea-forge` mode [src/sea-forge-authority.ts:exchange]
- `erase` propagates erasure into continuations and the cognitive index [src/runtime.ts:startRuntime]

## Verification
- Run: `cd packages/runtime-bun && bun test`
