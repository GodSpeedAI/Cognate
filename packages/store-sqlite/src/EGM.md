# store-sqlite / src — authoritative DurableStore on bun:sqlite

## Overview

The authoritative `DurableStore` implementation over `bun:sqlite`, single-process writer `[index.ts:1]`. It exports `openSqliteStore`, `buildListRecordsQuery`, and the `SqliteStoreOptions` type `[index.ts:openSqliteStore]`. Schema is created by numbered migrations recorded in `schema_versions`, and payloads live in a table separate from event envelopes so erasure can delete content while causality columns survive `[schema.ts:1]`.

## Interface

- `openSqliteStore` — opens or creates the database, applies PRAGMAs, and migrates `[index.ts:openSqliteStore]`
- `SqliteStoreOptions` — a file path, `":memory:"`, or a `file:` URI `[index.ts:SqliteStoreOptions]`
- `buildListRecordsQuery` — builds the parameterized record query for a collection plus `where` `[index.ts:buildListRecordsQuery]`
- `MIGRATIONS` / `Migration` — ordered numbered migration list `[schema.ts:MIGRATIONS]`
- `migrate` — applies pending migrations to a database `[schema.ts:migrate]`
- `mapEventRow` / `mapRecordRow` — row-to-port-shape mappers `[index.ts:mapEventRow]`
- `EVENT_SELECT` — the envelope query left-joining `payloads` `[index.ts:EVENT_SELECT]`

## Invariants

- Durability is `journal_mode = WAL` with `synchronous = FULL`, so a commit is fsynced before it is reported committed `[index.ts:openSqliteStore]`
- `foreign_keys = ON`, `busy_timeout = 5000`, and `secure_delete = ON` are always set `[index.ts:openSqliteStore]`
- A parent directory is created only when the path is neither `":memory:"` nor a `file:` URI `[index.ts:openSqliteStore]`
- A migration failure closes the database handle before rethrowing `[index.ts:openSqliteStore]`
- Any operation after `close()` throws `store-sqlite: store is closed` `[index.ts:assertOpen]`
- Event payloads are stored in a separate `payloads` table so `erasePayload` leaves no content in the envelope `[schema.ts:1]`
- `events` enforces `UNIQUE (stream_id, stream_sequence)` and `event_id` uniqueness `[schema.ts:MIGRATIONS]`
- Run listing picks the most selective available index, preferring `correlationId` or `agent` over `tenant` alone `[index.ts:RUNS_INDEX_PRIORITY]`

## Side Effects

- Filesystem: creates the database file and parent directory, writes WAL and journal files `[index.ts:openSqliteStore]`
- Process-level SQLite handle held open until `close()` `[index.ts:assertOpen]`
- fsync on every commit due to `synchronous = FULL` `[index.ts:openSqliteStore]`

## Verification

- Run: `cd packages/store-sqlite && bun test`
