# Capability reference

The 14 published capability ids. All are version `1.0.0`. Twelve are bound to an IDM entity; two are
deliberately unbound.

**How to read this:** the *invoker* column matters. `agent` means the agent calls it through
`ctx.invoke` and the call is recorded as a `run.invocation` event. `browser` means the browser calls
it through `client.invoke`, which the runtime does **not** record — that difference is exactly what
keeps the API key out of the durable log.

## Summary table

| Capability | Invoker | Bound to | Result | Source |
|---|---|---|---|---|
| `model.generate` | agent | `ModelProvider` | `ModelResponse` | `src/components/modelProvider.ts` |
| `model.configure` | browser | `ModelProvider` | `{ok, providerId}` | `src/capabilities/modelConfigure.ts` |
| `secret.put` | browser | `ModelProvider` | `{ok, key}` | `src/capabilities/secretPut.ts` |
| `workspace.select` | browser | `WorkspaceRecord` | `{ok, workspaceId, path}` | `src/capabilities/workspaceSelect.ts` |
| `workspace.path` | agent | `WorkspaceRecord` | `{path}` | `src/capabilities/workspacePath.ts` |
| `session.history` | agent **and** browser | `Session` | `ModelMessage[]` | `src/capabilities/sessionHistory.ts` |
| `tool.read` | agent | `Tool` | `{file_path, content}` | `src/capabilities/tools.ts` |
| `tool.edit` | agent | `Tool` | `{file_path, replacements, diffLines, additions, deletions}` | `src/capabilities/tools.ts` |
| `tool.bash` | agent | `Tool` | `{command, exitCode, stdout, stderr, timedOut}` | `src/capabilities/tools.ts` |
| `tool.run_code` | agent (approval-gated) | `Tool` | `{exitCode, stdout, stderr, timedOut}` | `src/capabilities/tools.ts` |
| `plan.state` | agent | `PlanMode` | `PlanState` | `src/capabilities/planState.ts` |
| `subagent.start` | agent | `Subagent` | `{runId}` | `src/capabilities/subagentStart.ts` |
| `onboarding.dismiss` | browser | **unbound** | `{ok}` | `src/capabilities/onboardingDismiss.ts` |
| `settings.changeWorkDetails` | browser | **unbound** | `{ok}` | `src/capabilities/settingsChange.ts` |

Policy: all 14 are in `GRANTED_CAPABILITIES` and allowed to `user` and `system` actors
(`src/server.ts:55-70`). Nothing else is reachable.

## `model.generate`

| | |
|---|---|
| Input | `{messages: ModelMessage[], tools: ToolDefinition[]}` |
| Output | `ModelResponse` — `{message: {role, content}, toolCalls: ToolCall[], finishReason, model}` |
| Side effects | An HTTP request to the provider. Streaming deltas become `run.invocation.progress` events. |
| Errors | whatever the provider throws, wrapped as `InvocationFailedError` with `failure.details` carrying `kind`/`status` |
| Notes | The only streaming capability. Falls back to `provider.generate` when the provider does not advertise `features.stream` or when `ctx.progress` is absent. Returns a synthesised response if the stream ends without a `done` delta. |
| Not a capability | The provider's *identity* — see the `model-config` projection. `model.generate` is remounted on every configuration change. |

## `model.configure`

| | |
|---|---|
| Input | `{providerId, baseURL, protocol, model, apiKey}` |
| Required | `providerId`, `baseURL`, `model`. Otherwise `model.configure: providerId, baseURL, and model are required`. |
| Output | `{ok: true, providerId}` |
| Side effects, in order | 1. `secrets.put("model-provider:<providerId>", apiKey ?? "")` — 0600 file, never recorded. 2. `registry.swap(config, secrets)` — mount the new provider, wait ≤5s for `ACTIVE`, dispose the previous. 3. `startRun(SYSTEM_CALLER, agent.config, {kind: "model.configured", …non-secret})` |
| Errors | the required-field throw; anything the registry or the run start throws |
| Notes | `apiKey` is write-only: never echoed, never returned, never projected. Re-invoking with a new key replaces it. |

## `secret.put`

