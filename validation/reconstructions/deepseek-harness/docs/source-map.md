# Source map

Concepts, capabilities, workflows, and subsystems mapped to their principal implementation locations.
Prefer meaningful relationships over a directory listing — for the shape of each file, read the
subsystem page.

All paths are relative to the repository root at `validation/reconstructions/deepseek-harness/`.

## The app, in dependency order

```
cognate/.sea/interaction/interaction-model.sea     semantic source, read at boot
        │  domain/index.ts — loadDomain + bindTranche*
        ▼
cognate/src/server.ts                               composition root: policy, mounts, routes
        ├── src/agents/agentConfig.ts               pure emitter for operator actions
        ├── src/agents/agentCoding.ts               one run per turn; the tool loop
        ├── src/capabilities/*.ts                   14 capability components
        ├── src/projections/*.ts                    7 public folds
        ├── src/components/modelProvider.ts         streaming model.generate
        ├── src/components/providerRegistry.ts      hot-swap
        ├── src/secrets.ts                          write-only credential file
        └── src/ui/App.tsx + app.css + icons.tsx + markdown.ts
```

Nothing below points upward. `src/domain/*.ts` and `src/projections/*.ts` are I/O-free; agents reach
capabilities only through `ctx.invoke`; the UI reaches the store only through projections.

## Subsystems

| Subsystem | Entry point | Supporting files | Test |
|---|---|---|---|
| Server runtime | `cognate/src/server.ts` — `startServer` | `cognate/test/helpers.ts` | every journey test |
| `agent.coding` | `cognate/src/agents/agentCoding.ts` — `agentCodingAgent` | `cognate/src/domain/approvalGate.ts`, `planGate.ts` | `J-B`, `J-C`, `J-D`, `J-E`, `J-F`, `J-H`×2 |
| Capabilities | `cognate/src/capabilities/*.ts` | `cognate/src/secrets.ts` | `J-CFG`, `J-WS`, `J-C`, `J-I` |
| Projections | `cognate/src/projections/*.ts` | registered in `cognate/src/server.ts` | `J-B`, `J-G`, `J-I`, `event-history-authoritative` |
| Model provider and secrets | `cognate/src/components/providerRegistry.ts` | `modelProvider.ts`, `secrets.ts` | `J-CFG` |
| Domain model | `cognate/domain/index.ts` | `cognate/.sea/interaction/*` | boot-time; `domainforge-realitytrace-unchanged` |
| Web UI | `cognate/src/ui/App.tsx` — `App` | `app.css`, `icons.tsx`, `markdown.ts` | the Playwright journeys |
| Validation harness | `tests/drivers/types.ts` — `Driver` | `tests/journeys/`, `tests/capture/`, `tests/visual/`, `tests/architecture/`, `fixtures/` | its own |

## Capabilities → implementation

| Capability | Component factory | Handler | Mounted |
|---|---|---|---|
| `model.generate` | `streamingProviderComponent` — `src/components/modelProvider.ts:11` | same file, `fiber.provide` | `ProviderRegistry.swap` → `runtime.kernel.mount` |
| `model.configure` | `modelConfigureComponent` — `src/capabilities/modelConfigure.ts:23` | `:34-47` | `server.ts:196-198` |
| `secret.put` | `secretPutComponent` — `src/capabilities/secretPut.ts:14` | `:19-25` | `server.ts:160` |
| `workspace.select` | `workspaceSelectComponent` — `src/capabilities/workspaceSelect.ts:20` | `:30-47` | `server.ts:188-195` |
| `workspace.path` | `workspacePathComponent` — `src/capabilities/workspacePath.ts:14` | `:19-28` | `server.ts:162` |
| `session.history` | `sessionHistoryComponent` — `src/capabilities/sessionHistory.ts:23` | `:40-64` | `server.ts:161` |
| `tool.read` / `edit` / `bash` / `run_code` | `toolCapabilitiesComponent` — `src/capabilities/tools.ts:173` | `:179-221` | `server.ts:163` |
| `plan.state` | `planStateComponent` — `src/capabilities/planState.ts:15` | `:20-28` | `server.ts:164` |
| `subagent.start` | `subagentStartComponent` — `src/capabilities/subagentStart.ts:26` | `:35-48` | `server.ts:165` |
| `onboarding.dismiss` | `onboardingDismissComponent` — `src/capabilities/onboardingDismiss.ts:19` | `:28-38` | `server.ts:166` |
| `settings.changeWorkDetails` | `settingsChangeWorkDetailsComponent` — `src/capabilities/settingsChange.ts:18` | `:27-39` | `server.ts:167` |

