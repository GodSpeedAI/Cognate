# Recon: Cognate Workbench (recon-software lens)

Scope: read-only. No checkout, fetch, pull, reset, or edits in either repo. Refs inspected via `git show` / `git ls-tree` / `git grep` / `git diff`.

## 0. Refs, SHAs, drift

| Ref | SHA | Notes |
|---|---|---|
| `main` (local) | `d208cd0491d5d76839ed4dedbababc589383ad09` | Subject: `feat: add plugin lifecycle management, session archiving, and comprehensive test suite` (2026-10-13 14:07 -0400) |
| `origin/main` | `d208cd0491d5d76839ed4dedbababc589383ad09` | Matches local (`gh api repos/GodSpeedAI/Cognate-Workbench/branches`) |
| `feature/expert-teams` (local, checked out) | `7eabd82ecc908aaabc251940f1ec1906b290e89e` | `docs: plan remaining debt tranches on settled 0.5.0 baseline`. Ahead 1 of origin. |
| `origin/feature/expert-teams` | `fdc709b9ccff47d52619185f6e9e03fdd9ae8d08` | `feat: consume published Cognate 0.5.0 with native admission and contained workspaces` (2026-10-15 12:37 -0400) |

- Drift: local feature is 1 commit ahead of origin (docs-only: 4 files, `.agents/`, `CURRENT_STATUS.md`). `git diff origin/feature/expert-teams feature/expert-teams -- src test` is empty, so all `src/` and `test/` citations for feature apply to both SHAs.
- Working tree: `git status --short` is clean (no output) at the time of inspection. `actualize/` seen at session start belongs to the cognate repo, not this one.
- `main` vs `feature/expert-teams`: 146 files changed, +14463 / -276 (`git diff --stat main..feature/expert-teams`).
- Cognate package versions: main `package.json` pins `@godspeedai/*` at `0.2.0` (`main:package.json`); feature pins `0.5.0` (`feature:package.json`). Feature `node_modules/@godspeedai/*` is 0.5.0 (local install, untracked).

## 1. What Workbench is

Cognate Workbench is a single-process Bun app (`main:src/server.ts:180-447`, `main:README.md:3-5`) that hosts a browser cockpit for supervising a coding agent. Its stated thesis: "Authority is declared before the agent acts. Traces are inspectable afterward. Settled work becomes reusable capability" (`main:README.md:3`). It is composed from Cognate SDK packages (`main:package.json` dependencies) on top of an event-sourced runtime with PostgreSQL storage (`main:src/store.ts:14-23`, `main:README.md:15`).

Surfaces:
- **Browser cockpit (UI):** single React app, `main:src/ui/App.tsx`, with sidebar sessions/workspaces, Plugins, Workbench, Settings (`main:src/ui/App.tsx:1837`, `:5189`). The Workbench has four tabs: Tasks, Workflows, Capabilities, Automations (`main:src/ui/workbench/Workbench.tsx:33-36`). Feature branch adds an "Experts & Teams" sidebar button (`feature:src/ui/App.tsx:4996`) that mounts `ExpertsTeamsPanel` (`feature:src/ui/App.tsx:7`, `:5307`).
- **HTTP server:** `Bun.serve` on `PORT` default 3180 (`main:src/server.ts:441-442`). Routes: `/health`, Connect RPC `/cognate.v1.RuntimeService/*`, `/app.js`, `/app.css`, `/`, `/astryx.css`, `/theme.css` (`main:src/server.ts:409-422`; `main:docs/architecture.md:69-82`).
- **CLI:** no `bin` entry in package.json. Entry is `bun src/server.ts` (`main:package.json` scripts) and `just` recipes (`main:justfile`). `main:cognate.config.ts` says it is "Not consumed by `cognate dev`".
- **No public task API beyond the Connect service and the UI.** Writes start runs (`main:docs/architecture.md:164`).

## 2. Capabilities: inherited vs implemented vs stubbed

### 2a. Inherited from Cognate packages (main 0.2.0 / feature 0.5.0)

Install-time list is in `main:package.json` and `feature:package.json`. Descriptions below come from the installed feature `node_modules/@godspeedai/*/package.json` (0.5.0) `description` fields. Main's 0.2.0 packages are not installed in this checkout, so their exact provides are unverified.

