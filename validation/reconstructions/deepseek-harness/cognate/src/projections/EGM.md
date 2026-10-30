# projections — the public read models

## Overview

Eleven public projections, each a pure fold of one event family into tenant-prefixed rows. These are
the only read models the browser sees; every one of them is derived and rebuildable from the event
log, and none is a second source of truth. Three conventions recur: one `current` row per tenant for
singleton state, one row per entity keyed by id, and a `null` value to delete a key.

## Interface

- `modelConfigProjection` — `model-config`, one `current` row per tenant, never carrying the secret `[validation/reconstructions/deepseek-harness/cognate/src/projections/modelConfig.ts:modelConfigProjection]`
- `settingsProjection` — `settings`, merges partial `settings.changed` patches into one `current` row `[validation/reconstructions/deepseek-harness/cognate/src/projections/settings.ts:settingsProjection]`
- `workspacesProjection` — `workspaces`, one `record/<id>` row plus a `current` pointer `[validation/reconstructions/deepseek-harness/cognate/src/projections/workspaces.ts:workspacesProjection]`
- `executionWorldsProjection`, `WorldRecord` — `execution-worlds`, one `record/<worldId>` row with safe metadata only `[validation/reconstructions/deepseek-harness/cognate/src/projections/executionWorlds.ts:executionWorldsProjection]`
- `sessionsProjection` — `sessions`, one row per `session:`-correlated session `[validation/reconstructions/deepseek-harness/cognate/src/projections/sessions.ts:sessionsProjection]`
- `plansProjection`, `PlanState`, `PlanReview`, `TodoItem` — `plans`, one row per session `[validation/reconstructions/deepseek-harness/cognate/src/projections/plans.ts:plansProjection]`
- `subagentsProjection`, `SubagentRow` — `subagents`, one row per `subagent` tool call `[validation/reconstructions/deepseek-harness/cognate/src/projections/subagents.ts:subagentsProjection]`
- `sessionTraceProjection`, `TraceRow`, `TraceRequest`, `TraceTool`, `TraceTurn` — `session-trace`, per-session turns with request and tool rows `[validation/reconstructions/deepseek-harness/cognate/src/projections/sessionTrace.ts:sessionTraceProjection]`
- `onboardingProjection` — `onboarding`, one row per dismissed step `[validation/reconstructions/deepseek-harness/cognate/src/projections/onboarding.ts:onboardingProjection]`
- `cognitiveProjection` — `cognitive`, a `latest` change signal plus an `activeCase` row `[validation/reconstructions/deepseek-harness/cognate/src/projections/cognitive.ts:cognitiveProjection]`
- `workbenchProjection` — `workbench`, delegates the fold to the pure reducer `[validation/reconstructions/deepseek-harness/cognate/src/projections/workbench.ts:workbenchProjection]`

## Invariants

- The `model-config` fold never contains a credential; the event it folds never had one `[validation/reconstructions/deepseek-harness/cognate/src/projections/modelConfig.ts:modelConfigProjection]`
- The `settings` fold merges instead of replacing, and merges the `plugins` map per key so a toggle cannot clobber other plugins `[validation/reconstructions/deepseek-harness/cognate/src/projections/settings.ts:settingsProjection]`
- A `null` value in a projection write deletes that key — this is how a deleted workspace and a disconnected world disappear `[validation/reconstructions/deepseek-harness/cognate/src/projections/workspaces.ts:workspacesProjection]`
- `sessions` excludes anything whose correlation is not `session:`, which keeps subagent child runs out of the sidebar tree `[validation/reconstructions/deepseek-harness/cognate/src/projections/sessions.ts:sessionsProjection]`
- A plan review keeps its last decision after plan mode turns off; a `plan.review.decided` for a stale `toolCallId` is ignored `[validation/reconstructions/deepseek-harness/cognate/src/projections/plans.ts:plansProjection]`
- `cognitive` stores no Case: it is only a change signal, and the Case is re-derived server-side `[validation/reconstructions/deepseek-harness/cognate/src/projections/cognitive.ts:cognitiveProjection]`
- `workbench` folds only `workbench.*` events and adds the tenant prefix itself `[validation/reconstructions/deepseek-harness/cognate/src/projections/workbench.ts:workbenchProjection]`
- `execution-worlds` records carry no password, passphrase, or key material — only auth kind, key path, and pinned fingerprint `[validation/reconstructions/deepseek-harness/cognate/src/projections/executionWorlds.ts:executionWorldsProjection]`

## Side Effects

- None; every module here is a pure `apply(event, state)` function `[validation/reconstructions/deepseek-harness/cognate/src/projections/workbench.ts:workbenchProjection]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/J-G-persistence.test.ts ./test/J-SET-settings.test.ts ./test/J-PLG-panels.test.ts`
