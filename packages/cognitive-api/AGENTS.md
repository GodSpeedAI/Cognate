# AGENTS.md — cognitive-api

- `types.ts` and `conformance.ts` are the contract: do not change their behavior.
- `recall.ts`/`indexer.ts` must never leak index metadata as authoritative content —
  `RecallItem.value` always comes from the `SourceResolver`.
- Run `bun test` in this package and `tsc -p ../../tsconfig.json` before committing.
