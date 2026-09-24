# store-sqlite

- `src/index.ts` exports `openSqliteStore`/`SqliteStoreOptions`; `src/schema.ts` holds numbered
  migrations. Do not edit `packages/events` (the contract) or the conformance kit.
- `commit` must stay a single `BEGIN IMMEDIATE` transaction; keep it free of `await` before the
  transaction call so same-process concurrent commits serialize correctly.
- Run `bun test ./packages/store-sqlite ./tests/integration/crash.test.ts` after any change.
