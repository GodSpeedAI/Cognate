# Harness profile

## Overview
The `@godspeedai/cognate-profile-harness` package is the harness reference profile (spec §29.2): model providers, tool registry, agent loop, sessions, storage, skills, scheduler, sandbox, and subagents. It composes registered components only and adds no kernel primitives.

## Interface
- `LOOP_AGENT` — the built-in loop agent id, `"agent.loop"` `[profiles/harness/src/index.ts:LOOP_AGENT]`
- `harnessProfile` / `harnessRegistry` — nine component names, each resolved to this package `[profiles/harness/src/index.ts:harnessProfile]`
- `ToolSpec` — `tool.<name>` capability, description, JSON Schema, handler, and optional `requires` `[profiles/harness/src/index.ts:ToolSpec]`
- `toolComponent` / `skillComponent` — kernel components publishing one tool or a named bundle of tools `[profiles/harness/src/index.ts:toolComponent]`
- `providerComponent` — publishes `model.generate` for a `ModelProvider`; replaceable by dispose/mount `[profiles/harness/src/index.ts:providerComponent]`
- `storageComponent` — publishes `storage.kv` over durable records `[profiles/harness/src/index.ts:storageComponent]`
- `subagentStartComponent` / `spawnSubagent` / `watchSubagentCompletions` — durable child runs and their settler `[profiles/harness/src/index.ts:watchSubagentCompletions]`
- `createHarness(options)` — mounts storage, sandbox, and `subagent.start`; returns `{ runtime, storage, mount, send, session, schedule, close }` `[profiles/harness/src/index.ts:createHarness]`
- `HarnessOptions` / `Harness` / `LOCAL_OPERATOR` — configuration, surface, and default local caller `[profiles/harness/src/index.ts:LOCAL_OPERATOR]`
- Subdirectories: `test/` — harness acceptance suite (no EGM.md)

## Invariants
- The loop agent discovers tools from the kernel each step and only offers leases that resolve and are valid `[profiles/harness/src/index.ts:offeredTools]`
- The loop is capped by `maxSteps`, defaulting to 8, and returns `"max steps reached"` past it `[profiles/harness/src/index.ts:DEFAULT_MAX_STEPS]`
- `storage.kv` keys are prefixed with `ctx.tenant`, so tenants neither see nor overwrite each other's values `[profiles/harness/src/index.ts:const id = \`${ctx.tenant}/${input.key}\`]`
- Record writes retry on `RecordConflictError` using the existing version as `expectedVersion` `[profiles/harness/src/index.ts:RecordConflictError]`
- `sandbox.exec` spawns `bun -e` with `env` limited to `PATH` and kills the process at `timeoutMs` `[profiles/harness/src/index.ts:Bun.spawn]`
- Each sandbox stream is truncated at `maxOutputBytes` `[profiles/harness/src/index.ts:truncate]`
- Tool registry entries are deleted by a registered fiber effect when the component is disposed `[profiles/harness/src/index.ts:fiber.effects.register]`
- `spawnSubagent` never settles unless something resolves `run_completion` continuations `[profiles/harness/src/index.ts:spawnSubagent]`
- The scheduler claims a due record by committing `started: true`; a lost race is skipped `[profiles/harness/src/index.ts:lost the race to another tick]`

## Side Effects
- Durable store commits for `kv`, `schedules`, and run events through the runtime `[profiles/harness/src/index.ts:store.commit]`
- Spawns subprocesses for `sandbox.exec` `[profiles/harness/src/index.ts:Bun.spawn]`
- A 20 ms `setInterval` timer drives `tickScheduler` until `close()` `[profiles/harness/src/index.ts:schedulerTimer]`
- Subscribes to store commits (`runtime.store.onCommitted`) and unsubscribes on the returned dispose `[profiles/harness/src/index.ts:onCommitted]`

## Verification
- Run: `bun test ./profiles/harness/test/harness.test.ts`