| Package | Used by Workbench for (citation) | Provides (feature node_modules 0.5.0 description) |
|---|---|---|
| `cognate-runtime-bun` | `createRuntime` composition (`main:src/server.ts:10,212`) | Bun reference runtime composing kernel, store, runs, continuations |
| `cognate-runtime-api` | `RuntimeService`, `Caller` types (`main:src/server.ts:9`) | Transport-independent runtime service contract |
| `cognate-kernel-api` | `allowCapabilities`, `rulePolicy`, `Policy` (`main:src/server.ts:7-8`) | Kernel contract: contexts, scopes, capabilities, components |
| `cognate-events` | event envelope/store types | Event envelope, durable store port |
| `cognate-projections` | `Projection` interface (`main:src/projections/*.ts`) | Checkpointed, rebuildable projections over the event log |
| `cognate-capabilities` | `ModelProvider`, `ToolDefinition` (`main:docs/architecture.md:93`) | Two-phase capability selection (not used for model calls directly) |
| `cognate-domainforge` | `bindCapabilities`, `loadSemanticProjection` (`main:domain/index.ts:10`) | Adapter from DomainForge graph output to SemanticRefs |
| `cognate-execution` (+`-ssh`, `-wsl`) | `createExecutionWorldRegistry`, `localExecutionWorld` (`main:src/server.ts:25`) | Execution-world contracts; filesystem and process ports |
| `cognate-provider-openai-compatible` / `-openai-responses` / `-anthropic-compatible` / `-auth` | `buildProvider` (`main:src/components/providerRegistry.ts:3-27`) | Model adapters; credential boundary |
| `cognate-protocol-connect(-bun)` | Connect server, dev token (`main:src/server.ts:13-14`) | Maps RuntimeService to Connect; Bun.serve transport |
| `cognate-client`, `cognate-react` | browser client, provider (`main:src/server.ts:142-143`) | Headless client; React hooks |
| `cognate-ui-astryx` | stylesheet paths (`main:src/server.ts:17`) | Reference Astryx surfaces |
| `cognate-realitytrace` | observation port/outbox (`main:src/observations.ts`) | Observation port, outbox delivery, SXR adapter |
| `cognate-store-postgres` | `storeConfigFor` (`main:src/store.ts:18-23`) | Authoritative DurableStore on PostgreSQL |
| `cognate-cli` | not used at runtime (cognate.config.ts comment) | `cognate dev`/`create`; Workbench does not use it |
| `cognate-continuations` (feature only, 0.5.0) | pulled in by feature deps (`feature:package.json`) | Durable continuations and external commitments |

Framework-level `ctx.waitFor` / continuation semantics are used by the agent loop (`main:src/agents/agentCoding.ts:480,527`), so the human-approval pause is an inherited mechanism, implemented by Workbench's call sites.

### 2b. Implemented in Workbench (capability definitions and bindings)

- Binding model: semantic id to `SemanticRef` via `bindCapabilities` per tranche (`main:domain/index.ts:41-276`). Declared model source: `.sea/interaction/interaction-model.sea` (`main:domain/index.ts:10,22-27`), 728 lines.
- Workbench capability set, 23 ids: `WORKBENCH_CAPABILITY_IDS` (`main:src/capabilities/workbench.ts:39-63`). Examples: `task.create`, `task.contract.update`, `task.review.decide`, `worker.return`, `evidence.record`, `authority.check`, `authority.elevate`, `workflow.define`, `workflow.instantiate`, `skill.register`, `skill.bind`, `automation.create`, `usage.record`, `parallelism.plan`, `steer.enqueue`, `feedback.record`, `workbench.seed`.
- Composition: `main:src/server.ts:212-268` registers components (`executionWorldsComponent`, `cognitiveComponent`, `secretPutComponent`, `sessionHistoryComponent`, `workspacePathComponent`, `toolCapabilitiesComponent`, `planStateComponent`, `subagentStartComponent`, `settingsChangeComponent`, `workspaceManageComponent`, `workbenchComponent`, `sessionArchiveComponent`, `configPathComponent`, `pluginInstallComponent`) and 12 projections (`main:src/server.ts:254-266`). Post-create mounts at `main:src/server.ts:273-300` (workspaceSelect, modelConfigure, providerManage, observationCapability).
- Agents: `agentConfigAgent`, `agentCodingAgent`, `agentCognitiveAgent` (`main:src/server.ts:218`). Feature adds `agentExpert` (`feature:src/server.ts` agents list; `feature:src/agents/agentExpert.ts:8-16`).
- Policy: `GRANTED_CAPABILITIES` allows `user`/`system` actors only (`main:src/server.ts:124-130`). Human-only capabilities are documented as "settle, review, elevate, accept" (`main:docs/architecture.md:176`).

### 2c. Declared but unimplemented / recorded-only (stubs)

- **Parallelism plans:** `parallelism.plan` returns a plan and starts nothing. README: "Parallelism plans | Recorded. Do not start workers." (`main:README.md:57`). Implementation is a pure planner (`main:src/workbench/parallelism.ts:105`), exposed at `main:src/capabilities/workbench.ts:388`.
- **Automation records:** README: "Automation records | Stored. No background scheduler." (`main:README.md:58`). Main has `automation.create`/`automation.advance` (`main:src/capabilities/workbench.ts:354`) with no driver.
- **Capability substitution:** "Recorded. Does not rebind a running tool." (`main:README.md:55-56` region). `skill.bind` records a binding (`main:src/capabilities/workbench.ts:322-333`).
- **Budget:** "Informational. Not enforced as a runtime limit." (`main:README.md:59`). Contract budget fields exist (`main:src/workbench/contract.ts:180-181`) and ContractEditor edits `maxConcurrency` (`main:src/ui/workbench/ContractEditor.tsx:136-147`).
- **Capability substitution:** `main:README.md:56` "Recorded. Does not rebind a running tool."
- **Isolation / execution policy:** `main:docs/architecture.md:178` "best-effort path checks, shell classification, NOT a sandbox". README Status: "In progress: orchestration, automation, isolation, and execution-policy enforcement" (`main:README.md` Status section).
- Feature branch changes two of these: scheduled Expert/Team occurrences execute (see section 4), and README on feature line 67 says legacy automation records are stored intent while native schedules execute (`feature:README.md:66-67`).

