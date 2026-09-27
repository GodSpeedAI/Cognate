# Plan: DeepSeek Harness reconstruction (branch `cognate/harness`)

Spec: [.agents/prompts/deepseek-harness-reconstruction-test.md](../prompts/deepseek-harness-reconstruction-test.md). Method: [building-with-cognate](../skills/building-with-cognate/SKILL.md).
Reference: `deepseek-ai/deepseek-harness` @ `477b4f420553e8a52c2fbccc464d7561b239c443` (dsh 0.1.7-rc.2), cloned at `.tmp/ref/deepseek-harness` (git-ignored, observation only).
Output root: `validation/reconstructions/deepseek-harness/` (R below).

## Tranches (vertical slices, ordered by dependency and risk)

| # | Tranche | Journeys | Output |
|---|---|---|---|
| T0 | Pin + characterize reference | — | `R/reference-manifest.json`, `R/reference/observations/*` |
| T1 | Deterministic scenario model server (OpenAI-compatible SSE, scenario chosen by marker in last user message) + fixture workspace (known files + git state). Shared by reference and Cognate. | all | `R/fixtures/` |
| T2 | Reference behavior matrix and screenshots via Playwright against the pinned reference + T1 | all | `R/reference-behavior-matrix.md`, `R/reference/screenshots/` |
| T3 | Interaction domain model (`.sea`), validated | all | `R/cognate/domain/`, handoff |
| T4 | Framework defect repairs (general, regression-tested) and gap records | B, H | see "Findings" |
| T5 | App skeleton: Bun server + Connect runtime + React/Astryx shell geometry, Settings → Models (provider hot-swap), workspace choose/select, composer gating | A | `R/cognate/` |
| T6 | Sessions, conversation, streaming, history, reload/restart restore | B, G | |
| T7 | Tools: read / edit / shell, tool cards, diffs, workspace mutation | C | |
| T8 | Approvals: policy gate + continuation, approve / deny, persistence | D | |
| T9 | Plan mode / goals as projection over events | E | |
| T10 | Subagents: scoped child runs, activity view | F | |
| T11 | Cancel, provider error, retry | H | |
| T12 | Parameterized Playwright journey suite (reference + Cognate), visual side-by-side + diffs | A–H | `R/tests/`, `R/diffs/` |
| T13 | Architecture purity tests, reference-removal run, provenance, parity report, critic loop | — | `R/primitive-provenance.md`, `R/parity-report.{md,json}` |

Each tranche: builder subagent (Sonnet; Haiku for tightly local edits) → orchestrator verification (tests + diff + screenshots) → critic subagent with evidence → fix → commit.

## Findings (architectural)

- **D1 (defect, existing primitive):** `RunContext.emit` called inside `RunContext.step` shifts `emit:<n>` counters on replay (the replayed step skips its inner emits), so later emits can collide with recorded ones. `packages/runtime-bun/src/executor.ts` `emit`/`step`. Domain-independent; repair with a regression test.
- **D2 (defect, existing primitive):** `provider-openai-compatible` advertises `stream: true` but implements no `stream()`.
- **G1 (candidate gap):** a capability handler cannot publish progress (e.g. model token deltas) into the invoking run: `HandlerContext` has no emit/progress channel. Streaming through a policy-gated, hot-swappable `model.*` capability is therefore not expressible today. Decision pending (see status).

G1 decision (operator, 2026-09-26): repair D1/D2 and add the domain-independent invocation progress channel with conformance tests; record G1 in the parity report as a finding the reconstruction surfaced.

## Reconstruction architecture (`R/cognate/`)

Scaffold with `cognate create --profile harness`, then add the app. One Bun process (single SQLite writer): runtime + Connect `RuntimeService` + static React/Astryx bundle. Browser talks only through `@cognate/client` over Connect (`connectTransport` + `createRemoteRuntimeService`). Data dir from `COGNATE_HARNESS_HOME` (tests use isolated dirs).

| Reference concept | Cognate composition |
|---|---|
| Model provider / Settings → Models | `providerComponent`-style component per configured provider publishing `model.generate`; hot-swap = dispose + mount. Config changes are runs of `agent.config` emitting `model.configured` (no secret in payload); a public projection `model-config` folds them. API keys live in a write-only secret file outside the event log; events carry only `credential: "set"`. |
| Workspace | `agent.config` emits `workspace.added` / `workspace.selected`; public projection `workspaces`. Tool capabilities take the workspace root from the run input and enforce path containment (scoped capability). |
| Session | correlation `session:<id>`; each user turn is one run of `agent.coding` with `{ sessionId, workspaceId, message }`. Public projection `sessions` (title from first message, workspace, last status). |
| History | capability `session.history` (component closing over `runtime.service`) folds prior runs' events into model messages; invoked via `ctx.invoke`, so it is recorded. |
| Streaming | model component handler calls `provider.stream` and forwards deltas via `HandlerContext.progress` → `run.invocation.progress`; the UI folds them per run. The final response is the recorded invocation result. |
| Tools | `tool.read`, `tool.edit`, `tool.bash`, `tool.run_code`, `tool.todo_write`, `tool.exit_plan_mode`, `tool.subagent` (model-facing names match the reference). |
| Approval | agent gate named after the `.sea` Policy: gated calls `ctx.waitFor("approve:<callId>", { type: "tool-approval", condition: { kind: "human_approval" }, payload })`; UI resolves with `{ approved }`. Kernel policy grants tools to operator/system only. |
| Plan | `todo_write` / `exit_plan_mode` emit `plan.updated`; `exit_plan_mode` waits on a continuation; projection `plans`. |
| Subagent | `spawnSubagent` (profile-harness) → child run of `agent.coding` with its own correlation `subagent:<parentRun>:<id>`; parent tool card links to child activity. |
| Cancel / error / retry | `cancelRun` (signal reaches provider); a failed/cancelled run is terminal; retry = new run in the same session. |
- **F2 (framework finding):** `spawnSubagent` is exported from `@cognate/profile-harness`, but the `run_completion` continuation resolver it depends on lives inside `createHarness`; an app composing `createRuntime` directly must copy it. Candidate general fix: export the resolver (e.g. `watchSubagentCompletions(runtime, caller)`) and have `createHarness` use it. Not needed by the reconstruction once delegation follows the reference's fire-and-forget semantics.
- **F3 (defect, existing primitive):** `packages/runtime-bun/src/invoker.ts` `failureJson` keeps only the error message, dropping structured fields (e.g. `ModelProviderError.kind`/`status`), so agents must classify failures by message text. Repair: preserve a JSON-safe `code`/`details` on the recorded failure.
