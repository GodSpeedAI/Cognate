# @godspeedai/cognate-store-sqlite

Durable, transactional event storage for Cognate applications, built on `bun:sqlite`. One SQLite
file holds an application's entire authoritative history: events, records, idempotency results,
outbox intents, and blobs — committed atomically per decision.

**When to use this package:** any Cognate app that must survive restarts. Use
[`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory)
for tests and throwaway prototypes instead. Both implement the same
`@godspeedai/cognate-events` store contract, so an app can switch stores with one line.

## Installation

```sh
bun add @godspeedai/cognate-store-sqlite
```

Requires [Bun](https://bun.sh) >= 1.4.0 (the store uses Bun's built-in `bun:sqlite`).

## Quick start

```ts
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";

const store = openSqliteStore({ path: "./app.sqlite" });
```

Pass the store to `createRuntime` from
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun)
to make an entire agent runtime durable — `createRuntime` also accepts a file path directly
(`store: "./app.sqlite"`), which selects this store:

```ts
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const runtime = await createRuntime({ store: "./app.sqlite" /* agents, policy, ... */ });
```

The store implements the `DurableStore` contract from
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events):
`commit` applies an atomic batch per decision (stream appends with expected versions, record
compare-and-swap writes, outbox intents, idempotency results), and `ConcurrencyError` is thrown
when a concurrent writer loses a stream-version race.

## What the schema guarantees

Every committed decision is one SQLite transaction (`BEGIN IMMEDIATE`): envelope validation,
per-stream version checks, record compare-and-swap writes, outbox intents, and idempotency
recording succeed or roll back together. A duplicate idempotency key returns the originally
recorded result instead of re-applying the decision.

Durability is configured for correctness over speed: `journal_mode=WAL` with
`synchronous=FULL` (fsync on every commit), so a decision is never reported committed before
SQLite has confirmed it. Payload erasure overwrites freed pages (`secure_delete`) and
checkpoints the WAL, so erased content does not linger in sidecar files.

## Limitations

- **One writer process.** Concurrent `commit` calls in one process serialize naturally, but
  multiple processes writing the same file will hit `SQLITE_BUSY` after the 5-second busy
  timeout rather than being serialized by this store.
- **Back up carefully.** Copy the `.sqlite` file plus its `-wal`/`-shm` siblings only after a
  WAL checkpoint (or use SQLite's backup API) — a bare copy while WAL is active can miss
  committed data.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) — the
  store contract and conformance kit this package implements.
- [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) —
  the in-memory implementation of the same contract.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella;
  the easiest way to get a runtime backed by this store.

## License

Apache-2.0
