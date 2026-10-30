# packages/store-postgres — authoritative DurableStore on PostgreSQL

## Overview

Implements the `DurableStore` port against PostgreSQL for multi-process writers, where position order equals commit order because every event-appending transaction first locks a single counter row `FOR UPDATE` until commit `[packages/store-postgres/src/index.ts:1]`. Cross-process wake-ups ride on `pg_notify`, with a LISTEN connection draining the durable event log from a per-store cursor and a poll timer as the safety net `[packages/store-postgres/src/index.ts:9]`. The package also ships the numbered schema migrations, an optional pg0 driver for local instances, and a one-time SQLite-to-PostgreSQL import `[packages/store-postgres/src/schema.ts:1]`.

## Interface

- `openPostgresStore(options)` — opens the pool, migrates the schema, subscribes, and returns a handle `[packages/store-postgres/src/index.ts:openPostgresStore]`
- `PostgresStoreHandle` — `{ store: DurableStore; dropSchema(); close() }` `[packages/store-postgres/src/index.ts:PostgresStoreHandle]`
- `PostgresStoreOptions` — `url`, `schema` (default `cognate`), `maxConnections` (default 10), `pollMs` (default 250, `0` disables the timer), `debug` `[packages/store-postgres/src/index.ts:PostgresStoreOptions]`
- `PostgresStoreError` — the package's own error class, `name` set to `PostgresStoreError` `[packages/store-postgres/src/index.ts:PostgresStoreError]`
- Re-exported pg0 helpers: `findPg0Bin`, `resolvePg0Url`, `Pg0Options` `[packages/store-postgres/src/index.ts:42]`
- Runtime dependencies `postgres` `^3.4.9` and `@godspeedai/cognate-events`; the SQLite store is dev-only `[packages/store-postgres/package.json:dependencies]`
- Subdirectories: [src](./src/EGM.md) — the store implementation, schema, pg0 driver, and importer
- `test/` — conformance, commit order, idempotency pool, run ownership, schema version, driver smoke, and import tests

## Invariants

- Schema names must match `^[a-z_][a-z0-9_]*$` after lowercasing, because some DDL positions splice the name unquoted `[packages/store-postgres/src/index.ts:159]`
- Connective settings are PostgreSQL defaults; nothing relaxes `synchronous_commit`, `fsync`, or `full_page_writes` `[packages/store-postgres/src/index.ts:163]`
- Positions are gap-free: an aborted transaction's allocation rolls back with it `[packages/store-postgres/src/schema.ts:POSITION_COUNTER_ID]`
- Erasure deletes the payload row while the envelope survives, which is why the event select uses a LEFT JOIN `[packages/store-postgres/src/index.ts:eventSelect]`
- JSON null is bound as the `'null'::jsonb` literal, since these jsonb columns are `NOT NULL` `[packages/store-postgres/src/index.ts:jsonb]`
- The notify channel is `${schema}_committed` when within PostgreSQL's 63-byte identifier limit, otherwise a hashed `cognate_…` name `[packages/store-postgres/src/index.ts:channel]`
- Each store skips its own notifications by comparing an `instanceId` carried in the payload `[packages/store-postgres/src/index.ts:instanceId]`
- Tests read the server URL from `COGNATE_TEST_POSTGRES_URL`, defaulting to `postgres://postgres:postgres@127.0.0.1:5432/postgres` `[packages/store-postgres/test/conformance.test.ts:8]`

## Side Effects

- Opens a `postgres` pool and, if `pollMs` is non-zero, a `setInterval` poll timer `[packages/store-postgres/src/index.ts:274]`
- Holds a dedicated LISTEN connection; `close()` unlistens, stops the poll, and ends the pool `[packages/store-postgres/src/index.ts:885]`
- `dropSchema()` runs `DROP SCHEMA … CASCADE` through an ephemeral connection `[packages/store-postgres/src/index.ts:dropSchema]`
- Migrations acquire `pg_advisory_xact_lock` and create the schema/search_path inside one transaction `[packages/store-postgres/src/index.ts:913]`

## Verification

- Run: `cd packages/store-postgres && bun test`
