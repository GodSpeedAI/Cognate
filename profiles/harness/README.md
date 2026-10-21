# @godspeedai/cognate-profile-harness

The Harness reference profile: a ready-to-run autonomous agent — model provider, tool registry, agent loop, sessions, durable key-value storage, skills, a scheduler, a code sandbox, and subagents — composed entirely from existing runtime primitives. No new kernel machinery.

> **Security warning.** This profile's reference configuration authorizes *every* capability invocation and *every* action: its policy is allow-all by default and cannot be tightened through options. It is a reference and demo harness for a local, single-user setting. Do not expose it to untrusted callers or networks. For real deployments, build on [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) directly and pass your own `policy` and `actions` to `createRuntime`.

**When to use this package:** you want a working autonomous loop (model picks tools, tools run, loop continues until answered), durable sessions and scheduled runs, sandboxed code execution, and parent/child subagent composition — to run as-is or study before composing your own. For an interactive chat copilot instead, see [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot).

## Installation

```sh
bun add @godspeedai/cognate-profile-harness
```

Requires [Bun](https://bun.sh) >= 1.4.0 (the sandbox spawns `bun -e` subprocesses). Builds on [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun), [`@godspeedai/cognate-capabilities`](https://www.npmjs.com/package/@godspeedai/cognate-capabilities), and [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api).

## Quick start

```ts
import {
  createHarness,
  providerComponent,
  toolComponent,
} from "@godspeedai/cognate-profile-harness";
import { openAICompatible } from "@godspeedai/cognate-provider-openai-compatible";

const harness = await createHarness({
  store: "./harness.sqlite", // durable runs, sessions, schedules, and kv records
  instructions: "You are a build assistant.",
  maxSteps: 8, // model/tool iterations per run
});

// Mount a model provider (replaceable live: dispose one, mount another).
await harness.mount(providerComponent(
  openAICompatible({ id: "main", baseURL: process.env.MODEL_BASE_URL!, model: "my-model", apiKey: () => process.env.MODEL_API_KEY! }),
));

// Mount a tool; the loop discovers it from the registry on the next run.
await harness.mount(toolComponent({
  name: "reverse",
  description: "Reverse a string",
  inputSchema: { type: "object" },
  handler: (input) => ({ reversed: [...String((input as { text: string }).text)].reverse().join("") }),
}));

const runId = await harness.send("session-1", "please reverse this");
// ... the run executes; poll or subscribe for completion
const runs = await harness.session("session-1"); // [{ runId, status, output }]
await harness.close();
```

## What a harness does

| Concern | Behaviour |
| --- | --- |
| Agent loop | `agent.loop` calls `model.generate`, executes the requested tools from the live registry, feeds results back, and stops when the model answers (bounded by `maxSteps`) |
| Tool registry | `toolComponent` mounts one tool; `skillComponent` mounts a named bundle; tools appear/disappear live as components mount and dispose, and a tool can declare capability `requires` so it waits for its dependencies |
| Sessions | `send(sessionId, message)` starts runs correlated by `session:<id>`; `session(sessionId)` lists them oldest-first |
| Storage | the built-in `storage.kv` capability — `get`/`set`/`delete` backed by durable records, partitioned by the caller's tenant |
| Scheduler | `schedule(agent, input, at)` records a durable schedule; a loop starts due runs (idempotently, safe across restarts) |
| Sandbox | the `sandbox.exec` capability runs code in a `bun -e` subprocess with a scrubbed environment (no inherited secrets), a timeout, and an output cap |
| Subagents | `spawnSubagent(ctx, id, agent, input)` starts a child run durably from inside a run and waits for its output — the wait survives a restart |

`spawnSubagent` is the one piece that runs inside an agent:

```ts
import { spawnSubagent } from "@godspeedai/cognate-profile-harness";

const myAgent = {
  id: "agent.researcher",
  version: "1.0.0",
  async run(input, ctx) {
    const summary = await spawnSubagent(ctx, "search", "agent.search", { query: input.topic });
    return { summary };
  },
};
// pass it via createHarness({ agents: [myAgent], ... })
```

`spawnSubagent` needs two things: a `subagent.start` provider, which lets the parent start its child, and something that
settles its `run_completion` continuations. `createHarness` provides both. An app that composes `createRuntime` directly
mounts the exported `subagentStartComponent(runtime)` on `runtime.kernel`, calls `watchSubagentCompletions(runtime, caller)`
once, and keeps the returned dispose function for teardown. Without both, the parent waits forever.

The exported `harnessProfile` and `harnessRegistry` declare the composition by name (resolvable with `resolveProfile` from [`@godspeedai/cognate-profile`](https://www.npmjs.com/package/@godspeedai/cognate-profile)), and every behaviour above is an ordinary component, agent definition, or durable-store/service call you can reassemble yourself.

## Limitations

- **Allow-all authorization is baked into the reference configuration** (see the warning above); multi-tenant or least-privilege deployments need `createRuntime` with a real policy instead.
- The scheduler is an in-process interval loop: schedules are durable, but starting them requires a running harness process.
- The sandbox isolates only by scrubbed environment, timeout, and output cap — it is not a security boundary against hostile code.
- There is exactly one slot for the model provider contract: swap providers by disposing the mounted one and mounting the next (a verified live swap); routing between concurrent providers is not provided.

## Related packages

- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) — the interactive chat profile.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the runtime and durable store underneath.
- [`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible) — model providers for real endpoints.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
