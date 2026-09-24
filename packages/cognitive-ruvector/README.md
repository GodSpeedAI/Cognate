# @cognate/cognitive-ruvector

RuVector-backed reference `CognitiveIndex` (ADR-0004). `createRuVectorIndex({ dimension, storagePath, id? })`.

## Flags

Exactly `{"vector_search"}`. No `graph_traversal`/`temporal_search`; `related` is absent.
`@ruvector/core@0.1.32` exposes no graph/relationship/temporal API (DEBT-007).

## Adapter-owned filtering

RuVector's `search` `filter` option does not actually filter (DEBT-007). Tenant/scope
enforcement, and all provenance returned by `get`, come from an adapter-owned in-memory map of
full `CognitiveEntry` values. `similar` overfetches from RuVector and filters by tenant/scopeIds
here, growing `k` up to the total entry count if too few matches survive filtering — correctness
over speed. RuVector never discloses another tenant's id.

RuVector's `search` returns a distance (0 = identical); scores are converted via `1 / (1 +
distance)` so higher = more similar, matching the contract.

## Non-persistence

RuVector's on-disk file at `storagePath` would reload prior vectors on reopen, but the adapter
map (the only source of provenance) would not — so on open, the backing file is reset. This
index is **not** a persistence layer; it is derived state, rebuilt from events by the indexer
projection. See `test/reopen.test.ts`.
