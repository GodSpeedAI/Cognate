# @godspeedai/cognitive-memory

Reference `CognitiveIndex` implementation: exact cosine similarity over an in-memory map,
plus a deterministic hashing embedder for tests and offline fallback.

- `createMemoryIndex({ dimension, id? })` — flags `vector_search`, `graph_traversal`,
  `temporal_search`. Always filters by tenant; filters by scope when `scopeIds` is given.
  `related` does breadth-first traversal over `relationships` (ordered by discovery, no
  duplicates, excludes the start id, optional `types` filter). Rejects `upsert` of the
  wrong embedding dimension. Stores and returns defensive `Float32Array` copies.
- `hashingEmbedder(dimension)` — lowercases, tokenizes on non-alphanumerics, feature-hashes
  tokens into `dimension` signed buckets (FNV-1a), L2-normalizes. Empty text → zero vector.

Passes `cognitiveIndexConformance` from `@godspeedai/cognitive-api/conformance`.
