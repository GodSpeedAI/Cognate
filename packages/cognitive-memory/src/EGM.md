# cognitive-memory / src — in-process cosine index and hashing embedder

## Overview

`createMemoryIndex` is a `CognitiveIndex` backed by a plain `Map`, ranking by exact cosine similarity with no approximation `[index.ts:createMemoryIndex]`. It declares the flags `vector_search`, `graph_traversal`, and `temporal_search`, the last two realized through entry relationships and tenant/scope filters `[index.ts:createMemoryIndex]`. `hashingEmbedder` is an FNV-1a feature-hashing bag-of-words embedder, explicitly not semantic, used for tests and offline fallback `[index.ts:hashingEmbedder]`.

## Interface

- `createMemoryIndex` — `upsert`, `remove`, `similar`, `get`, `related`, `count`, `clear`, `close` over a fixed `dimension` `[index.ts:createMemoryIndex]`
- `hashingEmbedder` — returns an `Embedder` with id `hashing` and the requested dimension `[index.ts:hashingEmbedder]`
- `cosineSimilarity` — internal dot-product cosine returning 0 for a zero norm `[index.ts:cosineSimilarity]`
- `hashText` / `fnv1a` — internal token hashing to a bucket and sign, then L2 normalization `[index.ts:hashText]`

## Invariants

- Every entry's embedding length is validated against `dimension` before any entry in the batch is stored, so a bad batch writes nothing `[index.ts:createMemoryIndex]`
- Stored entries and returned entries are deep copies; a caller cannot mutate index state through a reference `[index.ts:copyEntry]`
- `similar` filters by tenant first, then by `scopeIds` when that list is non-empty, then sorts descending by score and slices to `k` `[index.ts:createMemoryIndex]`
- `related` performs breadth-first traversal bounded by `depth`, de-duplicates visited ids, and filters by relationship `types` when given `[index.ts:createMemoryIndex]`
- `related` on an unknown id returns an empty list rather than throwing `[index.ts:createMemoryIndex]`
- `hashingEmbedder` output is L2-normalized whenever the accumulated norm is positive `[index.ts:hashText]`

## Side Effects

- None. All state is process memory and no clock, filesystem, or network call is made `[index.ts:createMemoryIndex]`

## Verification

- Run: `cd packages/cognitive-memory && bun test`
