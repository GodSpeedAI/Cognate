# Capability bindings (T5, extended T7, T9)

Per `idm-to-cognate.md`: `bindCapabilities` is the only path from a `SemanticObject` to a
`CapabilityContract`, and it is 100% explicit. This file lists every binding this app makes — no
more, no fewer (see `.sea/interaction/handoff.md` "What downstream agents should NOT do": don't
bind speculatively).

All bindings live in `domain/index.ts` (`tranche5Bindings`), against
`.sea/interaction/interaction-model.sea` (namespace `deepseek-harness.interaction`, 51 semantic
objects, digest logged at startup).

| # | Semantic id | Capability | Published by | Why |
|---|---|---|---|---|
| 1 | `deepseek-harness.interaction::ModelProvider` | `model.generate` v1.0.0 | `streamingProviderComponent` (`src/components/modelProvider.ts`), mounted/hot-swapped by `ProviderRegistry` (`src/components/providerRegistry.ts`) | The live model route is exactly the IDM's `ModelProvider` entity made executable. |
| 2 | `deepseek-harness.interaction::ModelProvider` | `secret.put` v1.0.0 | `secretPutComponent` (`src/capabilities/secretPut.ts`) | The credential a `ModelProvider` needs; kept on the same semantic anchor since it has no separate `.sea` entity of its own. |
| 3 | `deepseek-harness.interaction::ModelProvider` | `model.configure` v1.0.0 | `modelConfigureComponent` (`src/capabilities/modelConfigure.ts`) | The orchestration capability the UI's Settings → Models "Save" invokes: writes the secret, hot-swaps the provider, and starts the durable `agent.config` run. |
| 4 | `deepseek-harness.interaction::WorkspaceRecord` | `workspace.select` v1.0.0 | `workspaceSelectComponent` (`src/capabilities/workspaceSelect.ts`) | Validates a directory and durably records `workspace.added`/`workspace.selected` — the `WorkspaceRecord` entity's only producer. |
| 5 | `deepseek-harness.interaction::Session` | `session.history` v1.0.0 | `sessionHistoryComponent` (`src/capabilities/sessionHistory.ts`) | Folds a `Session`'s prior turns into model messages — the "History" row of the architecture table. |
| 6 | `deepseek-harness.interaction::Tool` | `tool.read` v1.0.0 | `toolCapabilitiesComponent` (`src/capabilities/tools.ts`) | Reads a file inside the session's workspace. Path-contained (`resolveInWorkspace`, rejects any escape). |
| 7 | `deepseek-harness.interaction::Tool` | `tool.edit` v1.0.0 | `toolCapabilitiesComponent` (`src/capabilities/tools.ts`) | Exact `old_string`/`new_string` replace (unique match required unless `replace_all`); path-contained. |
| 8 | `deepseek-harness.interaction::Tool` | `tool.bash` v1.0.0 | `toolCapabilitiesComponent` (`src/capabilities/tools.ts`) | Runs a shell command as a Bun subprocess, `cwd` = workspace root, timeout + output caps. |
| 9 | `deepseek-harness.interaction::Tool` | `tool.run_code` v1.0.0 | `toolCapabilitiesComponent` (`src/capabilities/tools.ts`) | Runs a code snippet (original small `tools.bash`-providing harness, not copied from the reference) as a Bun subprocess; the tool a `sandbox_permissions` escalation request rides on — see `approvalGate.ts`. |
| 10 | `deepseek-harness.interaction::WorkspaceRecord` | `workspace.path` v1.0.0 | `workspacePathComponent` (`src/capabilities/workspacePath.ts`) | Resolves a `workspaceId` to its canonical path for the tool loop (`agent.coding`'s `ctx.invoke("workspace.path", ...)`). |
| 11 | `deepseek-harness.interaction::PlanMode` | `plan.state` v1.0.0 | `planStateComponent` (`src/capabilities/planState.ts`) | Resolves a `sessionId` to its current plan-mode/todos/review state (the `plans` projection) — `agent.coding`'s per-turn read of whether the session is genuinely in plan mode. |

`tranche7Bindings`/`bindTranche7` (`domain/index.ts`) bind #6-10, alongside `tranche5Bindings` above.
`tranche9Bindings`/`bindTranche9` (`domain/index.ts`) bind #11.

## Not bound (deliberately)

- `agent.config` and `agent.coding` are `AgentDefinition`s, not capabilities — an agent id is not a
  `CapabilityContract`, so `bindCapabilities` does not apply to them. Their runs still carry
  `semanticRef` transitively: `agent.coding`'s `ctx.invoke("model.generate", ...)`,
  `ctx.invoke("session.history", ...)`, `ctx.invoke("workspace.path", ...)` and
  `ctx.invoke("tool.<name>", ...)` calls record the bound contracts' `semanticRef` in
  `run.invocation` events (traceability rule #2).
- **`ApprovalGate`** — deliberately realized as a pure decision function (`approvalGate` in
  `src/domain/approvalGate.ts`, named after this `.sea` entity) plus a `ctx.waitFor` continuation
  inside `agent.coding`, not as a `CapabilityContract`. An approval gate is a policy decision over an
  already-invoked tool call's arguments, not itself an invokable capability — there is nothing for a
  `Component` to `provide`. `j_d_approval`'s `Flow "ApprovalDecision" from "ApprovalAuthority" to
  "ApprovalGate"` is realized as the `tool-approval` continuation's resume input (`{ approved:
  boolean }`), resolved via `client.resolveContinuation`/`RuntimeService.resolveContinuation` — see
  `README.md` "Tool loop and approvals (T7-T8)".
- `Subagent`, `Goal`, `ChildAgent`, `ApprovalAuthority`, `Composer`, `OperatorAgent`, `User` — real
  `.sea` entities with no bound capability yet; they belong to later tranches (T10-T11) and are
  intentionally left unbound until this app actually publishes something for them.
- `PlanMode`'s plan-mode-on/off and todos/review state (T9) is realized the same way as
  `ApprovalGate`: app events (`plan.mode.changed`, `plan.todos.updated`, `plan.review.requested`,
  `plan.review.decided`) emitted directly by `agent.coding`, not a `CapabilityContract` a UI action
  invokes — the only bound capability is the read side, `plan.state` (#11 above). `exit_plan_mode`'s
  review is a `ctx.waitFor("plan-review:<toolCallId>", ...)` durable continuation, the same pattern
  as `tool-approval` but a distinct `type` (different payload/outcome shape — a plan heading/markdown
  to review, not a permission to allow/deny). See `src/domain/planGate.ts` and README.md.
