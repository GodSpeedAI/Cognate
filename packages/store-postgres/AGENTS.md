# store-postgres

- `src/index.ts` exports `openPostgresStore`/`PostgresStoreOptions`; `src/schema.ts` holds numbered
  migrations mirroring the SQLite store's logical tables. Do not edit `packages/events` (the
  contract) or the conformance kit.
- Commits that append events must lock the position-counter row (`store_meta`) FIRST and hold it
  until commit: that lock is what makes position order equal commit order across processes. Do not
  move it after the stream/record CAS phases.
- jsonb values must go through `sql.json` (via the `jsonb()` helper) and read back through
  `::text` + `json()`; the driver's jsonb pre-parsing varies with connection type fetching.
- `onCommitted` delivers local commits directly and foreign commits through the LISTEN drain; keep
  the instance-id skip and the cursor advance on the local path, or listeners double-deliver.
- Run `bun test ./packages/store-postgres` after any change (needs `just db-up`).
