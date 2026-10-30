# deepseek-harness/cognate/domain — in-place `.sea` loader and explicit capability bindings

## Overview

One module, `index.ts`, with two jobs: read the reconstruction's Interaction Domain Model (IDM) from
`.sea/interaction/interaction-model.sea` at startup, and declare which capability ids anchor on which
semantic entity. Its own header states the design decision — `domain/` neither copies nor symlinks
the `.sea` source, it re-exports it in place and is the single place that knows the path
`[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:INTERACTION_MODEL_URL]`.
Parsing and anchor resolution are delegated to `@godspeedai/cognate-domainforge`
(`loadSemanticProjection`, `bindCapabilities`); the types come from `-domainforge` and
`-kernel-api` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`.

## Interface

- `Domain` — the projection plus `semanticId(name)`, which renders `${namespace}::${name}`; the namespace is the literal `deepseek-harness.interaction` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- `loadDomain` — reads the model, parses it, logs object count + digest, returns a `Domain` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- `tranche5Bindings` / `bindTranche5` — five bindings: `model.generate`, `secret.put`, `model.configure` on `ModelProvider`; `workspace.select` on `WorkspaceRecord`; `session.history` on `Session` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche5Bindings]`
- `tranche7Bindings` / `bindTranche7` — `tool.read`, `tool.edit`, `tool.bash`, `tool.run_code` on `Tool`; `workspace.path` on `WorkspaceRecord` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche7Bindings]`
- `tranche9Bindings` / `bindTranche9` — `plan.state` on `PlanMode` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche9Bindings]`
- `tranche10Bindings` / `bindTranche10` — `subagent.start` on `Subagent` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche10Bindings]`
- `usage3Bindings` / `bindUsage3` — `workspace.rename`, `workspace.delete` on `WorkspaceRecord`, returned as `{ rename, remove }` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:usage3Bindings]`
- `executionWorldBindings` / `bindExecutionWorlds` — `process.exec`, `execution.world.connect`, `execution.world.disconnect` on `ExecutionWorld`; `execution.world.probe`, `execution.world.check` on `WorldConnection` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:executionWorldBindings]`
- `COGNITIVE_ANCHORS` / `cognitiveBindings` / `bindCognitive` — capability id → entity map (for example `world.fork` → `ExecutionWorld`, `criterion.freeze` → `Criterion`, `ui.focus.publish` → `UiFocus`), keyed back by capability id `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:COGNITIVE_ANCHORS]`
- `WORKBENCH_ANCHORS` / `workbenchBindings` / `bindWorkbench` — capability id → entity map for the Workbench layer (`task.create` → `Task`, `authority.check` → `ProtectedEvidence`, `steer.enqueue` → `SteeringInbox`, …) `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:WORKBENCH_ANCHORS]`

## Invariants

- A parse failure throws instead of returning a partial projection `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- Each binding group asserts its exact expected contract count and throws on mismatch (`bindTranche5` and `bindTranche7` expect 5, `bindTranche9`/`bindTranche10` 1, `bindUsage3` 2, `bindExecutionWorlds` 5) `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:bindTranche5]`
- `bindCognitive` compares the bound count against the binding count and throws if any contract lacks a `semanticRef` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:bindCognitive]`
- Anchoring is explicit, never inferred from the capability name; the comments say so for the cognitive and workbench layers `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:COGNITIVE_ANCHORS]`
- `ApprovalGate` and `PlanMode` are deliberately covered by the comments as *not* bound contracts — they are a pure decision function plus a `ctx.waitFor` continuation and app events, respectively — and only `plan.state` is bound `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:tranche7Bindings]`

## Side Effects

- Reads `../.sea/interaction/interaction-model.sea` relative to this module and logs its object count and source digest to stdout `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`

## Verification

- No test file or runner lives in this directory; the module is exercised through the app's suite: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test` `[validation/reconstructions/deepseek-harness/cognate/package.json:scripts]`
