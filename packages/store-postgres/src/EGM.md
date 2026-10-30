# packages/store-postgres/src — store adapter internals

## Overview

Four source files implement the PostgreSQL `DurableStore`: the store object and its pool, notification and migration plumbing `[packages/store-postgres/src/index.ts:openPostgresStore]`; the numbered migration statements and position-counter constant `[packages/store-postgres/src/schema.ts:migrations]`; an optional pg0 instance resolver `[packages/store-postgres/src/pg0.ts:resolvePg0Url]`; and a one-time SQLite importer `[packages/store-postgres/src/migrate-from-sqlite.ts:migrateSqliteToPostgres]`. Commits run in phases inside one transaction: validate envelopes, reserve positions, replay or mismatch idempotency, CAS stream versions, check fenced run ownership, append events, apply record writes, enqueue outbox intents, record the idempotency key, then notify `[packages/store-postgres/src/index.ts:commit]`.

## Interface

- `commit(request)` — returns `committed` or `duplicate` outcomes; a `DuplicateRaceError` loser replays the winner's recorded result or throws `IdempotencyMismatchError` `[packages/store-postgres/src/index.ts:commit]`
- `streamVersion`, `readStream`, `readAll`, `getEvent`, `onCommitted` — read paths and the listener registration that returns an unsubscribe function `[packages/store-postgres/src/index.ts:store]`
- `getRecord`, `listRecords` — record reads by collection and optional equality filter `[packages/store-postgres/src/index.ts:store]`
- `claimOutbox`, `claimOutboxLeased`, `renewOutboxLease`, `settleOutboxLease`, `settleOutbox`, `requeueOutbox`, `listOutbox` — the unleased and fenced-lease outbox surfaces `[packages/store-postgres/src/index.ts:claimOutbox]`
- `claimRunOwnership`, `renewRunOwnership`, `releaseRunOwnership` — fenced run-write ownership `[packages/store-postgres/src/index.ts:claimRunOwnership]`
- `getProjection`, `commitProjection`, `failProjection`, `readProjection`, `listProjection`, `readProjectionSnapshot`, `resetProjection` — projection checkpoints and state `[packages/store-postgres/src/index.ts:store]`
- `putBlob`, `getBlob`, `deleteBlob`, `erasePayload`, `close` — blob store, erasure, and teardown `[packages/store-postgres/src/index.ts:erasePayload]`
- `migrations()` and `POSITION_COUNTER_ID` — the migration list (versions 1–5) and counter row id `[packages/store-postgres/src/schema.ts:migrations]`
- `findPg0Bin(explicit?)` — resolves the pg0 binary from the option, `$COGNATE_PG0_BIN`, a `.tmp/pg0/pg0` ancestor, then `pg0` on PATH `[packages/store-postgres/src/pg0.ts:findPg0Bin]`
- `resolvePg0Url(options)` — returns the instance URL, starting the instance unless `noStart` `[packages/store-postgres/src/pg0.ts:resolvePg0Url]`
- `backupSqlite`, `migrateSqliteToPostgres`, `MigrationOptions`, `MigrationReport` — the importer `[packages/store-postgres/src/migrate-from-sqlite.ts:backupSqlite]`

## Invariants

- All envelopes are validated before a transaction opens, so a bad envelope never begins one `[packages/store-postgres/src/index.ts:commit]`
- The counter row is locked before any CAS, making allocation order commit order across processes `[packages/store-postgres/src/index.ts:commit]`
- A duplicate idempotency replay refunds its still-uncommitted position reservation `[packages/store-postgres/src/index.ts:commit]`
- A record write whose `WHERE version = expectedVersion` matches nothing raises `RecordConflictError` and aborts everything `[packages/store-postgres/src/index.ts:commit]`
- `pg_notify` is queued inside the transaction, so it is sent if and only if the decision commits `[packages/store-postgres/src/index.ts:commit]`
- `events` are append-only by trigger: DELETE always raises, and UPDATE raises if any envelope column changes `[packages/store-postgres/src/schema.ts:migrations]`
- Erasure tombstones derived idempotency results so replay cannot re-disclose erased content `[packages/store-postgres/src/index.ts:erasePayload]`
- Opening a schema whose recorded version exceeds the build's known maximum is refused `[packages/store-postgres/src/index.ts:migrate]`
- Every closed-store call fails via `assertOpen()` `[packages/store-postgres/src/index.ts:assertOpen]`
- The importer never modifies its SQLite source and reports checkpoints it could not verify as needing rebuild `[packages/store-postgres/src/migrate-from-sqlite.ts:migrateSqliteToPostgres]`

## Side Effects

- Pool connections, a LISTEN subscription, and an optional poll timer per open store `[packages/store-postgres/src/index.ts:listenMeta]`
- DDL: `CREATE SCHEMA IF NOT EXISTS`, per-version statements, and `DROP SCHEMA … CASCADE` `[packages/store-postgres/src/index.ts:dropSchema]`
- Child processes for the pg0 binary (`info`, then `start`) `[packages/store-postgres/src/pg0.ts:run]`
- Reads the SQLite source read-only and writes a `VACUUM INTO` backup file `[packages/store-postgres/src/migrate-from-sqlite.ts:backupSqlite]`
- Erased payload bytes persist in dead tuples and WAL until an operator vacuums `[packages/store-postgres/src/index.ts:erasePayload]`

## Verification

- Run: `cd packages/store-postgres && bun test`
