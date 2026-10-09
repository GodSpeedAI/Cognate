# @godspeedai/cognate-client

The headless Cognate client: start and watch runs, resolve approvals, write shared state, serve
frontend capabilities to agents, and read projections — over any `RuntimeService`, in-process or
remote. All client state is derived from durable events, so it survives reconnects and can be
rebuilt from scratch. Framework-neutral: no React (React bindings live in
[`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react)).

**When to use this package:** any front end, service, or script that talks to a Cognate runtime.
For a browser UI, pair it with the React bindings; for a remote runtime, hand it a
transport-backed `RuntimeService` such as the one from
[`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect).

## Installation

```sh
bun add @godspeedai/cognate-client
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## Quick start

A complete round trip against the in-process reference runtime — the same flow works unchanged
against a remote service:

```ts
import { createClient } from "@godspeedai/cognate-client";
import { alice } from "@godspeedai/cognate-runtime-api/conformance"; // a ready-made caller
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

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

const runtime = await createRuntime({
  store: ":memory:",
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
  agents: [refundAgent],
});

// `caller` is the identity established by your transport's authenticator — never a request body.
const client = createClient({ service: runtime.service, caller: alice });

const run = await client.startRun("agent.refund", { amount: 75 });

async function waitUntil<T>(read: () => T, ok: (v: T) => boolean): Promise<T> {
  for (;;) {
    const value = read();
    if (ok(value)) return value;
    await Bun.sleep(10);
  }
}

// `run(id)` is a live, reactive view derived only from the run's durable events.
const waiting = await waitUntil(
  () => client.run(run.runId).get(),
  (s) => s.openContinuations.length === 1,
);
const approval = waiting.openContinuations[0]!;

await client.resolveContinuation(approval.id, "resume", { approved: true });

const done = await waitUntil(
  () => client.run(run.runId).get(),
  (s) => s.status === "completed",
);
console.log(done.output); // { amount: 75, approved: true }

await client.close();
await runtime.close();
```

Subscribe instead of polling where it suits you:

```ts
const stop = client.run(runId).subscribe((state) => {
  console.log(state.status, state.text, state.state);
});
// state.text accumulates message.delta events; state.state folds state.changed
// snapshots and RFC 6902 patches; stop() unsubscribes.
```

## What the client covers

- **Runs** — `startRun(agent, input, { correlationId?, state? })`, `cancelRun(runId, reason)`, and
  `run(runId)`: a `Readable<RunState>` with `status`, accumulated `text`, folded shared `state`,
  `openContinuations`, `artifacts`, `output`, and `error`.
- **Shared state, both directions** — `startRun(..., { state })` seeds a run's initial state;
  `updateState(runId, update)` writes while the run waits (snapshot or JSON Patch), and the agent
  observes it through its own state reads. `threadSharedState(threadId)` /
  `updateThreadSharedState` do the same for durable state shared by every run in a thread.
- **A reconnecting event stream** — `subscribe({ afterPosition?, runId? }, listener)` resumes from
  the last delivered position after a disconnect: no gaps, no duplicates. `status` reports
  `connecting` / `live` / `reconnecting` / `closed` (backoff defaults to 50 ms doubling to 2 s).
- **Frontend capabilities** — `provideCapability("map.focus", handler)` executes open
  `frontend_capability` continuations that name the capability and resolves them for the run; the
  agent side is `invokeFrontend` from
  [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api).
  `offerCapability(offer, handler)` additionally publishes the capability as a lease-bound offer for
  one agent, renewed automatically until you unregister it.
- **Continuations, projections, invocations, artifacts** — `resolveContinuation(id, "resume" |
  "cancel", input)`, `projection(name)` (a `Readable` refreshed as events commit, with
  `refresh()` for on-demand re-reads), `invoke(capability, input)` through the runtime's
  authorization path, and `artifact(artifactId)` to fetch bytes.
- **Cleanup** — `close()` stops the stream and revokes any remote offers this client published.

## Limitations

- **Derived, never authoritative.** Everything the client shows is a fold of the tenant's durable
  events; the runtime and its store own the truth. A projection read may briefly lag the event that
  produced it — call `refresh()` when you need the latest read.
- **No authentication here.** The client takes a `Caller` you established elsewhere (your
  transport's authenticator); it never sends credentials itself.
- **No React.** The `Readable` interface (`get`/`subscribe`) is deliberately framework-neutral;
  use [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) for
  React 19 bindings.

## Related packages

- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime this client talks to in-process.
- [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api) —
  the `RuntimeService` contract the client is written against, plus the conformance callers.
- [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) — React 19
  bindings over this client.
- [`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect) —
  a remote `RuntimeService` client, so this package works over the network unchanged.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella;
  one install for the runtime and this client together.

## License

Apache-2.0
