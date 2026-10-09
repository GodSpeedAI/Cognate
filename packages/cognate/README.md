# @godspeedai/cognate

The Cognate SDK's convenience entrypoint: one dependency for a durable agent runtime and the
headless client that drives it.

## Installation

```sh
bun add @godspeedai/cognate
```

Requires [Bun](https://bun.sh) >= 1.4.0. Typechecking a consumer project also needs the ambient
type packages: `bun add -d @types/bun @types/node`.

## Quick start

Define an agent, run it on a durable runtime, and drive it with the client — all through this
one import:

```ts
import { createClient, createRuntime, type AgentDefinition } from "@godspeedai/cognate";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";

const agent: AgentDefinition = {
  id: "agent.echo",
  version: "1.0.0",
  async run(input, ctx) {
    await ctx.emit("state.changed", { snapshot: { echo: input } });
    return { echoed: input };
  },
};

const runtime = await createRuntime({
  store: "./app.sqlite", // durable events, survives restarts
  agents: [agent],
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
});

const client = createClient({ service: runtime.service, caller: alice });
const { runId } = await client.startRun("agent.echo", { hello: "world" });

// State is derived from the run's durable events:
const state = client.run(runId).get();

await client.close();
await runtime.close();
```

For a real application, replace the open authorization policy with your own
(`policy.authorize` and `actions.authorize` decide every capability invocation), and point
`store` at a SQLite file (see limitations of
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)).

## What this package exports

| Entry | Contents |
|---|---|
| `@godspeedai/cognate` | Curated start-here surface: `createRuntime`, `createClient`, and their core option/state types (`RuntimeOptions`, `CognitionOptions`, `ClientOptions`, `RunState`, `AgentDefinition`, `Caller`, `RuntimeService`, …). |
| `@godspeedai/cognate/runtime` | The full reference runtime — everything from `@godspeedai/cognate-runtime-bun`. |
| `@godspeedai/cognate/client` | The full headless client — everything from `@godspeedai/cognate-client`. |

This package owns no implementation: every export is a re-export of an owning `@godspeedai/cognate-*`
package, so behavior and versioning stay with the owner. Heavier integrations — cognitive
backends, RealityTrace, DomainForge, protocol transports, React bindings — are deliberate
opt-ins via their own packages and are intentionally not bundled here.

## Runtime and persistence notes

- The runtime executes agents in-process; a run's events commit durably to the store, and runs
  replay from those events on restart.
- `store: ":memory:"` keeps everything in memory (nothing persists); pass a file path for
  durability.
- One process owns the SQLite store at a time (see the store package's limitations).

## Related packages

- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime this package re-exports.
- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the
  headless client this package re-exports.
- [`@godspeedai/cognate-cli`](https://www.npmjs.com/package/@godspeedai/cognate-cli) — scaffold a
  complete starter app instead of composing one by hand.
- [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) — React
  bindings over the same client.

## License

Apache-2.0
