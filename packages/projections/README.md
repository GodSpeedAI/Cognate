# @godspeedai/cognate-projections

Checkpointed, idempotent, rebuildable projections over the Cognate durable event log. A projection is a deterministic derivation from events; `ProjectionRunner` keeps its derived state and its checkpoint in sync, batch by batch, and never skips a failing event.

**When to use this package:** you want a read model or index derived from committed events — counts, listings, per-tenant views — that survives restarts, can be rebuilt from scratch, and stays consistent under concurrent writers. The
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
runtime uses this package to keep registered projections current; you can also run a `ProjectionRunner` directly over any
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) store.

## Installation

```sh
bun add @godspeedai/cognate-projections
```

Requires [Bun](https://bun.sh) >= 1.4.0. Needs a store implementing the
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) `DurableStore`
contract — for example [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
or [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory).

## Quick start

```ts
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import type { Projection } from "@godspeedai/cognate-projections";

const ledger: Projection = {
  name: "ledger",
  version: "1", // bump to force a rebuild rather than reinterpret old state
  apply(event, state) {
    const count = (state.get(`count:${event.eventType}`) as number | undefined) ?? 0;
    const total = (state.get("total") as number | undefined) ?? 0;
    const amount = (event.payload as { amount?: number }).amount ?? 0;
    return [
      { key: `count:${event.eventType}`, value: count + 1 },
      { key: "total", value: total + amount },
    ];
  },
};

const runner = new ProjectionRunner(store, ledger);
const result = await runner.catchUp();
// { status: "ok", position: <last applied store position>, applied: 3 }

const total = await store.readProjection("ledger", "total");
```

`apply` returns the keys it wants to write (`value: null` deletes a key) and may read state written earlier in the same batch through `state.get`.

## How the runner behaves

- **Checkpointed and idempotent.** Each batch's writes and its checkpoint commit atomically through one `commitProjection` call, guarded by the previous position. Running `catchUp()` twice applies each event exactly once.
- **Failures stop the world — correctly.** On an apply error the runner commits the successful prefix, records the error at the failing event, and returns `{ status: "error", ... }`. `catchUp()` keeps returning that stored error until you clear it with `retry()`, which reattempts from the checkpoint. The failing event is never skipped.
- **Version changes require rebuilds.** A stored checkpoint whose version differs from the projection's own yields `{ status: "rebuild_required" }`; `rebuild()` deletes the derived state and replays from position 0.
- **Live mode.** `start()` follows committed events as they happen; `stop()` unsubscribes after the in-flight run finishes. All runs — live, `catchUp`, `retry`, `rebuild` — are serialized so they never overlap. `waitFor(position)` resolves once the checkpoint reaches a given store position.
- **Concurrent runners are safe.** Two runners racing on one projection resolve through the store's checkpoint conflict: the loser re-reads the checkpoint and continues from it without double-applying.

## Limitations

- Projections are derived state: nothing here is authoritative, and `rebuild()` will happily delete and recompute everything. Never store the only copy of data in a projection.
- `apply` must be deterministic given the event and the state — no clock, randomness, or network. Record nondeterministic inputs as events first.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) — the event log and checkpoint API this package builds on.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) — the durable store to project over.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — keeps registered projections current automatically; public ones are readable through the service and the client.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