## 3. Main: capability evidence

| Capability | Implementation (main) | Test coverage (main) |
|---|---|---|
| Tool execution (read/edit/bash/run_code) | Tool capability contracts `main:src/capabilities/tools.ts:164-208` (`contract("bash")` at `:208`). Actual process execution is in the execution world: `main:src/capabilities/executionWorlds.ts:163` (`provider.process.exec`). The `Bun.spawn` at `main:src/capabilities/tools.ts:152` is inside the `RUN_CODE_HARNESS` string, not in the host handler. Tool loop in `main:src/agents/agentCoding.ts` | `test/J-C-tool-execution.test.ts`; `test/workbench-shellsafety.test.ts` |
| Provider composition | `buildProvider` `main:src/components/providerRegistry.ts:18-27`; `ProviderRegistry` mounted `main:src/server.ts:272-273`; boot remount for durability `main:src/server.ts:298-300`; `model.generate` retries via `ctx.invoke` `main:src/agents/agentCoding.ts:123-130` | `test/J-CFG-model-provider.test.ts`, `test/J-CFG-provider-delete.test.ts`, `test/J-H-provider-error.test.ts`, `test/providerRegistry.test.ts` |
| Durable state | Postgres or pg0 `main:src/store.ts:14-23`; `storeConfigFor`; README "Durable" row `main:README.md:15`; `docs/architecture.md:120-157` | Store-level tests not confirmed in this pass (unknown, see section 9) |
| Human approvals | `approvalGate` only escalates `run_code` with `sandbox_permissions` above the mode rank: `main:src/domain/approvalGate.ts:52-62`. Call site `main:src/agents/agentCoding.ts:435`. Task-contract approval forces approval for edit/bash `main:src/agents/agentCoding.ts:421-439`. Human pause `ctx.waitFor("approve:...", {condition:{kind:"human_approval"}})` `main:src/agents/agentCoding.ts:527-529`; denial text `main:src/agents/agentCoding.ts:534` and `main:src/domain/approvalGate.ts:66`. Plan review pause `main:src/agents/agentCoding.ts:480-482` | `test/J-D-approval.test.ts`, `test/J-E-plan.test.ts` |
| Protected evidence / write gates | Protected-evidence checks in `main:src/workbench/ledger.ts:163-188`; `evidence.record` `main:src/capabilities/workbench.ts:195` | `test/J-WB-protected-evidence.test.ts`, `test/J-WB-review-gate.test.ts`, `test/E2E-workbench.test.ts` |
| Traces / history | `sessionTraceProjection` `main:src/projections/sessionTrace.ts:78` registered public `main:src/server.ts:256`. Observation outbox `main:src/server.ts:213-217`; RealityTrace delivery gated by plugin state `main:src/server.ts:313-345` | `test/J-COG-realitytrace.test.ts`, `test/J-RT-realitytrace.test.ts` |
| Task contracts | `contractMissing` `main:src/workbench/contract.ts:5`; `isContractComplete` `:51`; defaults `:55`; capability `task.contract.update` `main:src/capabilities/workbench.ts:152`; reducer `main:src/workbench/reducer.ts:130` | `test/J-WB-task-contract.test.ts`, `test/workbench-contract.test.ts` |
| Review gate | `task.review.decide` `main:src/capabilities/workbench.ts:214-236`; rework appends a failing human evidence entry `:234` | `test/J-WB-review-gate.test.ts`, `test/workbench-review-patch.test.ts`, `test/ui-review.test.tsx` |
| Workflows | `workflow.define/instantiate/node.advance` `main:src/capabilities/workbench.ts:279-310`; `src/ui/workbench/WorkflowGraph.tsx` | `test/J-WB-workflow.test.ts`, `test/workbench-workflow.test.ts` |
| Steering | `steer.enqueue` `main:src/capabilities/workbench.ts:390-395` (feature shows same id at `feature:src/capabilities/workbench.ts:390`); inbox read at `feature:src/agents/agentCoding.ts:447-448` | `test/workbench-steering.test.ts` |
| Parallelism | Planner only, see 2c | `test/J-WB-parallelism.test.ts`, `test/workbench-parallelism.test.ts` (plan assertions only) |

Main test files: 73 under `test/` (`git ls-tree -r main -- test`).

## 4. Feature branch: Experts, Teams, schedules, plugins

Implementation status and reachability:

