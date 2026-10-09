# @godspeedai/cognate-runtime-api

The transport-independent runtime contract for Cognate: the `RuntimeService` interface (runs, events, continuations, artifacts, projections, shared state), the agent authoring surface (`AgentDefinition` / `RunContext`), and the canonical shared-state fold used by runtimes and clients alike.

**When to use this package:** to author agents, to build a client or transport, or to implement a `RuntimeService`. Applications get a working implementation from
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
and a ready-made caller from [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client).

## Installation

```sh
bun add @godspeedai/cognate-runtime-api
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## Authoring an agent

An agent is a deterministic function of its input plus recorded results:

```ts
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";

export const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount } = input as { amount: number };
    const quote = await ctx.step("quote", () => ({ total: amount * 2 }));
    await ctx.emit("message.delta", { text: `Total: ${quote.total}` });
    const decision = (await ctx.waitFor("approval", {
      type: "refund-approval",
      condition: { kind: "human_approval" },
      payload: quote,
    })) as { approved: boolean };
    return { approved: decision.approved, total: quote.total };
  },
};
```

Every `RunContext` method is durable and replay-safe: results are recorded as events on the run's stream, and re-entry after a suspension or a restart returns the recorded result instead of repeating the work. Agent code must therefore be deterministic given those results.

- `step(id, fn)` — run a nondeterministic unit (a model call, an API read) once and record its JSON result.
- `emit(eventType, payload)` — record a run-scoped fact exactly once across replays.
- `invoke(capability, input)` — call a kernel capability through policy; throws `InvocationFailedError` on a typed failure.
- `waitFor(id, spec)` — suspend until a durable continuation is resolved; cancelling or expiring the continuation fails the run with `ContinuationClosedError`.
- `artifact({ name, mediaType, bytes })` — produce a durable artifact; returns its id.
- `state(id)` / `sharedState(id)` / `updateSharedState(id, update)` — read and atomically update the run's and the thread's shared state.
- `recall(id, { text, k })` — recall authorized prior knowledge; returns `{ status: "degraded" }` when cognition is unavailable.

## Calling the service

Every `RuntimeService` operation takes a `Caller` — the identity the transport's authenticator established, never something read from the request body:

```ts
import type { Caller } from "@godspeedai/cognate-runtime-api";

const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };

const run = await service.startRun(alice, {
  agent: "agent.refund",
  input: { amount: 21 },
  idempotencyKey: "refund-1",
});
```

Failures are `ServiceError` with a typed `code`: `not_found`, `permission_denied`, `invalid_argument`, `failed_precondition`, `unavailable`, `deadline_exceeded`, `already_exists`, `unauthenticated`, or `resource_exhausted`.

## Shared state

A run's state is the fold of its `state.changed` events in store position order. This package owns the canonical fold: `applyStateUpdate` applies one update (a full `snapshot` or an RFC 6902 `patch`), `foldState` folds a sequence of events, and both the runtime and the headless client use them — so every reader derives the same state. Applying a patch that does not fit throws `StatePatchError`; while folding agent-emitted events, such a patch is skipped rather than hiding later updates.

## Frontend capabilities

`invokeFrontend(ctx, id, capability, input)` turns a client-provided capability into a durable continuation: the run suspends until a connected client that registered the capability executes it and resolves the continuation with a value. It survives disconnects and restarts like any continuation; on failure it throws `FrontendCapabilityError`.

## Conformance subpath

`@godspeedai/cognate-runtime-api/conformance` runs the entire service contract unchanged in-process and over any transport — the same kit proves both. It exports `runtimeServiceConformance` (and agent/tool fixtures for it), plus ready-made `Caller` identities you can use in your own tests and examples:

```ts
import { alice, mallory, bob } from "@godspeedai/cognate-runtime-api/conformance";
// alice and mallory are users in tenant "tenant-a"; bob is a user in "tenant-b".
```

## Limitations

- Contract only: no server and no wire transport. Pair it with an implementation such as the Bun runtime, or map it onto your transport of choice.
- `RunContext` is the only supported way for agent code to reach the outside world; anything it records must round-trip as JSON.

## Related packages

- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the reference in-process implementation of `RuntimeService`.
- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the headless client over any `RuntimeService`.
- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) — the durable store contract the service is defined against.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella; one install for the runtime, the client, and this contract.

## License

Apache-2.0