| | |
|---|---|
| Input | `{key, value}` |
| Errors | `secret.put: key and value are required` |
| Output | `{ok: true, key}` — confirmation only, never the value |
| Side effects | Writes `$COGNATE_HARNESS_HOME/secrets.json` (mode 0600, chmod'ed on every write) |
| Constraint | **Never invoke from inside an agent's `run()`.** That would put the value in a `run.invocation` payload. Only `model.configure` calls it. |

## `workspace.select`

| | |
|---|---|
| Input | `{path}` |
| Errors | `path is required`; `not a directory: <canonical path>` |
| Output | `{ok: true, workspaceId, path}` — `path` is the resolved canonical form |
| Identity | `workspaceId = sha256(resolve(path)).slice(0, 16)` hex. Same directory ⇒ same id. |
| Side effects | New id ⇒ an `agent.config` run with `{kind: "workspace.added", workspaceId, path, title}` (the last path segment), which emits `workspace.added` **then** `workspace.selected`. Known id ⇒ `{kind: "workspace.selected"}` only. |
| Note | "New vs known" is decided by an in-memory `Set` seeded from the `workspaces` projection on boot and kept current by a live event follower. |

## `workspace.path`

| | |
|---|---|
| Input | `{workspaceId}` |
| Output | `{path}` |
| Errors | `workspace.path: unknown workspaceId <id>` |
| Side effects | none — reads the `workspaces` projection, row `record/<id>` |
| Note | Read-only. Invoked once per turn through `ctx.invoke` so the resolution is recorded and replayable. |

## `session.history`

| | |
|---|---|
| Input | `{sessionId, excludeRunId?}` |
| Output | `ModelMessage[]`, plus a non-model field `stepCount` on synthesized assistant messages |
| Errors | none expected; a projection read failure propagates |
| Fold | For each run in correlation `session:<sessionId>`, skipping `excludeRunId` and any run whose agent is not `agent.coding`: push `{role:"user", content: run.input.message}` **unconditionally**; if `status === "completed"` and `output.text` is a string, push `{role:"assistant", content, stepCount: (count of that run's tool.call.started events) + 1}`; then for each **completed** child subagent of that run, push `{role:"user", content: 'Subagent "<title>" completed: <output>'}`. |
| Consequence | A cancelled or failed turn contributes only its user message. A run that is still `running` contributes only its user message. |
| Invokers | The agent (with `excludeRunId` = itself) and the browser (without, so the just-finished turn is included). |

## `tool.read`

| | |
|---|---|
| Input | `{workspaceRoot, file_path}` |
| Output | `{file_path, content}` — `file_path` is echoed as given, not the resolved path |
| Errors | `PathEscapeError` (`path escapes workspace root: <p>`); a `readFile` failure for a missing file |
| Constraint | `resolveInWorkspace` is mandatory. A missing file throws rather than returning empty. |

## `tool.edit`

| | |
|---|---|
| Input | `{workspaceRoot, file_path, old_string, new_string, replace_all?}` |
| Output | `{file_path, replacements, diffLines, additions, deletions}` |
| Errors | `PathEscapeError`; `tool.edit: old_string not found in <f>`; `tool.edit: old_string is not unique in <f> (N matches) — provide more context or set replace_all` |
| Semantics | Exact substring replacement. Zero matches throws. More than one match requires `replace_all`. `replacements` is the occurrence count when `replace_all`, else 1. |
| `diffLines` | A common-prefix/suffix **line** diff: ` ` unchanged, `-` removed, `+` added. Not a general diff algorithm. The UI's collapsed/expanded diff card and the split review panel both render from it. |
| Guard | The read-before-edit check lives in the **agent**, not here, so that a denial is reported as a tool failure with `fs_not_observed` rather than a capability exception. |

## `tool.bash`

| | |
|---|---|
| Input | `{workspaceRoot, command, description?, timeoutMs?}` |
| Output | `{command, exitCode, stdout, stderr, timedOut}` |
| Execution | `Bun.spawn(["bash","-lc",command], {cwd: resolve(workspaceRoot), stdout:"pipe", stderr:"pipe"})` |
| Bounds | `timeoutMs ?? 30000`, kill on expiry; each stream capped at 20,000 chars with `…(truncated)` |
| Constraint | `cwd` containment only. The command may reference absolute paths — see [../explanation/security-and-trust.md](../explanation/security-and-trust.md). |
| Note | Never approval-gated: in the reference, escalation lives on `run_code`, not `bash`. |

## `tool.run_code`

| | |
|---|---|
| Input | `{workspaceRoot, code, description?, sandbox_permissions?, justification?, timeoutMs?}` |
| Output | `{exitCode, stdout, stderr, timedOut}` |
| Execution | `Bun.spawn(["bun","-e", harness], {cwd: resolve(workspaceRoot), …})`, same bounds as `bash` |
| Harness | An original small wrapper that defines a single `tools.bash({command})` and runs the snippet in an async IIFE, setting `process.exitCode = 1` on a throw. **Not** a reproduction of the reference's sandbox. |
| Gate | The only approval-gated tool. `sandbox_permissions` is never enforced as a capability argument — it is only read by `approvalGate` to decide whether to ask. |

## `plan.state`

| | |
|---|---|
| Input | `{sessionId}` |
| Output | `PlanState` = `{sessionId, on, todos, review?}` |
| Missing row | `{sessionId, on: false, todos: []}` |
| Side effects | none — reads the `plans` projection |
| Note | Read-only. Plan-mode *changes* are events emitted by `agent.coding`; there is no setter. |

## `subagent.start`

| | |
|---|---|
| Input | `{agent, input, key}` where `key` is `` `${parentRunId}:${toolCallId}` `` |
| Output | `{runId}` |
| Side effects | `startRun(SYSTEM_CALLER-ish, {agent, input, idempotencyKey: key, correlationId: "subagent:<parentRunId>:<id>"})` |
| Errors | whatever `startRun` throws |
| Why it is this app's own | The packaged `@cognate/profile-harness` `subagent.start` sets no correlation, so a child would not be distinguishable from a session run; and `spawnSubagent` depends on a resolver captured in `createHarness`'s closure. Recorded as framework finding F2. |
| Durability | The idempotency key is what makes a replayed delegation return the same child instead of spawning a second. |

## `onboarding.dismiss`

| | |
|---|---|
| Input | `{step}` — `"notice"` or `"apikey"` |
| Errors | `onboarding.dismiss: step must be 'notice' or 'apikey'` |
| Output | `{ok: true}` |
| Side effects | An `agent.config` run emitting `onboarding.dismissed {step}` |
| Binding | **None.** No `semanticRef` is passed. |

## `settings.changeWorkDetails`

| | |
|---|---|
| Input | `{workDetails}` — one of `compact`, `standard`, `detailed`, `verbose` |
| Errors | `settings.changeWorkDetails: workDetails must be one of compact, standard, detailed, verbose` |
| Output | `{ok: true}` |
| Side effects | An `agent.config` run emitting `settings.changed {workDetails}` |
| Effect | Presentation only: which tool-call detail renders, and whether the running-tool label shows its `· <detail>` suffix (`showsLiveProcessDetail` is true for `standard`/`detailed` only). No behavioural effect on the agent. |
| Binding | **None.** |

## Things that look like capabilities and are not

| Thing | What it actually is |
|---|---|
| `approvalGate` | A pure function in `src/domain/approvalGate.ts`. Not invokable. |
| `planGate` helpers | Pure functions in `src/domain/planGate.ts`. Not invokable. |
| `agent.coding`, `agent.config` | `AgentDefinition`s. An agent id is not a `CapabilityContract`. |
| The `subagent` tool | Orchestration inside `agent.coding`; only `subagent.start` is a capability. |
| The `todo_write` and `exit_plan_mode` tools | Inline handlers in `agent.coding`; they emit events and open a continuation. |
| Plan-mode on/off | Events, not a capability. |
| Theme | `localStorage` in the browser. No capability, no event, no projection. |

## Related

- [events.md](events.md) — what these produce
- [tools.md](tools.md) — how the model reaches them
- [../subsystems/capabilities.md](../subsystems/capabilities.md) — the shared shape and the two invocation paths
- [../subsystems/domain-model.md](../subsystems/domain-model.md) — the binding table
- [../explanation/gates-and-continuations.md](../explanation/gates-and-continuations.md) — why the gates are not capabilities
- `cognate/BINDINGS.md` — the narrative of the bindings