| Capability | Implemented | Reachable from UI | Tested |
|---|---|---|---|
| Persistent Experts (CRUD, routes, memory) | `feature:src/experts/service.ts` (`expertsComponent` `:467`), `feature:src/experts/persistence.ts`, `feature:src/experts/state.ts`, `feature:src/agents/agentExpert.ts:8-16` | Yes: `ExpertsTeamsPanel` `feature:src/ui/App.tsx:5307`, `feature:src/ui/experts/ExpertEditor.tsx` | `test/J-EXPERT-management.test.ts` (3 tests), `test/E2E-experts.test.ts` (2 tests), `test/expert-governance.test.ts` |
| Custom Teams and delegation | `team.delegate` `feature:src/experts/service.ts:323`; `team.converse`/`expert.converse` `:219`; team scope on assignments `:78-79`, `:156`; UI `feature:src/ui/experts/TeamEditor.tsx` | Yes (ExpertsTeamsPanel) | `test/E2E-experts.test.ts`, `test/ui-experts.test.tsx` |
| Scoped memory | Read access checks: private-to-Expert and cross-Team denial `feature:src/experts/service.ts:203-213`. Write `expert.memory.write` `feature:src/experts/service.ts:435`; UI `feature:src/ui/experts/ExpertsTeamsPanel.tsx:497` | Yes | `test/J-EXPERT-memory.test.ts` |
| Expert inbox / messaging | `feature:src/experts/service.ts:320-367` (pending/queued delivery), `feature:src/experts/bridge.ts:26-38` | Yes (live inbox screenshot) | `test/J-EXPERT-inbox.test.ts`, `test/J-EXPERT-inbox-replay.test.ts` |
| Scheduling | Native schedules and occurrences: `feature:src/schedules/service.ts:100-113` (deterministic sha256 occurrence id, idempotent reserve). Evaluator loop: `feature:src/schedules/evaluator.ts:200-216` (1 s poll by default, `intervalMs ?? 1_000`). Started at boot: `feature:src/server.ts:492` (default on unless `enableScheduleEvaluation === false`) | Yes: `feature:src/ui/experts/SchedulesPanel.tsx`, `SchedulesSurface.tsx` inside ExpertsTeamsPanel | `test/J-SCHEDULE-execution.test.ts`, `test/experts-runtime-scheduling.test.ts`, `test/ui-schedules.test.tsx` |
| Runtime capacity config | `parseExpertAdmissionCapacity` from `COGNATE_RUN_CAPACITY` or option `feature:src/server.ts:214`; default 1 | Read-only inspection capability `feature:src/capabilities/runtimeExecution.ts:6-17`; UI `feature:src/ui/experts/RuntimeExecutionStatus.tsx` | `test/experts-app-capacity.test.ts`, `test/ui-runtime-execution.test.tsx`, `test/expert-admission.test.ts` |
| Contained workspaces | `feature:src/capabilities/containedWorkspace.ts` | Yes (`feature:src/ui/App.tsx` contained workspace UI, screenshots `containment/`) | `test/J-RW-contained-workspace.test.ts`, `test/containedWorkspace.test.ts`, `test/E2E-contained-workspace.test.ts` |
| Plugin lifecycle | Main has `plugin.install`/`uninstall`/`catalog` via durable `plugin.installed` events (`main:src/capabilities/pluginInstall.ts:1-9`, `:43-45`); registry at `main:src/server.ts` (`PluginRegistry`); `pluginsProjection` `main:src/server.ts:265` | Yes: Plugins sidebar entry (main screenshot `e2e-03` shows Plugins nav) | `test/workbench-plugins.test.ts` (feature file list); main-side test coverage not confirmed |

### 4a. Do Experts actually run in parallel?

Short answer: only under opt-in configuration, and only for model-only turns. Default is serial.

- Default capacity: `COGNATE_RUN_CAPACITY` unset gives `1` (`feature:src/server.ts:214`, `parseExpertAdmissionCapacity` `feature:src/experts/admission.ts:77-81` accepts 1, 2, 4, 8). Policy string `serial` when capacity is 1, else `model-only-parallel` (`feature:src/capabilities/runtimeExecution.ts:17`).
- Only when `runCapacity > 1` does the runtime receive `execution: { maxConcurrentRuns, resourceKeys }` (`feature:src/server.ts:282`). Otherwise the `...(runCapacity>1 ? ...)` spread is empty.
- Workspace-effecting runs share one resource key, `WORKSPACE_EFFECTS_RESOURCE_KEY = "workbench:workspace-effects"` (`feature:src/experts/admission.ts:5-6`). The admission key comment: "The only work allowed to overlap Workbench workspace effects is a model-only Expert turn" (`feature:src/experts/admission.ts:5`). Server comment: "every workspace-capable run shares a key" (`feature:src/server.ts:280-281`).
- Tests that pin the behavior:
  - Overlap at capacity 2 for two model-only Experts: `feature:test/J-EXPERT-model-parallel.test.ts:55-76` (asserts `gate.peak()` is 2).
  - Default capacity serializes: `feature:test/J-EXPERT-model-parallel.test.ts:78-93` (peak 1).
  - Two tool-bearing Experts serialize even at capacity 2: `feature:test/J-EXPERT-model-parallel.test.ts:112-136` (`gate.peak()` 1).
  - Workspace rename waits behind an active tool-bearing Expert: `feature:test/J-EXPERT-model-parallel.test.ts:193-249`.
  - Browser E2E of two model-only overlaps at capacity 2: `feature:test/E2E-expert-model-parallel.test.ts:53-139` (asserts `peak()` 2 and mobile scrollWidth <= 360).
  - Runtime-level admission with four independent custom agents at capacity 1, 2, 4: `feature:test/experts-runtime-scheduling.test.ts:10-25` (agents are test agents with 250 ms sleeps; they exercise the SDK, not Workbench Experts).
