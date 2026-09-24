# store-memory

Reference double, not a product database: everything lives in JS `Map`s/arrays
in `src/index.ts`, serialized via a promise-queue mutex around `commit`.

- Do not add persistence — that's `store-sqlite`'s job.
- Keep `src/index.ts` the single file; it must satisfy `DurableStore`
  unchanged and pass `packages/events/src/conformance.ts` verbatim.
- All returned values must be deep copies (see `test/isolation.test.ts`).
