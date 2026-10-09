# @godspeedai/cognate-events

The durable state plane contract for Cognate: the canonical event envelope, the `DurableStore` port every store implements, and an outbox dispatcher for work that happens after commit. This package defines the contract — it ships no storage.

**When to use this package:** you are implementing a durable store, building tooling over an event log, or delivering outbox work yourself. Applications get a working store through
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
or [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory),
both of which implement this contract.

## Installation

```sh
bun add @godspeedai/cognate-events
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## The envelope

`NewEvent` is what a decision submits. The store assigns `eventId`, `streamId`, `streamSequence` (gap-free per stream), `position` (store-wide commit order), and `recordedAt`. Sequence and position are the ordering authority — `occurredAt` is source-claimed provenance and never orders events.

`validateNewEvent` enforces the envelope before anything is written: required fields present, lower-case dotted `eventType`, positive integer `schemaVersion`, ISO-8601 `occurredAt`, a JSON payload within 1 MiB (`MAX_PAYLOAD_BYTES`). Failures throw `EnvelopeValidationError` listing every problem.

`fingerprint` computes a stable, key-order-independent SHA-256 of a JSON request — what idempotency uses to tell a replay apart from a different request.

## Quick start

```ts
import { fingerprint, validateNewEvent } from "@godspeedai/cognate-events";

const placed = {
  eventType: "order.placed",
  schemaVersion: 1,
  occurredAt: new Date().toISOString(),
  tenant: "tenant-a",
  correlationId: "corr-1",
  causationId: null,
  runId: null,
  scopeId: "root",
  payload: { sku: "widget", quantity: 2 },
};
validateNewEvent(placed);

const commit = {
  idempotency: { scope: "alice:order", key: "order-1", fingerprint: fingerprint(placed.payload) },
  appends: [{ streamId: "order-1", expectedVersion: 0, events: [placed] }],
  result: { placed: true },
};
```

Hand `commit` to any `DurableStore` — here the in-memory one:

```ts
import { createMemoryStore } from "@godspeedai/cognate-store-memory";

const store = createMemoryStore();
const outcome = await store.commit(commit);
// { kind: "committed", events: [...], records: [], result: { placed: true } }
```

Committing the same request again returns `{ kind: "duplicate", result: { placed: true } }` — the originally recorded result, with no new fact written. Reusing the key for a different request throws `IdempotencyMismatchError`.

## What `DurableStore` covers

One atomic `commit` per decision — all of it or nothing:

- stream appends guarded by expected versions (a lost race throws `ConcurrencyError`; reread and retry, never overwrite);
- compare-and-swap record writes (`RecordConflictError`);
- outbox intents for work to perform after commit;
- the idempotency result recorded with the decision.

Beyond `commit`: `readStream`/`readAll` page in sequence and position order, `getRecord`/`listRecords` read versioned records, `onCommitted` subscribes to events (called only after the transaction commits), projection checkpoints commit atomically with projection state, blobs are content-addressed (`sha256:<hex>`), and `erasePayload` removes an event's payload while keeping its envelope and appending a tombstone event to the `$erasures` stream.

## Delivering outbox work

`OutboxDispatcher` claims committed intents and delivers them at least once, with bounded exponential backoff:

```ts
import { OutboxDispatcher } from "@godspeedai/cognate-events";

const dispatcher = new OutboxDispatcher(store, {
  topic: "email",
  backoff: { baseMs: 100, maxMs: 5_000, maxAttempts: 10 },
  deliver: async (item) => {
    await sendEmail(item.payload);
    return { accepted: item.id };
  },
});

const report = await dispatcher.drain();
// { delivered: [...], retried: [{ id, retryAt }], poisoned: [...] }
```

Throw `PermanentDeliveryError` from `deliver` to poison an item immediately instead of retrying. Poisoned items stay visible via `store.listOutbox({ status: "poisoned" })` until an operator calls `store.requeueOutbox`. Delivery targets must deduplicate by `item.id` — at-least-once delivery means a retry can deliver twice.

## Conformance kit for store implementers

Implementing a store means implementing it correctly; run the kit unchanged in your test suite:

```ts
import { storeConformance } from "@godspeedai/cognate-events/conformance";

storeConformance("my-store", myStoreFactory, { persistent: true });
```

Pass `persistent: false` for stores that do not survive a reopen; persistent stores are additionally tested to keep every committed decision across one. Reference implementations: [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) and [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite).

## Limitations

- No storage here: the `DurableStore` interface is the product. Pick an implementation or write one.
- Event payloads are capped at 1 MiB; larger content belongs in a blob.
- Ordering is defined by sequence numbers and positions, never by timestamps.

## Related packages

- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) — the durable SQLite implementation of this contract.
- [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) — the in-memory implementation for tests and ephemeral runtimes.
- [`@godspeedai/cognate-projections`](https://www.npmjs.com/package/@godspeedai/cognate-projections) — checkpointed derivations over the log this package defines.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the reference runtime that uses a store through this contract.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