## Agents

| Agent | Definition | Runs it starts | Events it emits |
|---|---|---|---|
| `agent.coding` | `cognate/src/agents/agentCoding.ts:249-383` | — (started by the UI and by `subagent.start`) | `session.turn.started`, `message.completed`, `turn.failed`, `model.request.retried`, `tool.call.*`, `tool.approval.*`, `plan.*`, `subagent.spawned` |
| `agent.config` | `cognate/src/agents/agentConfig.ts:18-56` | — | `model.configured`, `workspace.added`, `workspace.selected`, `onboarding.dismissed`, `settings.changed` |

## Pure domain functions

| Function | File | Decides |
|---|---|---|
| `approvalGate` | `src/domain/approvalGate.ts:52-60` | whether a `run_code` escalation needs a human |
| `approvalDeniedToolResult` | `src/domain/approvalGate.ts:66-68` | the exact denial text |
| `PERMISSION_RANK`, `rank`, `normalize` | `src/domain/approvalGate.ts:35-43` | ordering, with `+Infinity` for unknowns (fail-closed) |
| `isPlanOffCommand`, `splitPlanPrefix` | `src/domain/planGate.ts:11-22` | plan-mode control commands |
| `extractPlanHeading` | `src/domain/planGate.ts:27-32` | the review card's title |
| `PLAN_APPROVED_TOOL_RESULT`, `EXIT_PLAN_MODE_NOT_IN_PLAN_MODE`, `planRequestChangesToolResult` | `src/domain/planGate.ts:37-52` | the exact plan reflection strings |
| `isWorkDetailsMode`, `showsLiveProcessDetail` | `src/workDetails.ts:19-35` | the four modes and the live-detail gate |
| `resolveInWorkspace` | `src/capabilities/tools.ts:21-28` | path containment |
| `workspaceIdFor` | `src/capabilities/workspaceSelect.ts:16-18` | the stable workspace id |
| `titleFrom` | `src/projections/sessions.ts:17-20` | the 80-char session title |
| `sessionIdFromCorrelation` | `src/projections/sessions.ts:24-26` | recovering a session from a lifecycle event |
| `parseSubagentCorrelation` | `src/projections/subagents.ts:46-52` | splitting `subagent:<run>:<call>` |
| `classifyModelFailure` | `src/agents/agentCoding.ts:57-74` | the failure code and message |
| `diffLines`, `countOccurrences` | `src/capabilities/tools.ts:83-119` | the edit diff and uniqueness check |
| `diffHunk` | `src/ui/App.tsx:1439-1468` | review-panel gutter numbers from `diffLines` |
| `renderMarkdown` | `src/ui/markdown.ts:16-72` | the minimal markdown subset |

## Events → producers and consumers

