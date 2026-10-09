# How to: add a projection

A projection derives a read model from events. It is how you answer "what does the application
currently look like" without giving up the event log as the only truth.

**Goal.** A tenant-partitioned projection over run events, readable through
`RuntimeService.readProjection` and from the client.

**Prerequisites.** A running application.

## 1. Write the projection

```ts
import type { Projection, ProjectionState, ProjectionWrite } from "@godspeedai/cognate-events";
import type { StoredEvent } from "@godspeedai/cognate-events";

export const orderSummary: Projection = {
  name: "orders",
  version: "1",

  apply(event: StoredEvent, state: ProjectionState): readonly ProjectionWrite[] {
    if (event.eventType === "run.completed" && event.runId) {
      // Public projections MUST key state `<tenant>/<key>`; the service strips the prefix
      // and returns only the caller's partition.
      return [{ key: `${event.tenant}/${event.runId}`, value: { status: "completed", at: event.recordedAt } }];
    }
    if (event.eventType === "run.failed" && event.runId) {
      return [{ key: `${event.tenant}/${event.runId}`, value: { status: "failed", at: event.recordedAt } }];
    }
    return [];
  },
};
```

The contract:

- `name` identifies the checkpoint. `version` is *your* code version — bump it when the meaning of
  the state changes, and the runner returns `rebuild_required` instead of silently mixing shapes.
- `apply` is pure with respect to the store: return writes, do not commit them. The runner commits
  the derived writes **with** the checkpoint, atomically.
- Return nothing for events you do not care about. The runner still advances the checkpoint.

## 2. Register it with the runtime

```ts
const runtime = await createRuntime({
  // …
  projections: [
    { projection: orderSummary, public: true },   // public ⇒ readable via readProjection
    { projection: internalAudit, public: false },
  ],
});
```

`runtime-bun` constructs a `ProjectionRunner` per entry, calls `catchUp()`, `rebuild()`s if the
stored checkpoint version differs, then `start()`s it. If cognition is configured, its
`runtime.cognition` runner is added too.

## 3. Read it

Over the service:

```ts
const rows = await runtime.service.readProjection(caller, { name: "orders" });
// rows: [{ key: "<runId>", value: { status: "completed", at: "…" } }]
```

From the client:

```ts
const orders = client.projection("orders");
orders.subscribe((rows) => console.log(rows));
```

`ProjectionStore` refreshes whenever any event commits, and discards a stale response with a
generation counter.

From React:

```tsx
const orders = useProjection("orders");
```

## 4. Handle erasure

If your projection copies content, that copy must be invalidated when the source event is erased.
The pattern the cognitive indexer uses:

```ts
if (event.eventType === "erasure.recorded") {
  const source = field(event.payload, "eventId");
  return [{ key: thatKey, value: null }];   // null deletes the entry
}
```

Otherwise erasure is incomplete for your view, and the gap is a debt entry rather than a fixed
bug. Keep personal content out of projections where you can; store references instead.

## 5. Verify

```bash
bun run typecheck
bun test ./packages/projections
```

Runtime check:

```ts
await runtime.idle();                              // let the projection catch up
const rows = await runtime.service.readProjection(caller, { name: "orders" });
console.log(rows.length);                          // ≥ 1 after a completed run
```

Failure behavior worth knowing: if `apply` throws, the runner commits the successful prefix and
records the error **at the failing event** — it does not skip the event. The checkpoint status
becomes `error`, `getProjection(name).error` names the position and message, and `rebuild()`
replays from 0.

## Common failure symptoms

| Symptom | Cause | Fix |
|---|---|---|
| `not_found` from `readProjection` | the name is not registered, or not marked `public` | mark it `public` |
| `[]` but you expect rows | a different tenant, or nothing matched yet | the prefix filter is per tenant by design |
| `rebuild_required` | you bumped `version` | expected; call `rebuild()` |
| the projection stops advancing | `apply` threw | read `getProjection(name).error` |
| `Runtime.idle()` times out | an outbox item is available, or a projection is behind | check `listOutbox` and the checkpoints |
| another tenant sees your rows | you did not prefix the key with the tenant | use `${event.tenant}/…` |

## Related

- [add-a-capability.md](add-a-capability.md) — writing behavior.
- [../subsystems/durable-state.md](../subsystems/durable-state.md) — the runner's guarantees.
- [../explanation/why-projection-not-storage.md](../explanation/why-projection-not-storage.md) — the
  invariant you are participating in.
- [../security.md](../security.md) — the erasure and tenant rules.

## Source trail

- `packages/projections/src/types.ts` — `Projection`, `ProjectionState`, `ProjectionWrite`.
- `packages/projections/src/runner.ts` — `catchUp`, `rebuild`, `retry`, `applyBatch`.
- `packages/runtime-bun/src/runtime.ts:107-122` — runner construction and the non-persistent
  cognition rebuild.
- `packages/runtime-bun/src/service.ts:217-223` — `readProjection`'s tenant filter.
- `packages/cognitive-api/src/indexer.ts` — the erasure-aware projection.
- `packages/client/src/index.ts:258-298` — `ProjectionStore`.
- `tests/integration/rebuild.test.ts`, `packages/projections/test/projections.test.ts`.
