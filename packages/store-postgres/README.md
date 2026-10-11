# @godspeedai/cognate-store-postgres

Durable, transactional event storage for Cognate applications on PostgreSQL. Multiple processes
write the same database safely: position order equals commit order, outbox claims are atomic
across workers, and projection folds serialize by checkpoint.

**When to use this package:** apps that need more than one runtime process (or host) against one
authoritative store, or a database you can back up, monitor, and operate with normal PostgreSQL
tooling. Use
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
for a zero-dependency single-process file, or
[`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory)
for tests. All three implement the same `@godspeedai/cognate-events` store contract, so an app
can switch stores with one line.

## Installation

```sh
bun add @godspeedai/cognate-store-postgres
```

Requires [Bun](https://bun.sh) >= 1.4.0 and a PostgreSQL server (PostgreSQL 14 or newer;
PostgreSQL 18 is what the test matrix runs). Driver: [`postgres`](https://www.npmjs.com/package/postgres)
(pure JavaScript, no native build).

## Quick start

```ts
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";

const handle = await openPostgresStore({
  url: "postgres://postgres:postgres@127.0.0.1:5432/postgres",
  schema: "myapp", // tables live in one schema; create one per app or per test
});

const store = handle.store; // a DurableStore — pass to createRuntime or use directly
await store.commit({
  appends: [{ streamId: "case-1", expectedVersion: 0, events: [{ /* NewEvent */ }] }],
});
await handle.close();
```

## Multi-process behavior

- Every commit that appends events takes a short lock on one position-counter row, so store
  positions are allocated exactly in commit order across processes; record writes, outbox claims,
  and projection folds do not queue behind it.
- `onCommitted` listeners receive local commits immediately and other processes' commits through
  `LISTEN`/`NOTIFY` plus a cursor-based catch-up over the event log (with a small poll safety
  net), so a lost notification only delays delivery; it can never skip it.
- `claimOutbox` uses `FOR UPDATE SKIP LOCKED`: concurrent workers claim disjoint work with no
  waiting.
- Projection checkpoints are guarded by a row lock plus compare-and-swap, so two runners on the
  same projection never double-apply a batch.

## Notes and limitations

- Tables live in the `schema` you name (default `cognate`); the schema is created if absent, and
  schema migrations are versioned and serialized across processes.
- Durability follows PostgreSQL's defaults (`synchronous_commit=on`, `fsync=on`); the store does
  not relax them.
- `erasePayload` deletes the payload and keeps a tombstone envelope, as the store contract
  requires. PostgreSQL MVCC keeps the deleted bytes in dead tuples and WAL until autovacuum and
  WAL recycling; run `VACUUM <schema>.payloads` (or `just db-vacuum`) when an operator needs the
  physical pages reclaimed promptly. WAL segments recycle once checkpoints pass `max_wal_size`, so
  erased bytes in WAL age out on the same schedule — treat backups and archived WAL as retaining
  erased content per your retention policy.
- Ordering comparisons (record ids, projection keys) use byte order (`COLLATE "C"`), matching the
  other stores' code-point ordering.

## Related packages

- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the umbrella SDK.
- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) — the
  store contract, event envelope, and error types implemented here.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
  — the agent runtime; accepts this store via `store: { store }`.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite),
  [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory).

## License

Apache-2.0