- Docs say the same: "Default capacity remains1" and "General workspace concurrency and Team-specific capacity remain open" (`feature:docs/experts-concurrency-benchmark.md:36-37` region).
- Scheduled occurrences do enter the same admission, so multiple due Experts can overlap only when capacity > 1 and their runs are model-only.
- Caveat: the Expert executor is `agentCodingAgent.run` wrapped (`feature:src/agents/agentExpert.ts:12-14`), so an Expert turn is a full coding-agent loop; "model-only" means no workspace-effect tools (`expert_return` only), enforced by `assertModelOnlyExpertRun` `feature:src/experts/admission.ts:16`.
- Main: no Expert concept; parallelism is planning-only (2c).

Verdict for the landing page: "Experts run in parallel" is true only as "opt-in, model-only, bounded (1/2/4/8), default serial". Do not claim general parallel workspace execution.

## 5. Visual evidence

All screenshots: extracted to `/tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/wb/shots/{main,feat}/`. Dimensions read from PNG headers.

| Path | Ref | Dimensions | Introduced (commit date) | What it shows | Hero fit |
|---|---|---|---|---|---|
| `screenshots/workbench/e2e-01-empty.png` | main@d208cd0 (also feature) | 1440x900 | 2026-10-13 d208cd0 | Empty Workbench | Low |
| `screenshots/workbench/e2e-02-new-task-contract-missing.png` | main, feature | 1440x900 | 2026-10-13 | Task created, contract incomplete | Medium |
| `screenshots/workbench/e2e-03-contract-complete.png` | main, feature | 1440x900 | 2026-10-13 | "Update the greeting" task, contract complete, "Mark ready", "How done is it" ladder, acceptance criteria table (TEST, INDEPENDENT-CHECK, HUMAN, all open) | **Best main hero**: shows Cognate sidebar with LOCAL BUILD tag, Workbench tabs, contract chips, honest done-ladder |
| `screenshots/workbench/e2e-04-protected-write-blocked.png` | main, feature | 1440x900 | 2026-10-13 | Protected write blocked | Medium (governance proof) |
| `screenshots/workbench/e2e-04b-focus.png` | main, feature | 1440x900 | 2026-10-13 | Focus state | Low |
| `screenshots/workbench/e2e-05-authority-and-blocked.png` | main, feature | 1440x900 | 2026-10-13 | Authority plane and blocked state | Medium |
| `screenshots/workbench/e2e-06-review-blocked-independent-check.png` | main, feature | 1440x900 | 2026-10-13 | Review blocked on independent check | Medium |
| `screenshots/workbench/e2e-07-review-gate.png` | main, feature | 1440x900 | 2026-10-13 | Review gate | Medium |
| `screenshots/workbench/e2e-08-accepted.png` | main, feature | 1440x900 | 2026-10-13 | Accepted state | Medium |
| `screenshots/workbench/e2e-09-capabilities.png` | main, feature | 1440x900 | 2026-10-13 | Capability catalog | Low-medium |
| `screenshots/workbench/e2e-10-workflow.png` | main, feature | 1440x900 | 2026-10-13 | Workflow graph | Medium |
| `screenshots/workbench/e2e-11-phone.png` | main, feature | 390x844 | 2026-10-13 | Phone layout | Low (mobile proof) |
| `screenshots/workbench/e2e-12-steering.png` | main, feature | 1440x900 | 2026-10-13 | Steering | Medium |
| `screenshots/experts/default-team-desktop.png` | feature@fdc709b | 1440x900 | 2026-10-13 (5c07743) | Default Experts roster | Medium (feature only, not on main) |
| `screenshots/experts/custom-team-active-desktop.png` | feature | 1440x900 | 2026-10-13 | Custom Team active | Medium |
| `screenshots/experts/custom-team-active-mobile.png` | feature | 360x780 | 2026-10-13 | Mobile custom team | Low |
| `screenshots/experts/team-conversation-handoff-desktop.png` | feature | 1440x900 | 2026-10-13 | Team handoff | Medium |
| `screenshots/experts-debt/assignment-usage-desktop.png` | feature | 1440x1000 | 2026-10-14 (8169975) | Assignment usage | Low |
| `screenshots/experts-debt/live-inbox-desktop.png` | feature | 1440x1000 | 2026-10-14 | Live inbox | Medium |
| `screenshots/experts-debt/schedule-receipt-desktop.png` | feature | 1440x1000 | 2026-10-14 | Schedule receipt | Medium |
| `screenshots/experts-debt/schedule-receipt-mobile.png` | feature | 360x780 | 2026-10-14 | Mobile schedule receipt | Low |
| `screenshots/containment/contained-choice-desktop.png` | feature | 440x426 | feature | Contained choice dialog (small crop) | Low |
| `screenshots/containment/contained-choice-mobile.png` | feature | 328x456 | feature | Mobile choice | Low |
| `screenshots/containment/contained-coding-result-desktop.png` | feature | 1440x900 | feature | Contained coding result | Medium |
| `screenshots/containment/no-config-desktop.png` | feature | 440x374 | feature | No-config state (small crop) | Low |
| `screenshots/concurrency/model-parallel-desktop.png` | feature@fdc709b | 1440x1000 | 2026-10-15 12:37 (fdc709b) | Experts & Teams with Builder "Running", "0 tool calls" | Medium; shows Expert status, not a parallel proof on its own |
| `screenshots/concurrency/model-parallel-mobile.png` | feature | 360x780 | 2026-10-15 | Mobile | Low |

