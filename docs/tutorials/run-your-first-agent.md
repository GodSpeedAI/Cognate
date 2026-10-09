# Tutorial: run one agent, end to end

The shortest path from a clone to a durable run you can inspect. No CLI, no HTTP, no UI — just the
three packages you need: `runtime-bun`, `runtime-api`, and `client`.

**Prerequisites.** Bun 1.4.x and a clone of this repository, with `bun install` already run.

**Time.** About five minutes. Every step is a real file you can keep.

## 1. Write an agent

An agent is a function plus a name and a version. Create `agent.ts`:

```ts
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";

export const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    // ctx.emit records a run-scoped fact exactly once, even across replays.
    await ctx.emit("message.delta", { text: "Looking into your refund…\n" });

    const amount = (input as { amount: number }).amount;
    const quote = (await ctx.invoke("billing.quote", { orderId: 7, amount })) as { total: number };

    await ctx.emit("message.delta", { text: `Quote: ${quote.total}\n` });

    // Non-determinism goes through ctx.step, which records the result once.
    const ticket = await ctx.step("ticket", () => `REF-${Math.floor(Math.random() * 1e6)}`);

    return { ticket, total: quote.total };
  },
};
```

Two rules to internalize now, because the runtime depends on them:

1. `ctx.invoke` and `ctx.step` **record** their results. On replay, the recorded result is
   returned and the work is not repeated.
2. Anything non-deterministic (a clock, a random number, a model response) must be behind one of
   them. The bare `Math.random()` above would break replay; that is why it is inside `ctx.step`.

## 2. Give it a capability to call

`ctx.invoke` needs a provider. Write `billing.ts`:

```ts
import type { CapabilityContract, Component } from "@godspeedai/cognate-kernel-api";

const contract: CapabilityContract = {
  id: "billing.quote",
  version: "1.0.0",
  attributes: { currency: "usd" },
};

export const billingQuote: Component = {
  id: "billing",
  version: "1.0.0",
  provides: [contract],
  activate(fiber) {
    fiber.provide(contract, async (input, ctx) => {
      // fiber.effects.register(disposer, label) ties cleanup to this fiber.
      const timer = setInterval(() => {}, 60_000);
      fiber.effects.register(() => clearInterval(timer), "billing-poll");

      const { amount } = input as { amount: number };
      if (amount <= 0) throw new Error("amount must be positive");   // a typed failure, not a crash
      return { total: Math.round(amount * 1.2), currency: "usd", by: ctx.actor.id };
    });
  },
};
```

A component *declares* in `provides` what it may publish, and publishes with
`fiber.provide(contract, handler)` during `activate`. The publication becomes visible only after
`activate` resolves — if it throws, the attempt's effects are disposed and nothing is published. If
the component needs dependencies, add `requires: { quote: { capability: "storage.kv" } }` (a
name-keyed record) and the component stays `WAITING` until a provider appears.

## 3. Compose them in a runtime

Write `main.ts`:

```ts
import { createClient } from "@godspeedai/cognate-client";
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { billingQuote } from "./billing.ts";
import { refundAgent } from "./agent.ts";

const caller = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };

const runtime = await createRuntime({
  store: "./my-app.sqlite",                                  // or ":memory:"
  policy: allowCapabilities("tutorial", ["billing.quote"]),  // default is denyAll
  actions: { authorize: () => ({ allow: true, reason: "local tutorial" }) },
  agents: [refundAgent],
  components: [billingQuote],
});

const client = createClient({ service: runtime.service, caller });

try {
  const { runId } = await client.startRun("agent.refund", { amount: 100 });

  // The run executes in the background; watch its derived state.
  const unsubscribe = client.subscribe({ runId }, (event) => {
    if (event.eventType === "message.delta") process.stdout.write(event.payload.text as string);
  });

  const run = await waitFor(() => client.run(runId).get(), (r) => r.status === "completed");
  unsubscribe();

  console.log("\nstatus:", run.status);
  console.log("output:", JSON.stringify(run.output));
} finally {
  await client.close();
  await runtime.close();
}

function waitFor<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const value = read();
      if (ok(value)) return resolve(value);
      if (Date.now() > deadline) return reject(new Error("timed out"));
      setTimeout(poll, 20);
    };
    poll();
  });
}
```

Run it:

```bash
bun run main.ts
```

Expected output:

```text
Looking into your refund…
Quote: 120
status: completed
output: {"ticket":"REF-865161","total":120}
```

The ticket is random by construction — that is the point of routing it through `ctx.step`. Every run
produces a different one.

## 4. Verify it is durable, not cached

This is the step that distinguishes Cognate from a request handler. Open the database:

```bash
bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("./my-app.sqlite", { readonly: true });
const rows = db.query(
  "SELECT e.stream_sequence, e.event_type, p.payload FROM events e " +
  "LEFT JOIN payloads p ON p.event_id = e.event_id ORDER BY e.position",
).all();
for (const r of rows) console.log(r.stream_sequence, r.event_type, String(r.payload).slice(0, 70));
'
```

Actual output from the run above:

```text
1 run.started {"input":{"amount":100}}
2 message.delta {"text":"Looking into your refund…\n"}
3 run.invocation {"input":{"orderId":7,"amount":100},"result":{"total":120,"currency":"usd",…
4 message.delta {"text":"Quote: 120\n"}
5 run.step.completed {"result":"REF-865161"}
6 run.completed {"output":{"ticket":"REF-865161","total":120}}
```

Note the join. Event **envelopes** and event **payloads** are separate tables, which is exactly what
makes erasure work later: the payload row can be deleted while the envelope keeps the ids, the
causation chain, and the timing (see [why everything is a projection](../explanation/why-projection-not-storage.md)).
Querying `payload` from `events` alone fails, on purpose.

You can also see that `run.invocation` recorded both the input and the result, and that
`run.step.completed` recorded the ticket — so on re-entry of *this* run neither would be recomputed.

To watch replay directly, kill the process while a run is suspended (the next tutorial) or restart
after a crash: the run resumes and does not re-invoke `billing.quote`. Run `main.ts` again and you
get a new run id and therefore a new ticket, because the randomness is recorded per run.

## What you just built

| Piece | Package |
|---|---|
| the agent and its recorded context | `@godspeedai/cognate-runtime-api` |
| the capability provider | `@godspeedai/cognate-kernel-api` types, `@godspeedai/cognate-kernel-cordis` engine |
| the durable store, continuations, artifacts, loop | `@godspeedai/cognate-runtime-bun` |
| the derived view and the event subscription | `@godspeedai/cognate-client` |

The same three calls work unchanged over Connect, AG-UI, MCP, and A2A — the client talks to a
`RuntimeService`, and that is the only interface.

## Next

- **Tutorial 2:** [tutorial: a human in the loop](human-in-the-loop.md) — `ctx.waitFor`, a
  durable continuation, and a resume after a restart.
- **Reference:** [runtime-service-and-agents.md](../reference/runtime-service-and-agents.md) for
  every `RunContext` and `RuntimeService` method.
- **Explanation:** [why-replay.md](../explanation/why-replay.md) for why step ids exist.

## Source trail

- `examples/shared-state/index.ts`, `examples/human-approval/index.ts` — the same shape, verified by
  `tests/examples.test.ts`.
- `packages/runtime-api/src/types.ts` — `AgentDefinition`, `RunContext`.
- `packages/kernel-api/src/types.ts` — `Component`, `activate`'s return contract.
- `packages/client/src/index.ts` — `createClient`, `subscribe`, `run`.
