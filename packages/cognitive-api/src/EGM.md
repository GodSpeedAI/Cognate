# cognitive-api source

## Overview
The dependency-free `CognitiveIndex` contract, the standard retrieval pipeline, the indexing projection, and the index conformance kit (package description; [package.json:description]). No adapter type may appear in `types.ts`; the contract is deliberately portable [src/types.ts:1]. `./conformance` is a separate entry point for adapter authors [package.json:exports].

## Interface
- `CognitiveIndex` — `flags`, `dimension`, `upsert`, `remove`, `similar`, `get`, optional `related`, `count`, `clear`, `close` [src/types.ts:CognitiveIndex]
- `CognitiveEntry`, `SimilarQuery`, `CognitiveFlag`, `SourceType`, `Embedder`, `SourceResolver`, `SourceResolution` [src/types.ts:CognitiveEntry]
- `RecallQuery`, `RecallItem`, `RecallResult` [src/types.ts:RecallResult]
- `createRecall(options)` and `CognitionUnavailableError`, `RecallOptions` [src/recall.ts:createRecall]
- `cognitiveIndexer(options)`, `IndexDocument`, `IndexerOptions` [src/indexer.ts:cognitiveIndexer]
- `cognitiveIndexConformance(name, make)`, `entry(...)` on the `./conformance` entry [src/conformance.ts:cognitiveIndexConformance]

## Invariants
- `flags` must be honest: a capability is declared only when the implementation's fixtures prove it [src/types.ts:CognitiveIndex]
- `upsert` is idempotent by entry id, so at-least-once projection replay is safe [src/types.ts:CognitiveIndex]
- Retrieval order is embed, `similar` with `k * overfetch` (default 4), tenant and scope post-filter, then authorized authoritative resolve [src/recall.ts:createRecall]
- Denied or missing sources are dropped without disclosure and the result never exceeds `k` [src/recall.ts:createRecall]
- An unavailable index returns `degraded` with an empty item list, or throws `CognitionUnavailableError` when `required` is set [src/recall.ts:createRecall]
- The indexer projects an `erasure.recorded` payload and any event carrying `erasure` into entry removal, keyed by projection state `event:<id>` [src/indexer.ts:cognitiveIndexer]
- Extracted metadata must never carry restricted content; the authoritative source keeps the content [src/indexer.ts:IndexerOptions]
- `CognitiveEntry.sourceRef` is the route back to truth, e.g. `event:<eventId>` or `run:<id>` [src/types.ts:CognitiveEntry]

## Side Effects
- Embedder calls and index upsert/remove per applied event [src/indexer.ts:cognitiveIndexer]
- Projection state writes returning the source-event to entry-id map [src/indexer.ts:cognitiveIndexer]

## Verification
- Run: `cd packages/cognitive-api && bun test`