Count: main 13 files (all `screenshots/workbench/`), feature 27 image files (13 shared workbench plus 14 feature-only). Image dates from `git log --diff-filter=A` on each path.

Hero recommendation: main `screenshots/workbench/e2e-03-contract-complete.png` (1440x900, 2026-10-13) for "intact app, governed work" shot. It is the cleanest main-branch capture. Use the feature `screenshots/experts/default-team-desktop.png` only if the landing page talks about Experts, and check its nav matches the shipped branch first.

Note: the feature `experts/` screenshots are described in `feature:docs/experts-verification.md:43-45` as UX evidence. `main` has no screenshot of a parallel run. There are no videos or gifs in either ref.

Also: main e2e screenshot generator is `main:test/E2E-workbench.test.ts:3` ("in screenshots/workbench/ as evidence").

## 6. How to run (no API key needed to start, needed to call a real model)

- Requirements: Bun 1.4+, Just, PostgreSQL 18 or pg0 (`main:README.md:64`).
- Steps (`main:README.md:68-74`): `bun install`, `just db-setup` (checksum-verified pg0, Linux x86_64/WSL), `just dev`, then open `http://127.0.0.1:3180`.
- External Postgres: `COGNATE_POSTGRES_URL=...` then `just dev` (`main:README.md:79-80`; `main:src/store.ts:20-21`).
- Data dir: `.data/` or `COGNATE_WORKBENCH_HOME` (`main:README.md:83`; `main:src/server.ts:443`).
- Model endpoint: set in Settings > Models, stored in secrets (`main:README.md:74`; `main:src/components/providerRegistry.ts:19` reads `model-provider:<id>` from secrets). Keys are never needed to start the UI. A real model call needs a provider endpoint and key. The `cognate-provider-local` package exists for offline deterministic tests (feature node_modules description) but is not in the Workbench dependency list.
- RealityTrace optional: `just setup-realitytrace` or `SXR_BIN` (`main:README.md:92-95`; `main:justfile` setup-realitytrace).
- Scripts: `dev`, `start`, `test`, `typecheck`, `verify`, `test:smoke` (`main:package.json`). Feature adds `--timeout 15000` to test (`feature:package.json`).
- Not started, per instructions.

## 7. Architecture layers and capability modules

Layers (from `main:docs/architecture.md:7-27`, "Six layers"): `.sea` semantic model, `domain/index.ts` bindings, `src/capabilities/` + `src/components/` handlers, `src/agents/` agent definitions, `src/projections/` read models, `src/ui/` React. Edges per `main:docs/architecture.md:21-27`:

```
.sea (interaction-model.sea)  --loadDomain-->  domain/index.ts (semanticRef bindings)
   --semanticRef-->  capabilities/ + components/   (validate, act, record)
   --ctx.invoke-->   agents/ (agent.coding, agent.config, agent.cognitive, [feature] agent.expert)
   --ctx.emit-->     event log  --fold-->  projections/  --readProjection-->  ui/
   ui --startRun / resolveContinuation--> agents
capabilities --> execution worlds / providers / secrets
```

Capability modules (plain labels, with declaring file and what depends on it):

| # | Module (label) | Declares / binds | Depends on |
|---|---|---|---|
| 1 | Models and providers | `main:src/components/providerRegistry.ts:3-27`; `main:src/capabilities/modelConfigure.ts`; mount `main:src/server.ts:272-300` | cognate-provider-*, secrets, runtime |
| 2 | Tools (read, edit, bash, run_code) | `main:src/capabilities/tools.ts:164-208` | execution worlds, authority, shell safety |
| 3 | Execution worlds (local, SSH, WSL) | `main:src/capabilities/executionWorlds.ts:163`; `main:src/server.ts:25,224-226` | cognate-execution (+ssh/wsl) |
| 4 | Approvals and authority | `main:src/domain/approvalGate.ts:52`; `main:src/agents/agentCoding.ts:435,527`; `main:src/capabilities/workbench.ts` (authority.check/elevate) | tools, human actor, continuations |
| 5 | Plan mode | `main:src/domain/planGate.ts`; `main:src/agents/agentCoding.ts:480`; projection `main:src/projections/plans.ts` | agent loop, approvals |
| 6 | Work: task contracts and review | `main:src/workbench/contract.ts:5,51`; `main:src/capabilities/workbench.ts:136-236`; `main:src/workbench/reducer.ts:130` | runtime events, evidence |
| 7 | Evidence and done | `main:src/workbench/ledger.ts:163-188`; `main:src/capabilities/workbench.ts:195` | work, tools (run results) |
| 8 | Workflows and automation | `main:src/capabilities/workbench.ts:279-354`; `main:src/workbench/workflow.ts`; automation records (stub, see 2c) | work |
| 9 | Skills and capability catalog (Skill OS) | `main:src/workbench/skillOs.ts`; `main:src/capabilities/workbench.ts:314-349` | runtime projections |
| 10 | History, traces, projections | `main:src/projections/sessionTrace.ts:78`; registry `main:src/server.ts:254-266` | cognate-projections, event log, Postgres (`main:src/store.ts:14-23`) |
| 11 | Observations (RealityTrace) | `main:src/observations.ts`; `main:src/server.ts:313-350` | outbox, optional SXR binary |
| 12 | Interfaces (Connect RPC + cockpit UI) | `main:src/server.ts:403-422`; `main:src/ui/App.tsx`; `main:src/ui/workbench/Workbench.tsx:33-36` | runtime service, cognate-react |
| 13 | Experts and Teams (feature only) | `feature:src/experts/service.ts:467`; `feature:src/agents/agentExpert.ts:8`; `feature:src/capabilities/expertModel.ts` | runtime, admission (`feature:src/experts/admission.ts`) |
| 14 | Schedules (feature only) | `feature:src/schedules/service.ts:100`; `feature:src/schedules/evaluator.ts:200`; `feature:src/server.ts:492` | experts, runtime |

