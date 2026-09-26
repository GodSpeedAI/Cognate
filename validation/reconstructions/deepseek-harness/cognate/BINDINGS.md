# Capability bindings (T5)

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

## Not bound (deliberately)

- `agent.config` and `agent.coding` are `AgentDefinition`s, not capabilities — an agent id is not a
  `CapabilityContract`, so `bindCapabilities` does not apply to them. Their runs still carry
  `semanticRef` transitively: `agent.coding`'s `ctx.invoke("model.generate", ...)` and
  `ctx.invoke("session.history", ...)` calls record the bound contracts' `semanticRef` in
  `run.invocation` events (traceability rule #2).
- `Tool`, `ApprovalGate`, `PlanMode`, `Subagent`, `Goal`, `ChildAgent`, `ApprovalAuthority`,
  `Composer`, `OperatorAgent`, `User` — real `.sea` entities with no bound capability yet; they
  belong to later tranches (T7–T11) and are intentionally left unbound until this app actually
  publishes something for them.