| Event | Produced by | Folded by | Read by |
|---|---|---|---|
| `session.turn.started` | `agent.coding` | `sessions` | the UI sidebar |
| `message.completed` | `agent.coding` | `sessions`; `subagents` (child correlation only) | `session.history`, the UI stream |
| `turn.failed` | `agent.coding` | — | the UI failure block |
| `model.request.retried` | `agent.coding` | — | the UI retry disclosure |
| `tool.call.started` | `agent.coding` | — | `useToolTimeline` |
| `tool.call.completed` | `agent.coding` | — | `useToolTimeline`, the diff card, the review panel |
| `tool.call.failed` | `agent.coding` | — | `useToolTimeline` |
| `tool.approval.requested` | `agent.coding` | `sessions` (`mode: "ptc"`) | `useToolTimeline` |
| `tool.approval.decided` | `agent.coding` | — | `useToolTimeline` |
| `plan.mode.changed` | `agent.coding` | `plans` | `plan.state`, the UI composer |
| `plan.todos.updated` | `agent.coding` | `plans` | the to-do widget |
| `plan.review.requested` | `agent.coding` | `plans` | `usePlanReviewPendingSessions` |
| `plan.review.decided` | `agent.coding` | `plans` | the review card |
| `subagent.spawned` | `agent.coding` | `subagents` | the banner, the tree, `session.history` |
| `model.configured` | `agent.config` | `model-config` | `server.ts` boot, the UI |
| `workspace.added` / `workspace.selected` | `agent.config` | `workspaces` | `server.ts`, `workspace.path`, the UI |
| `onboarding.dismissed` | `agent.config` | `onboarding` | `useOnboardingDismissed` |
| `settings.changed` | `agent.config` | `settings` | `useWorkDetails` |
| `run.invocation` | the runtime | — | replay, the audit trail |
| `run.invocation.progress` | the runtime (from `ctx.progress`) | — | `useStreamingTurn` |
| `run.waiting` / `run.cancelled` / `run.failed` | the runtime | `sessions`; `subagents` (failed) | the UI, `openSession`'s reattach |

## Continuations

| Type | Created at | Resolved from | Read by |
|---|---|---|---|
| `tool-approval` | `src/agents/agentCoding.ts:361-365` | `ApprovalBar` — `src/ui/App.tsx:1190-1233` | `decideApproval`, `App.tsx:1913-1922` |
| `plan-review` | `src/agents/agentCoding.ts:315-319` | `PlanReviewCard` — `src/ui/App.tsx:1325-1397` | `decidePlanReview`, `App.tsx:1944-1952` |

## Tools → definitions, handlers, labels

| Tool | Definition | Handler | UI label |
|---|---|---|---|
| `read` | `agentCoding.ts:112-116` | `tools.ts:179-184` | `toolActionLabel` — `App.tsx:1108` |
| `edit` | `agentCoding.ts:117-130` | `tools.ts:186-201` | `App.tsx:1109` |
| `bash` | `agentCoding.ts:131-136` | `tools.ts:203-211` | `App.tsx:1110` |
| `todo_write` | `agentCoding.ts:137-153` | inline — `agentCoding.ts:300-306` | `App.tsx:1115` |
| `exit_plan_mode` | `agentCoding.ts:154-158` | inline — `agentCoding.ts:307-330` | `App.tsx:1116` |
| `subagent` | `agentCoding.ts:159-171` | inline — `agentCoding.ts:331-350` | `App.tsx:1117` |
| `run_code` | `agentCoding.ts:172-185` | `tools.ts:213-221` | `App.tsx:1112` |

`TOOL_DEFS` is `agentCoding.ts:111-186`; `formatToolResult` is `:193-210`; `invokeTool` (with the
read-before-edit guard) is `:212-247`.

## UI components

| Component | File:line | Owns |
|---|---|---|
| `App` | `src/ui/App.tsx:1891-2300` | the composition and every flow |
| `useStreamingTurn` | `:962-1027` | streaming text, retries, failure, cancellation |
| `useToolTimeline` | `:1043-1093` | the ordered tool entries |
| `openSession` | `:1976-1996` | reattach, transcript load, session memory |
| `send` / `stop` | `:2041-2073` | starting and cancelling a turn |
| the finalisation effect | `:2080-2121` | completed / cancelled / failed assistant rows |
| `SettingsModels` | `:488-961` | the two-tab provider wizard, Appearance, Work details |
| `WorkspaceChooser` | `:406-454` | the no-workspace state |
| `FirstRunNotice` / `FirstRunApiKey` / `FirstRunDialogs` | `:321-404` | the first-run pair |
| `ApprovalBar` | `:1190-1233` | the allow/deny card |
| `PlanReviewCard` | `:1325-1397` | the plan review card |
| `TodoWidget` | `:1235-1262` | the to-do list |
| `SubagentTree` / `RightPanel` | `:1263-1324` | the disclosure and the child transcript |
| `ReviewPanel` / `EditDiff` / `diffHunk` | `:1398-1581` | the split diff |
| `ToolActivity` / `RetryDisclosure` / `FailureBlock` | `:1120-1189` | the in-flight row, the retry list, the failure block |
| `Composer` / `MessageBubble` / `HeroLanding` | `:1626-1890` | the composer, a turn, the empty state |
| `useTheme` / `useModalFocus` | `:262-320` | theme persistence, the modal contract |
| `useProjection` wrappers | `:133-241` | the nine named reads |
| the design tokens | `src/ui/app.css:11-60` | the enforced token layer |

