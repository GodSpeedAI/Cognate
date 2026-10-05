# Subsystem: capabilities

Every leaf I/O operation in the app is a capability: a named, versioned contract published by a
component and invoked either by an agent (`ctx.invoke`, recorded) or by the browser
(`client.invoke`, not recorded). This page covers the shared shape and then the individual
capabilities; the exact input/output contract for each is in
[../reference/capabilities.md](../reference/capabilities.md).

## Purpose

Give the agent and the UI a small, explicit, authorized set of things they can do — and nothing else.

## Responsibilities

- Perform the actual I/O: filesystem, subprocess, provider HTTP, projections reads, run starts.
- Validate their own inputs and fail with actionable messages.
- Return data, not side channels: `secret.put` confirms without echoing the value.
- Stay free of orchestration. A capability does not decide *when* it should run; the agent or the UI
  does.

## Non-responsibilities

- No capability authorizes anything. That is the kernel policy in `server.ts`.
- No capability emits domain events. A capability that needs a durable record starts an
  `agent.config` run, which is the only thing that emits those events.
- No capability talks to the UI or holds UI state.
- No capability reads the store directly. Those that need derived data read a projection through
  `RuntimeService.readProjection`.

## The two invocation paths, and why the difference matters

| | `client.invoke` (browser) | `ctx.invoke` (agent run) |
|---|---|---|
| Recorded as an event | **No** | Yes (`run.invocation`) |
| Replayed from record | n/a | Yes |
| Passes an abort signal | No | Yes |
| Can publish progress | No | Yes (`ctx.progress`) |
| Typical use | operator actions: configure model, select workspace, dismiss a dialog, change a setting | everything the agent does: model call, tools, history reads, delegation |

The credential argument is the reason the distinction exists. `model.configure` is invoked by the
browser precisely so that the API key it carries is never written into the durable log. The same
reasoning is why `secret.put`'s doc comment says it must never be invoked from inside an agent's
`run()`: that would put the raw secret into a `run.invocation` payload.

## Shared shape

```ts
export function someComponent(options: {…}): Component {
  return {
    id: "some:component",
    provides: [{ id: "some.capability", version: "1.0.0", semanticRef: options.semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "some.capability", version: "1.0.0", semanticRef: options.semanticRef }, async (rawInput, ctx) => {
        …
      });
    },
  };
}
```

A capability that needs the runtime service receives `getService: () => RuntimeService`, because the
service does not exist until after `createRuntime` resolves. The handler builds a caller from the
invocation context (`{actor: ctx.actor, tenant: ctx.tenant ?? "local"}`) so it reads the same tenant's
rows the caller would.

---

## `model.generate`

**Where**: `src/components/modelProvider.ts`, mounted by `ProviderRegistry`.
**Contract**: built from `modelContract(provider)` with an added `semanticRef`, so the contract
describes whatever the mounted provider is.
**Behaviour**: if the provider does not advertise streaming, or there is no `ctx.progress`, call
`provider.generate`. Otherwise iterate `provider.stream`, accumulate text, forward every text delta
as `ctx.progress({kind: "text", text})`, and return the `done` delta's response — falling back to a
synthesised `{message, toolCalls: [], finishReason: "stop", model}` if the stream ended without one.
**Special**: this is the only capability that streams, and the only one mounted dynamically.

## `model.configure`

**Where**: `src/capabilities/modelConfigure.ts`. **Input**: `{providerId, baseURL, protocol,
model, apiKey}`. **Requires**: all of `providerId`, `baseURL`, `model`, else it throws.
**Order of operations is the contract**:
1. `secrets.put("model-provider:<providerId>", apiKey ?? "")` — write-only, never recorded.
2. `registry.swap(config, secrets)` — mount the new provider, wait up to 5s for `ACTIVE`, then
   dispose the previous fiber. No restart.
3. `service.startRun(SYSTEM_CALLER, {agent: "agent.config", input: {kind: "model.configured", …non-secret fields only}})` — this is what durably records the configuration.

**Returns**: `{ok: true, providerId}`. **Never returns the key.**

## `secret.put`

**Where**: `src/capabilities/secretPut.ts`. **Input**: `{key, value}`; both required.
Writes `secrets.json` at mode 0600. **Returns** `{ok: true, key}` — confirmation only.
`src/capabilities/modelConfigure.ts` is its only caller.

## `workspace.select`

