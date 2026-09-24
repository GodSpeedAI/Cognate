# @cognate/cognitive-api

Dependency-free `CognitiveIndex` contract, the standard recall pipeline, an event-driven
indexing projection, and the conformance kit every index implementation must pass (spec §14–16).

- `types.ts` — `CognitiveEntry`, `CognitiveIndex`, `Embedder`, `SourceResolver`, recall types.
- `recall.ts` — `createRecall`: embed → `similar` (tenant/scope pre-filter) → provenance
  post-filter → authorized fetch. Denied/missing sources drop silently; degrades to
  `{status:"degraded"}` on index/embedder failure, or throws `CognitionUnavailableError`
  when the caller passes `required: true`.
- `indexer.ts` — `cognitiveIndexer`: a `Projection` that embeds extracted documents and
  upserts them into a `CognitiveIndex`; removes entries whose source event is erased.
- `conformance.ts` — `cognitiveIndexConformance`, reused by every `CognitiveIndex` implementation.

See `@cognate/cognitive-memory` for the reference in-memory implementation.
