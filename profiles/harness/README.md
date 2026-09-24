# @cognate/profile-harness

Reference Harness profile (spec §29.2, §35, §40.K): a pure composition of existing kernel/runtime
primitives. No kernel additions — every behaviour below is a `Component`, an `AgentDefinition`, or
plain durable-store/service calls.

| Profile component | Primitive it composes |
| --- | --- |
| `model-providers` | `providerComponent(provider)` → `fiber.provide(modelContract(provider), ...)`, capability `model.generate` |
| `tool-registry` | `toolComponent`/`skillComponent` → `fiber.provide({id:"tool.<name>", ...})`; a harness-local `Map` kept live via `fiber.effects.register` disposers, filtered through `runtime.kernel.resolve` |
| `agent-loop` | `AgentDefinition` `LOOP_AGENT` using only `ctx.invoke("model.generate", ...)` / `ctx.invoke("tool.<name>", ...)` |
| `sessions` | `runtime.service.startRun`/`.events`/`.getRun` filtered by `correlationId = "session:<id>"` |
| `storage` | `storageComponent(store)` → capability `storage.kv`, backed by CAS `DurableStore` records (collection `kv`) |
| `skills` | `skillComponent` → same `fiber.provide` mechanism as tools, several at once |
| `scheduler` | durable records (collection `schedules`) + a `setInterval` loop calling `runtime.service.startRun` |
| `sandbox` | `Bun.spawn(["bun","-e",code])` with a scrubbed `env` and a timeout `proc.kill()` |
| `subagents` | `spawnSubagent` → `ctx.invoke("subagent.start", ...)` (a component calling `runtime.service.startRun` as `system`) + `ctx.waitFor` resolved from `runtime.store.onCommitted` |

`createHarness` mounts `storage`, `sandbox`, and `subagent.start` as ordinary components on the
existing `@cognate/runtime-bun` kernel; providers/tools/skills are mounted the same way by callers.
Policy (`Policy`) and action authorization (`ActionPolicy`) are both allow-all by default — this is a
reference/demo harness, not a multi-tenant deployment; see `createHarness` for the exact rules.
