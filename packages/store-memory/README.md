# @godspeedai/cognate-store-memory

An in-memory Cognate event store with the same observable semantics as
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite):
atomic multi-part commits, optimistic concurrency, idempotent commits, an outbox, projection
checkpoints, content-addressed blobs, and payload erasure.

**When to use this package:** tests, examples, and throwaway prototypes. Everything lives in
process memory — nothing survives a restart — so production applications that must outlive the
process need the SQLite store instead. Both implement the same
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) store
contract, so an app can switch between them with one line.

## Installation

```sh
bun add @godspeedai/cognate-store-memory
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## Quick start

```ts
import { createMemoryStore } from "@godspeedai/cognate-store-memory";

const store = createMemoryStore();

const outcome = await store.commit({
  idempotency: { scope: "alice:order", key: "order-1", fingerprint: "fp-1" },
  appends: [
    {
      streamId: "order-1",
      expectedVersion: 0,
      events: [
        {
          eventType: "order.placed",
          schemaVersion: 1,
          occurredAt: new Date().toISOString(),
          tenant: "tenant-a",
          correlationId: "corr-1",
          causationId: null,
          runId: null,
          scopeId: "root",
          payload: { sku: "widget", quantity: 2 },
        },
      ],
    },
  ],
  result: { placed: true },
});
// { kind: "committed", events: [...], records: [], result: { placed: true } }
```

Pass the store to `createRuntime` from
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
for an ephemeral runtime — fast to create, isolated per test:

```ts
const runtime = await createRuntime({ store: { store: createMemoryStore() } /* agents, policy, ... */ });
```

(The runtime's `store: ":memory:"` shortcut is a different store — the SQLite implementation
running on a database that is never written to a file. Equally ephemeral, but with SQLite's
durability configuration behind it.)

## What the store guarantees

- **Atomic decisions.** Stream appends, record writes, outbox intents, and the idempotency result
  commit together; a failure in any part leaves none of it visible.
- **Optimistic concurrency.** Appending against a stale stream version throws `ConcurrencyError`;
  a stale record write throws `RecordConflictError`. Exactly one of several racing writers wins.
- **Idempotency.** A repeated key returns the recorded result without writing a second fact; a
  reused key with a different request fingerprint throws `IdempotencyMismatchError`.
- **Deterministic ordering.** Reads come back by per-stream sequence and store-wide position, and
  key/id listings use code-point order — the same order the SQLite store produces, so replay
  comparisons are store-independent.
- **Erasure.** `erasePayload` nulls the payload, keeps the envelope, and appends a tombstone event
  to the `$erasures` stream.

Commits are serialized internally (a promise queue), so concurrent `commit` calls resolve one at a
time even though the API is async. Every value returned from the store is a deep copy; mutating a
result never affects store state.

## Limitations

- **Not persistent.** All state lives in process memory and disappears when the process exits.
  There is no `reopen`, no durability, and no backup story — use
  [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
  when data must survive.
- **Single process.** The store exists only inside the process that created it; it cannot be shared
  across processes or machines.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) — the
  store contract and conformance kit this package implements.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) —
  the durable implementation of the same contract.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella;
  the easiest way to get a runtime (this store backs its ephemeral mode).

## License

Apache-2.0