**Where**: `src/capabilities/workspaceSelect.ts`. **Input**: `{path}`.
1. `resolve(path)` to canonicalise.
2. `stat` and require a directory, else throw `workspace.select: not a directory: <path>`.
3. `workspaceIdFor(canonicalPath)` = `sha256(...).slice(0,16)` hex.
4. Ask `getKnownWorkspaceIds()` whether this id is already known.
   - **New**: start an `agent.config` run with `{kind: "workspace.added", workspaceId, path, title}`,
     which emits `workspace.added` then `workspace.selected`.
   - **Known**: `{kind: "workspace.selected", workspaceId}`.
**Returns**: `{ok: true, workspaceId, path}`. `title` is the last path segment.

## `workspace.path`

**Where**: `src/capabilities/workspacePath.ts`. **Input**: `{workspaceId}`. Reads the `workspaces`
projection, finds `record/<workspaceId>`, returns `{path}`. Throws
`workspace.path: unknown workspaceId <id>` otherwise. Read-only; invoked once per turn by the agent so
the lookup itself is recorded and replayable.

## `session.history`

**Where**: `src/capabilities/sessionHistory.ts`. **Input**: `{sessionId, excludeRunId?}`.
For each run in correlation `session:<sessionId>`, skipping `excludeRunId` and any run whose agent is
not `agent.coding`:

- Push `{role: "user", content: run.input.message}` — **even if the run never completed**. A cancelled
  or failed turn's question stays in context.
- If `run.status === "completed"` and `run.output.text` is a string, push
  `{role: "assistant", content: output.text, stepCount: <tool.call.started count for that run> + 1}`.
  The `stepCount` is not a model concern; it exists so a session reopened from history shows the same
  footer counter a live-finished turn shows.
- For each completed child subagent of that run, push
  `{role: "user", content: 'Subagent "<title>" completed: <output>'}`.

Returns `ModelMessage[]`. The `agent.coding` path excludes its own run; the UI path does not, which is
why the UI's transcript contains the completed turn it just watched.

## `tool.read`, `tool.edit`, `tool.bash`, `tool.run_code`

**Where**: `src/capabilities/tools.ts`, one component (`tools:all`) publishing all four.

- `resolveInWorkspace(root, p)` resolves against the root and throws `PathEscapeError` unless the
  result is the root or under `root + sep`. Every file-touching tool goes through it.
- `tool.read` → `{file_path, content}`. `tool.edit` → `{file_path, replacements, diffLines, additions,
  deletions}`; requires `old_string` to occur at least once, and exactly once unless `replace_all`,
  otherwise it throws with the match count. `diffLines` is a common-prefix/suffix line diff — adequate
  for small replacements, not a general diff algorithm.
- `tool.bash` runs `bash -lc <command>` with `cwd` = the resolved root.
- `tool.run_code` runs `bun -e <harness>` with the same `cwd`. The harness is original and small: it
  defines a single `tools.bash({command})` in terms of the same subprocess path, wraps the model's
  code in an async IIFE, and sets `process.exitCode = 1` on a thrown error. It is **not** a sandbox
  beyond the path containment the app already applies.
- Both subprocess paths: 30s default timeout, kill on expiry (`timedOut: true` in the result), output
  capped at 20,000 characters with a truncation marker.

`fileExists` is exported from the same module and used by the agent's read-before-edit guard, boxed in
`ctx.step`.

## `plan.state`

**Where**: `src/capabilities/planState.ts`. **Input**: `{sessionId}`. Reads the `plans` projection;
a missing row yields `{sessionId, on: false, todos: []}`. Read-only — plan-mode *changes* are events
emitted by the agent, not a capability. Invoked once per turn so the agent knows whether
`exit_plan_mode` is legitimate before handling it.

## `subagent.start`

**Where**: `src/capabilities/subagentStart.ts`. **Input**: `{agent, input, key}` where `key` is
`` `${parentRunId}:${toolCallId}` ``. It recovers the tool-call id from `ctx.runId` + the key and
starts the child with `correlationId: "subagent:<parentRunId>:<id>"` and `idempotencyKey: key`.

Two reasons this exists instead of reusing `@cognate/profile-harness`'s `subagent.start`: the packaged
one starts the child with no correlation at all (so a child would be indistinguishable from a session
run and would leak into the `sessions` projection), and `spawnSubagent` depends on a
`run_completion` resolver captured inside `createHarness`'s closure, which an app composing
`createRuntime` directly cannot reach. `F2` in `parity-report.md` records that as an open
framework-level finding.

**Returns**: `{runId}`.

## `onboarding.dismiss`

**Where**: `src/capabilities/onboardingDismiss.ts`. **Input**: `{step}` where `step` is `"notice"` or
`"apikey"`; anything else throws. Starts an `agent.config` run with
`{kind: "onboarding.dismissed", step}`. Absence of a row for a step in the `onboarding` projection is
what makes that first-run dialog reappear on a fresh home. **Unbound** to the IDM: no `semanticRef`
is passed.