## Domain model

| Concern | Location |
|---|---|
| the model | `cognate/.sea/interaction/interaction-model.sea` |
| entities / resources / flows | `:6-32`, `:34-54`, `:60-86` |
| the ten journey instances | `:88-216` |
| the load and digest | `cognate/domain/index.ts:22-34` |
| bindings T5 / T7 / T9 / T10 | `cognate/domain/index.ts:41-49`, `:70-78`, `:101-103`, `:117-119` |
| count assertions | `cognate/domain/index.ts:53`, `:82`, `:107`, `:123` |
| journey definitions | `cognate/.sea/interaction/canonical-journey-catalog.md` |
| projection guidance | `cognate/.sea/interaction/handoff.md` |
| the binding narrative | `cognate/BINDINGS.md` |

## Tests

| Suite | Files | Establishes |
|---|---|---|
| app journey tests | `cognate/test/J-*.test.ts` (11 files, 21 tests) | behaviour, strings, real effects, restarts |
| app test helpers | `cognate/test/helpers.ts` | `withTempHome`, `bootApp`, `bootMockModel` |
| architectural criteria | `tests/architecture/*.test.ts` (8 files) + `reference-removed.sh` | independence from the reference |
| journey specs | `tests/journeys/[A-H]-*.spec.ts` (8 files, 11 cases) | the same journeys through a browser |
| journey plumbing | `tests/journeys/harness.ts`, `run.ts` | isolation, system selection, flake classification |
| driver contract | `tests/drivers/types.ts`, `cognate.ts`, `reference.ts` | one interface, two systems, two cited divergences |
| capture | `tests/capture/cognate.capture.ts`, `reference.capture*.ts` | 28 checkpoints × 2 viewports |
| compare | `tests/visual/compare.ts` | triptychs and percentages — evidence, not a gate |
| mock model | `fixtures/mock-model/server.ts` | 12 deterministic scenarios, `__reset`, `__abort-count` |
| fixture workspace | `fixtures/workspace/make-workspace.ts` + `template/` | a deterministic project with `src/greet.ts` |

## Evidence and history

| Question | File |
|---|---|
| What does the reference actually do? | `reference-behavior-matrix.md` |
| Which commit, how was it launched, what auth? | `reference-manifest.json` |
| Were the architectural criteria met? | `architecture-evidence.md` |
| Does every feature map to existing primitives? | `primitive-provenance.md` |
| What was the settlement status? | `parity-report.md` (+ `.json`) |
| What did the reviewers find? | `critic/round-1*.md` … `round-7*.md` |
| Where does the app deliberately differ? | `cognate/DEVIATIONS.md` |
| What is the product? | `cognate/PRODUCT.md` |
| What is the visual system? | `cognate/DESIGN.md` |
| What did the last journey run produce? | `tests/journeys/results/summary.md` |
| What did the last diff run produce? | `diffs/summary.md` |
| What are the accessible names? | `cognate/observations/aria/`, `reference/observations/aria/` |

## Documentation

| Page | Owns |
|---|---|
| [documentation-map.md](documentation-map.md) | which page owns which concept |
| [architecture.md](architecture.md) | the canonical high-level model |
| [concepts/glossary.md](concepts/glossary.md) | every term, and what it is not |
| [concepts/mental-model.md](concepts/mental-model.md) | the conceptual structure |
| [subsystems/](subsystems/) | one page per subsystem, with source trails |
| [workflows/](workflows/) | one page per end-to-end path, with sequences |
| [explanation/](explanation/) | why the design is what it is |
| [tutorials/](tutorials/), [how-to/](how-to/) | doing something |
| [reference/](reference/) | exact contracts |
| [operations/](operations/) | running and debugging |