Dependency rules stated in the repo:
- Pure domain imports nothing from capabilities/agents/projections/ui (`main:docs/architecture.md:39`).
- Capability handlers validate before acting and keep no state between invocations (`main:docs/architecture.md:40`).
- UI imports no server-only module except `src/cognitive/` value helpers (`main:docs/architecture.md:42`).
- Capabilities call other capabilities through `ctx.invoke`, e.g. `tool.edit` calls `authority.check` (`main:docs/architecture.md:114,117`).

Architecture is a logical sketch in docs. Verify the layer count against code before use in a landing page; the doc says "Six layers" but the Mermaid chart shows six nodes including UI and Agent.

## 8. Branding and styling (to avoid copying)

Source: `main:DESIGN.md` (titled "Design — Cognate Console") and `main:src/ui/app.css:14-99`.

- Palette (oklch, DESIGN.md:31-46): paper `oklch(98.5% 0.004 250)`; ink `oklch(24% 0.02 258)`; accent electric cobalt `oklch(52% 0.19 256)`; graphite (one dark band for code/tool calls) `oklch(22% 0.016 260)`; danger `oklch(52% 0.19 25)`; success `oklch(55% 0.14 152)`. Tokens in `main:src/ui/app.css` (`--cg-accent: oklch(52% 0.19 256)` line 27, `--cg-graphite` line 98).
- Dark mode: same hues, paper `oklch(16% 0.012 258)` (`main:src/ui/app.css:73-75`; `main:DESIGN.md:49-52`).
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (code and tool calls) (`main:src/ui/app.css:63-65`; `main:DESIGN.md:54-62`).
- Radius: "drawn with a ruler" tight radius; buttons 6px, no pill shape (`main:DESIGN.md:98-104`).
- Visual signature: "code is the hero", mono type for tool-call output; one dark inversion band (`main:DESIGN.md:93-94`).
- Brand voice: pointer to an external GodSpeed brand voice doc (`main:PRODUCT.md:9-10`), not in repo.

Avoid: cobalt accent on near-white paper, Inter/Space Grotesk/JetBrains Mono trio, "LOCAL BUILD" pill, and the graphite code band. The landing page should use a different palette and type system.

## 9. Unknowns

1. Main's 0.2.0 `@godspeedai/*` packages were not installed in this checkout, so main's inherited capability list is from package.json only.
2. Whether a durable-store test exists on main (no store-specific test file was matched by name). Durability claims rest on README and `main:src/store.ts`.
3. Whether `run_code`'s harness on the host runs through `process.exec` of the execution world (`main:src/capabilities/tools.ts:127-152` suggests a sandbox string executed via a subprocess). Not traced end to end.
4. Feature schedule evaluator: whether scheduled Expert runs survive a restart is covered by `test/experts-runtime-scheduling.test.ts:81` ("resumable correlated handoff") but I did not read its body.
5. Feature plugin lifecycle: no separate plugin test file was checked in feature beyond `test/workbench-plugins.test.ts`.
6. Screenshot captures: whether `screenshots/workbench/*` were regenerated after `d208cd0`. Image mtimes are not in git; only introduction commits were read.
7. The `.sea` model: capability counts in `.sea` could not be confirmed with a simple grep (no `capability` lines at line start).
8. `origin/main` and `main` agree; no drift on main.

## Proposed claims

