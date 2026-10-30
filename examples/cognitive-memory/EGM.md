# cognitive-memory — semantic recall over authoritative facts

## Overview
This script builds an in-memory cognitive index from two embedded facts, then runs a
recall query through the cognitive API. It proves the ordered pipeline the docs
describe: embed, similarity rank, authorize, resolve against the authoritative
source — and that a denied resolution drops the item rather than leaking text.

## Interface
- `createMemoryIndex` — in-memory vector index constructed with `{ dimension }` `[examples/cognitive-memory/index.ts:createMemoryIndex]`
- `hashingEmbedder` — deterministic embedder of the same `dimension`, exposing `embed(strings)` `[examples/cognitive-memory/index.ts:hashingEmbedder]`
- `index.upsert` — accepts full index records including `sourceType`, `sourceRef`, `tenant`, `scopeId`, `eventRef`, `embedding`, `metadata`, validity bounds, `indexerVersion`, and `durable` `[examples/cognitive-memory/index.ts:index.upsert]`
- `createRecall` — composes `{ index, embedder, resolver }` into a recall pipeline `[examples/cognitive-memory/index.ts:createRecall]`
- `recall.recall` — query shape `{ text, actor, tenant, scopeIds, k }` returning `{ status, items }` `[examples/cognitive-memory/index.ts:recall.recall]`
- `Principal` — the actor type imported from `@godspeedai/cognate-kernel-api` `[examples/cognitive-memory/index.ts:Principal]`

## Invariants
- Recall must return `status === "ok"` before items are inspected `[examples/cognitive-memory/index.ts:result.status]`.
- With `k: 1`, the top item must be `case:1` (the duplicate-payment fact), so ranking is checked rather than mere retrieval `[examples/cognitive-memory/index.ts:result.items]`.
- The resolver denies `mallory` with `{ kind: "denied" }`, and a denied recall must return zero items `[examples/cognitive-memory/index.ts:resolver]`.
- The resolver reads from a separate authoritative `Map` keyed by `sourceRef`, so index metadata is never treated as truth `[examples/cognitive-memory/index.ts:authoritative]`.

## Side Effects
- No persistence and no network: the index is in-memory and the embedder is a local hash function `[examples/cognitive-memory/index.ts:hashingEmbedder]`.
- Fact validity is pinned to the literal `"2026-01-01T00:00:00Z"` rather than the wall clock `[examples/cognitive-memory/index.ts:facts]`.

## Verification
- Run: `bun run example:cognitive-memory`
