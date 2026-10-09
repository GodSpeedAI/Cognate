# @godspeedai/cognate-runtime-bun

The Cognate reference runtime for Bun: durable agent runs, human-in-the-loop continuations,
artifacts, projections, and optional cognition, composed in-process behind a single
`RuntimeService`. Point it at a SQLite file and your application's history survives restarts.

**When to use this package:** to run agents for real — in a server, a worker, or a script. Pair it
with [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) to
consume it from the same process, or with a transport adapter to serve it over the network.

## Installation

```sh
bun add @godspeedai/cognate-runtime-bun
```

Requires [Bun](https://bun.sh) >= 1.4.0 (the default store uses Bun's built-in `bun:sqlite`).

## Quick start

```ts
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";

const agent: AgentDefinition = {
  id: "agent.order",
  version: "1.0.0",
  async run(_input, ctx) {
    // Shared state: a snapshot, then JSON Patch deltas — clients derive the same state.
    await ctx.emit("state.changed", { snapshot: { order: { id: "o-1", status: "open", total: 0 } } });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/status", value: "paid" }] });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/total", value: 42 }] });
    return { done: true };
  },
};

const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" } as const;

const runtime = await createRuntime({
  store: "./app.sqlite", // a durable file; use ":memory:" for an ephemeral runtime
  // policy authorizes capability invocations; actions authorizes run/continuation actions.
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "allowed" }) },
  actions: { authorize: () => ({ allow: true, reason: "allowed" }) },
  agents: [agent],
});

const started = await runtime.service.startRun(caller, {
  agent: "agent.order",
  input: {},
  idempotencyKey: "order-1", // repeating the key returns the same run, never a duplicate
});

await runtime.idle(); // background work queued so far has been processed

const run = await runtime.service.getRun(caller, { runId: started.runId });
console.log(run.status, run.output); // completed { done: true }

await runtime.close();
```

## Suspending on a durable continuation

`ctx.waitFor` suspends the run until someone resolves the continuation it opens. The run's progress
is durable: it can sit waiting through restarts.

```ts
const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount } = input as { amount: number };
    const decision = (await ctx.waitFor("approve", {
      type: "refund-approval",
      condition: { kind: "human_approval" },
      payload: { amount },
    })) as { approved: boolean };
    return { amount, approved: decision.approved };
  },
};

const waiting = await runtime.service.startRun(caller, {
  agent: "agent.refund",
  input: { amount: 75 },
  idempotencyKey: "refund-1",
});

// Meanwhile — from a webhook, an admin UI, a shell — list and resolve open continuations.
const [continuation] = await runtime.service.listContinuations(caller, {
  runId: waiting.runId,
  status: "OPEN",
});
await runtime.service.resolveContinuation(caller, {
  continuationId: continuation!.id,
  action: "resume",
  input: { approved: true },
  idempotencyKey: "approve-1",
});
```

The run re-enters the agent from the top, receives the recorded decision, and completes. Replays
never repeat recorded work: every `ctx.step`, `emit`, `invoke`, `artifact`, and `waitFor` result is
an event on the run's stream, and re-entry returns those results instead of re-executing.

## What you get from `createRuntime`

The returned `Runtime` exposes:

- `service` — the full `RuntimeService`: start/get/cancel/list runs, a reconnectable event stream
  (`service.events(caller, { follow: true })`), continuations, direct capability `invoke`,
  `getArtifact`, public projection reads, and shared run/thread state reads and updates.
- `store` — the underlying `DurableStore`, if you need direct access to the event log.
- `kernel` — the embedded capability kernel.
- `inspect(correlationId)` — the causal chain for a correlation id: runs, events, invocations,
  artifacts, observations.
- `erase(eventId, reason, actor)` — erase an event's payload; derived views and the cognitive index
  drop it too.
- `rebuildCognition()`, `pollApprovals()`, `idle(timeoutMs?)`, and `close()`.

Notable options beyond the quick start: `components` (capability-providing kernel components your
agents can `ctx.invoke`), `projections` ([`@godspeedai/cognate-projections`](https://www.npmjs.com/package/@godspeedai/cognate-projections)
kept current automatically), `cognition` (index completed runs and recall them via `ctx.recall`),
`outboxFor` (extra outbox intents committed atomically with each run event), `governance`, and
`tickMs` (background loop interval, default 10 ms).

## Limitations

- **One process, one writer.** All runs live in the process that opened the store; executions
  within a tick run sequentially, so a slow agent delays others. To scale out, split runtimes per
  store file.
- **Steps are at-least-once.** A step that was in flight during a crash re-executes after restart.
  Keep steps idempotent, and put irreversible external calls behind a `ctx.waitFor` continuation so
  they happen once, resolved deliberately.
- **Polling, not pushing, inside the process.** Background work (run execution, resume delivery,
  continuation expiry) runs on a loop every `tickMs`.
- **Erasure has copies.** `runtime.erase` removes an event's payload from the log, derived views,
  and the cognitive index — but content copied into continuation payloads, idempotency snapshots,
  or recall results stays.
- **Public projections are tenant-partitioned.** Register projections that key their state
  `<tenant>/<key>`; `service.readProjection` returns only the caller's tenant partition.
- **Denied means invisible.** Reading an artifact you are not allowed to see returns the same
  "not found" as a missing one.
- **Recall degrades gracefully.** Without a `cognition` configuration, `ctx.recall` returns
  `{ status: "degraded" }` instead of failing the run.

## Related packages

- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the
  headless client for consuming this runtime; derives live run state for you.
- [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api) —
  the service and agent-authoring contract this package implements.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) —
  the durable store behind `store: "<path>"`.
- [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) —
  bring your own ephemeral store via `store: { store }`.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella;
  one install for the runtime and the client together.

## License

Apache-2.0
