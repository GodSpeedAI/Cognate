# store-sqlite

## Overview

`package.json` declares `@godspeedai/cognate-store-sqlite` at version `0.8.0`: the authoritative `DurableStore` on `bun:sqlite`. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the store and its numbered migrations live in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `openSqliteStore`, the exported `buildListRecordsQuery`, and the `MIGRATIONS` list in `schema.ts`
- test: `conformance.test.ts`, `erasure-file.test.ts`, `parent-dir.test.ts`, `runs-index.test.ts`, `schema-version.test.ts` (not contract targets)

## Global Invariants

- The only runtime dependency is `@godspeedai/cognate-events`, so the store implements the port and reuses its error types `[packages/store-sqlite/package.json:dependencies]`
- The store is a single-process writer on a SQLite file, a `:memory:` database, or a `file:` URI `[packages/store-sqlite/src/index.ts:openSqliteStore]`
- A missing parent directory is created before the database opens `[packages/store-sqlite/src/index.ts:openSqliteStore]`
- Migrations are numbered and recorded in `schema_versions`, and a failing migration closes the database before rethrowing `[packages/store-sqlite/src/schema.ts:MIGRATIONS, packages/store-sqlite/src/index.ts:openSqliteStore]`
- Parity with the memory store is proven by the shared `storeConformance` suite `[packages/store-sqlite/test/conformance.test.ts:storeConformance]`

## Global Side Effects

- Creates the database file and its parent directory, and writes the WAL `[packages/store-sqlite/src/index.ts:openSqliteStore]`
- Sets `secure_delete = ON` so erased payload bytes are overwritten in place rather than merely unlinked `[packages/store-sqlite/src/index.ts:openSqliteStore]`

## Verification

- Run: `cd packages/store-sqlite && bun test`