## `settings.changeWorkDetails`

**Where**: `src/capabilities/settingsChange.ts`. **Input**: `{workDetails}`; validated with
`isWorkDetailsMode` and rejected otherwise with
`settings.changeWorkDetails: workDetails must be one of compact, standard, detailed, verbose`.
Starts an `agent.config` run with `{kind: "settings.changed", workDetails}` so the preference is
durable across a full runtime restart, not just a reload. **Unbound** to the IDM.

---

## State

Capabilities do not own durable state. They read projections and write the store only as a side
effect of an invocation the runtime has already recorded. Two hold non-durable state for the process
lifetime: `ProviderRegistry` (the currently mounted provider) and `knownWorkspaceIds` in
`server.ts` (seeded from a projection, then kept current from the event stream).

## Lifecycle

Mounted at boot by the `components` array, except `workspace:select` and `model:configure`, which are
mounted right after `createRuntime` resolves because they close over `getService` and the registry.
`model-provider:<id>` is mounted and disposed repeatedly. `stop()` disposes everything via
`runtime.close()`.

## Failure modes

| Symptom | Cause |
|---|---|
| `Permission denied` on a new capability | its id is missing from `GRANTED_CAPABILITIES` |
| `providerId, baseURL, and model are required` | `model.configure` validation |
| `not a directory: <path>` | `workspace.select` on a missing or non-directory path |
| `unknown workspaceId <id>` | `workspace.path` for an id the `workspaces` projection does not hold |
| `path escapes workspace root: <p>` | a tool argument resolving outside the root |
| `old_string is not unique in <f> (N matches)` | `tool.edit` without `replace_all` |
| `workDetails must be one of compact, …` | invalid setting value |
| `secret.put: key and value are required` | invalid `secret.put` input |
| A resumed run fails immediately with a provider error | provider not re-mounted on boot (see [server-runtime.md](server-runtime.md)) |
| Tool output ends with `…(truncated)` | the 20,000-char cap |
| `timedOut: true` in a tool result | the 30s default timeout elapsed and the process was killed |

## Extension points

See [../how-to/add-a-capability.md](../how-to/add-a-capability.md) for the full vertical slice
(capability + binding + policy + test). The checklist that matters here:

1. Export a component factory taking `options` with an optional `semanticRef`.
2. Declare the id and version in both `provides` and the `fiber.provide` call (both places — they are
   repeated by convention in this codebase).
3. Mount it in `server.ts`, or mount it afterwards if it needs `getService`/the registry.
4. Add the id to `GRANTED_CAPABILITIES`.
5. Validate input and throw messages that name the capability and the offending value.

## Source trail

- `cognate/src/capabilities/tools.ts:13-14` — `MAX_OUTPUT`, `DEFAULT_TIMEOUT_MS`
- `cognate/src/capabilities/tools.ts:16-28` — `PathEscapeError`, `resolveInWorkspace`
- `cognate/src/capabilities/tools.ts:34-52` — `runSubprocess` (timeout, kill, output cap)
- `cognate/src/capabilities/tools.ts:83-119` — `countOccurrences`, `diffLines`
- `cognate/src/capabilities/tools.ts:158-170` — `RUN_CODE_HARNESS`
- `cognate/src/capabilities/tools.ts:173-224` — `toolCapabilitiesComponent`
- `cognate/src/capabilities/tools.ts:227-234` — `fileExists`
- `cognate/src/capabilities/modelConfigure.ts:34-47` — the three-step order
- `cognate/src/capabilities/workspaceSelect.ts:16-18` — `workspaceIdFor`
- `cognate/src/capabilities/workspaceSelect.ts:30-47` — validation and the new/known branch
- `cognate/src/capabilities/workspacePath.ts:19-28` — projection lookup
- `cognate/src/capabilities/sessionHistory.ts:40-64` — the fold, including `stepCount` and subagent results
- `cognate/src/capabilities/planState.ts:20-28` — projection lookup with an empty-state fallback
- `cognate/src/capabilities/subagentStart.ts:37-47` — correlation and idempotency
- `cognate/src/capabilities/onboardingDismiss.ts:28-38` — step validation
- `cognate/src/capabilities/settingsChange.ts:27-39` — mode validation
- `cognate/src/capabilities/secretPut.ts:19-25` — write-only confirmation
- `cognate/test/J-CFG-model-provider.test.ts:48-60` — the secret-never-recorded SQLite scan
- `cognate/test/J-WS-select.test.ts` — workspace identity and re-selection
- `cognate/test/J-C-tool-execution.test.ts:67-96` — path escape rejection