| # | Claim | Grade | Source |
|---|---|---|---|
| 1 | Workbench is a single Bun process serving a React cockpit and Connect RPC on port 3180 | A | `main:src/server.ts:441-442`, `main:docs/architecture.md:69-82` |
| 2 | Workbench is built on Cognate SDK packages (`@godspeedai/cognate-*`) | A | `main:package.json` dependencies |
| 3 | Runtime state is stored in PostgreSQL (or bundled pg0) | A | `main:src/store.ts:14-23`, `main:README.md:15` |
| 4 | Sessions, approvals and projections survive restart | B | `main:README.md:15`; boot remount `main:src/server.ts:298-300` (README is the claim source) |
| 5 | Human approval is required for escalated `run_code` sandbox permissions | A | `main:src/domain/approvalGate.ts:52-62`, `main:src/agents/agentCoding.ts:435` |
| 6 | Human approval pauses the agent run via a durable wait | A | `main:src/agents/agentCoding.ts:527-529` |
| 7 | Plan review pauses for human approval | A | `main:src/agents/agentCoding.ts:480-482`; `test/J-E-plan.test.ts` |
| 8 | Task contracts require goal, skills, authority, acceptance before work is marked ready | B | `main:src/workbench/contract.ts:5,51`; `test/J-WB-task-contract.test.ts` |
| 9 | "The agent says it's done" is not acceptance; acceptance is recorded as evidence and review decision | B | `main:README.md` "Structure" list (Recorded evidence bullet); `main:src/capabilities/workbench.ts:195,214-236` |
| 10 | Protected-evidence checks block unsupported completion claims | B | `main:src/workbench/ledger.ts:163-188`; `test/J-WB-protected-evidence.test.ts` |
| 11 | Session traces are a public projection built from the event log | A | `main:src/projections/sessionTrace.ts:78`, `main:src/server.ts:256` |
| 12 | Model providers can be changed at runtime (OpenAI-compatible, OpenAI Responses, Anthropic-compatible) | A | `main:src/components/providerRegistry.ts:18-27`; `main:README.md` "Coding" section |
| 13 | Parallelism plans are recorded but do not start workers | A | `main:README.md:57`; `main:src/workbench/parallelism.ts:105` |
| 14 | Automation records have no background scheduler on main | A | `main:README.md:58` |
| 15 | Budgets are informational, not enforced | A | `main:README.md:59` |
| 16 | Workbench is not a sandbox; shell classification is best-effort | A | `main:docs/architecture.md:178` |
| 17 | Feature branch: Experts run in parallel only when `COGNATE_RUN_CAPACITY` > 1 | A | `feature:src/server.ts:214,282`; `feature:src/capabilities/runtimeExecution.ts:17` |
| 18 | Default Expert capacity is serial (1) | A | `feature:src/experts/admission.ts:77-81`; `feature:docs/experts-concurrency-benchmark.md` ("Default capacity remains1") |
| 19 | Only model-only Expert turns overlap; workspace-effect runs share one admission key | A | `feature:src/experts/admission.ts:5-6`; `feature:test/J-EXPERT-model-parallel.test.ts:112-136` |
| 20 | Two model-only Experts were shown to overlap at capacity 2 in tests | A | `feature:test/J-EXPERT-model-parallel.test.ts:55-76`; `feature:test/E2E-expert-model-parallel.test.ts:53-139` |
| 21 | General workspace concurrency and Team-specific capacity are still open | A | `feature:docs/experts-concurrency-benchmark.md:36-37` |
| 22 | Experts have persistent editable profiles, individual model routes and scoped memory | B | `feature:README.md:38`; `feature:src/experts/service.ts:203-213,435` |
| 23 | Private Expert memory and cross-Team memory are access-checked | A | `feature:src/experts/service.ts:206-208` |
| 24 | Native schedules execute due Expert/Team work through the runtime (not just stored) | B | `feature:src/schedules/evaluator.ts:200-216`; `feature:src/server.ts:492`; `feature:README.md:67` |
| 25 | Schedule occurrence IDs are deterministic and reserve idempotently | A | `feature:src/schedules/service.ts:100-113` |
| 26 | Experts & Teams panel is reachable from the sidebar | A | `feature:src/ui/App.tsx:4996`, `:5307` |
| 27 | Workbench cockpit has four tabs: Tasks, Workflows, Capabilities, Automations | A | `main:src/ui/workbench/Workbench.tsx:33-36` |
| 28 | The screenshot `screenshots/workbench/e2e-03-contract-complete.png` (1440x900, main, 2026-10-13) shows a complete contract with an open acceptance table | A | image read, `git log` on path |
| 29 | Local startup needs Bun 1.4+, Just, and PostgreSQL or pg0; no model key needed to open the UI | B | `main:README.md:64-74`; key needed only at `main:src/components/providerRegistry.ts:19` |
| 30 | Workbench uses Space Grotesk, Inter and JetBrains Mono on an electric-cobalt accent | A | `main:src/ui/app.css:27,63-65`; `main:DESIGN.md:31-62` |
| 31 | Workbench has 23 workbench capabilities and 12 projections registered at boot | A | `main:src/capabilities/workbench.ts:39-63`; `main:src/server.ts:254-266` |
| 32 | Main has 73 test files; feature has 105 | A | `git ls-tree -r <ref> -- test` counts |
| 33 | Feature adds 146 changed files over main (+14463/-276) | A | `git diff --stat main..feature/expert-teams` |
| 34 | Workbench consumes Cognate 0.2.0 on main and 0.5.0 on feature | A | `main:package.json`, `feature:package.json` |
| 35 | Architecture is documented as six layers, with strict dependency direction | B | `main:docs/architecture.md:7-27,39-42` |

## Command log (read-only)

- `git rev-parse` for main, feature, origin/feature, origin/main
- `git status --short` (clean)
- `git rev-list --left-right --count origin/feature/expert-teams...feature/expert-teams` = `0 1`
- `gh api repos/GodSpeedAI/Cognate-Workbench/branches --jq ...` (read-only)
- `git show <ref>:<path>`, `git ls-tree -r <ref>`, `git grep <ref> -- <paths>`, `git diff --name-status`, `git log --diff-filter=A`
- PNG dimension reads from extracted screenshot bytes in the scratchpad
