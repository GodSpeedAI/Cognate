# harness/src — reference harness profile and loop agent

## Overview
One module holds both the profile declaration and the runnable harness. `harnessProfile`/`harnessRegistry` declare nine registered component names, while `createHarness` builds a runtime, mounts `storage.kv`, `sandbox.exec`, and `subagent.start`, and installs the built-in `agent.loop` agent `[profiles/harness/src/index.ts:createHarness]`. The header notes the harness composes registered components only and adds no kernel primitives `[profiles/harness/src/index.ts:The harness composes registered components only]`.

## Interface
- `LOOP_AGENT` — `"agent.loop"` `[profiles/harness/src/index.ts:LOOP_AGENT]`
- `HARNESS_COMPONENTS` — the nine names `model-providers`, `tool-registry`, `agent-loop`, `sessions`, `storage`, `skills`, `scheduler`, `sandbox`, `subagents` `[profiles/harness/src/index.ts:HARNESS_COMPONENTS]`
- `harnessProfile` — `defineProfile` result named `harness` `[profiles/harness/src/index.ts:harnessProfile]`
- `harnessRegistry` — one entry per component name, all attributed to this package, each `contribute` returning `undefined` `[profiles/harness/src/index.ts:harnessRegistry]`
- `ToolSpec` — tool name, description, JSON Schema, handler, optional capability `requires` `[profiles/harness/src/index.ts:ToolSpec]`
- `toolComponent` / `skillComponent` — components publishing one `tool.<name>` or a bundle of them `[profiles/harness/src/index.ts:toolComponent]`
- `providerComponent` / `storageComponent` / `subagentStartComponent` — components publishing `model.generate`, `storage.kv`, `subagent.start` `[profiles/harness/src/index.ts:providerComponent]`
- `HarnessOptions` / `Harness` — configuration and the returned surface `[profiles/harness/src/index.ts:HarnessOptions]`
- `LOCAL_OPERATOR` — default caller: actor `operator` of kind `user` in tenant `local` `[profiles/harness/src/index.ts:LOCAL_OPERATOR]`
- `createHarness(options)` — returns `{ runtime, storage, mount, send, session, schedule, close }` `[profiles/harness/src/index.ts:createHarness]`
- `watchSubagentCompletions(runtime, caller?)` / `spawnSubagent(ctx, id, agent, input)` — settling and opening child-run continuations `[profiles/harness/src/index.ts:watchSubagentCompletions]`

## Invariants
- Tools are offered only when `runtime.kernel.resolve({ capability })` returns a valid, available lease `[profiles/harness/src/index.ts:offeredTools]`
- The loop stops at `maxSteps` (default `8`) and returns `{ answer: "max steps reached", steps }` `[profiles/harness/src/index.ts:DEFAULT_MAX_STEPS]`
- A model response is final unless `finishReason === "tool_calls"` with at least one tool call `[profiles/harness/src/index.ts:loopAgent]`
- `storage.kv` record ids are `${ctx.tenant}/${input.key}`, keeping tenants separate `[profiles/harness/src/index.ts:storageComponent]`
- KV writes retry on `RecordConflictError` using the observed version as `expectedVersion` `[profiles/harness/src/index.ts:storageComponent]`
- `sandbox.exec` runs `bun -e <code>` with `env` limited to `PATH`, killed at `timeoutMs`, streams truncated at `maxOutputBytes` `[profiles/harness/src/index.ts:sandboxComponent]`
- Tool specs are removed from the live registry by a fiber effect registered on activation `[profiles/harness/src/index.ts:withToolRegistry]`
- `spawnSubagent` settles only if something resolves `run_completion` continuations; the doc comment warns the parent waits forever otherwise `[profiles/harness/src/index.ts:spawnSubagent]`
- The scheduler marks a due record `started: true` before starting it and skips the run when it loses that commit race `[profiles/harness/src/index.ts:tickScheduler]`
- The mount helper waits up to `10_000` ms for `ACTIVE` and swallows the timeout `[profiles/harness/src/index.ts:createHarness]`

## Side Effects
- Durable commits to the `kv` and `schedules` collections and run events through the runtime store `[profiles/harness/src/index.ts:storageComponent]`
- Spawns a Bun subprocess per `sandbox.exec` and kills it on timeout `[profiles/harness/src/index.ts:sandboxComponent]`
- A `20` ms `setInterval` drives `tickScheduler`; `close()` clears it, stops the watcher, and closes the runtime `[profiles/harness/src/index.ts:schedulerTimer]`
- Subscribes to store commits via `runtime.store.onCommitted`; the returned dispose unsubscribes `[profiles/harness/src/index.ts:watchSubagentCompletions]`
- Governance defaults to `governanceFromEnv(process.env)` when the caller supplies none `[profiles/harness/src/index.ts:createHarness]`

## Verification
- Run: `bun test ./profiles/harness/test/harness.test.ts`
