# cognitive-ruvector

## Overview

RuVector-backed reference implementation of the `CognitiveIndex` port from `@godspeedai/cognate-cognitive-api`, advertising only the `vector_search` flag `[src/index.ts:createRuVectorIndex]`. RuVector is used purely as a similarity accelerator: the adapter's own entry map is the sole source of provenance, the only authority for `get`, and the only place tenant/scope filtering happens `[src/index.ts:createRuVectorIndex]`. The entry point re-exports `createRuVectorIndex` and `RuVectorIndexOptions` from `./src/index.ts` `[package.json:exports]`, depending on `@godspeedai/cognate-cognitive-api` and `@ruvector/core` 0.1.32 `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the single adapter module `[src/index.ts:createRuVectorIndex]`
- test/ — `conformance.test.ts` and `reopen.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- `storagePath` is required so the adapter never falls back to `./ruvector.db` in the working directory `[src/index.ts:RuVectorIndexOptions]`
- The backing file is deleted on open, because the in-memory provenance map always starts empty `[src/index.ts:createRuVectorIndex]`
- `upsert` validates every embedding length before any native insert or map write `[src/index.ts:createRuVectorIndex]`
- Native upsert is delete-then-insert by id, making it idempotent regardless of RuVector's replace semantics `[src/index.ts:nativeUpsertOne]`
- `similar` overfetches, growing `k` until enough matches exist or every entry is considered, since RuVector cannot filter server-side `[src/index.ts:createRuVectorIndex]`
- Native distance scores are converted to similarity as `1 / (1 + score)` so higher means more similar `[src/index.ts:createRuVectorIndex]`
- A hit with no provenance entry is skipped and never disclosed `[src/index.ts:createRuVectorIndex]`
- `clear` deletes every known id explicitly because RuVector exposes no truncate call `[src/index.ts:createRuVectorIndex]`

## Global Side Effects

- Filesystem: `rmSync(storagePath, { force: true })` at open `[src/index.ts:createRuVectorIndex]`
- Native library load via dynamic `import("@ruvector/core")` and on-disk persistence through `VectorDb` `[src/index.ts:createRuVectorIndex]`

## Verification

- Run: `cd packages/cognitive-ruvector && bun test`
