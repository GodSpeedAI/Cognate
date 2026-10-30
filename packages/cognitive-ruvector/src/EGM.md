# cognitive-ruvector source

## Overview
The RuVector-backed `CognitiveIndex`, the reference cognitive implementation; it declares `vector_search` only, per ADR-0004 / DEBT-007 [src/index.ts:createRuVectorIndex]. RuVector is used purely as a similarity-search accelerator while all provenance lives in an adapter-owned map that is the only source of truth for `get` and the only place tenant and scope filtering happens. The package is a single module [package.json:exports].

## Interface
- `createRuVectorIndex(options)` — returns a `CognitiveIndex`; `RuVectorIndexOptions` carries `dimension`, `storagePath`, `id` [src/index.ts:createRuVectorIndex]
- Internal `NativeVectorDb` and `NativeSearchHit` describe the `@ruvector/core` surface actually used [src/index.ts:NativeVectorDb]

## Invariants
- `storagePath` is required because RuVector otherwise persists to `./ruvector.db` in the working directory (DEBT-007) [src/index.ts:RuVectorIndexOptions]
- Any pre-existing file at `storagePath` is removed on open, so RuVector can never serve an entry the adapter has no provenance for [src/index.ts:createRuVectorIndex]
- `flags` is the singleton set `vector_search`; no other cognitive capability is claimed [src/index.ts:createRuVectorIndex]
- The whole `upsert` batch is dimension-validated before any native insert or map write happens [src/index.ts:createRuVectorIndex]
- Native upsert is delete-then-insert, so it is idempotent by id regardless of `@ruvector/core` replace semantics [src/index.ts:nativeUpsertOne]
- `similar` overfetches and grows `k` until enough matches are found or every entry has been considered, because RuVector cannot filter server-side [src/index.ts:createRuVectorIndex]
- Hits without adapter provenance, another tenant, or a scope outside `scopeIds` are dropped; the returned score is `1 / (1 + distance)` [src/index.ts:createRuVectorIndex]
- `clear` deletes every known id explicitly because RuVector has no truncate call; `close` only releases the adapter map [src/index.ts:createRuVectorIndex]

## Side Effects
- The index does not survive a process restart even though the on-disk file would: derived cognitive state is rebuilt from events [src/index.ts:createRuVectorIndex]
- Removes a file on disk at `storagePath` on open [src/index.ts:createRuVectorIndex]
- Dynamic import of `@ruvector/core` and construction of a `VectorDb` with a Cosine metric [src/index.ts:createRuVectorIndex]
- Native insert, delete, and search calls per operation [src/index.ts:NativeVectorDb]

## Verification
- Run: `cd packages/cognitive-ruvector && bun test`
