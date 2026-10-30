# cognitive-api

## Overview

The `CognitiveIndex` port for cognitive retrieval (spec §14–16): an index, an embedder, and a source-resolver interface, plus the standard recall pipeline and an indexing projection that feeds an index from durable events `[src/types.ts:CognitiveIndex]`. The recall path is embed → similar → tenant/scope post-filter → authorized authoritative fetch, and results never exceed `k` `[src/recall.ts:createRecall]`. Two export maps exist: the package root re-exports `./types.ts`, `createRecall`, `CognitionUnavailableError`, and `cognitiveIndexer`, while `./conformance` maps to `./src/conformance.ts` `[package.json:exports]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — types, recall pipeline, indexing projection, and the index conformance kit `[src/index.ts:1]`
- test/ — `retrieval.test.ts`, `indexer.test.ts`, `fallback.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- Candidates are overfetched by a default factor of 4 per requested item before filtering `[src/recall.ts:createRecall]`
- Entries whose tenant or scope do not match the query are skipped during recall `[src/recall.ts:createRecall]`
- Denied or missing source resolutions are dropped without disclosure `[src/recall.ts:createRecall]`
- An unavailable index throws `CognitionUnavailableError` when `query.required`, otherwise returns `{ status: "degraded", items: [] }` with a reason `[src/recall.ts:createRecall]`
- Indexer entries record `indexerVersion` and `durable: true` on top of the extracted document `[src/indexer.ts:cognitiveIndexer]`
- The source-event → entry-id map is projection state under key `event:<id>`, so an erasure after restart still finds entries to remove `[src/indexer.ts:cognitiveIndexer]`
- A replayed event carrying an `erasure` is removed rather than re-indexed `[src/indexer.ts:cognitiveIndexer]`

## Global Side Effects

- Embedding calls through the injected `Embedder` at index time and at recall time `[src/recall.ts:createRecall]`
- Index mutation through the injected `CognitiveIndex` (`upsert`/`remove`) during projection apply `[src/indexer.ts:cognitiveIndexer]`
- Authoritative source resolution through the injected `SourceResolver` `[src/recall.ts:createRecall]`

## Verification

- Run: `cd packages/cognitive-api && bun test`
