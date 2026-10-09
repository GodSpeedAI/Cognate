# @godspeedai/cognate-cognitive-ruvector

A Cognate `CognitiveIndex` backed by [RuVector](https://www.npmjs.com/package/@ruvector/core),
a native vector-search library. This adapter uses RuVector purely as a similarity-search
accelerator and keeps all entry provenance (tenant, scope, source references, metadata) in
the adapter itself, where tenant isolation can be enforced.

**When to use this package:** you want faster-than-linear vector search in the same process
and accept that this index is *derived, non-persistent* state rebuilt from your event stream.
For a durable vector index with snapshots, use
[`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf);
for tests and small datasets,
[`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory).

## Installation

```sh
bun add @godspeedai/cognate-cognitive-ruvector
```

Requires [Bun](https://bun.sh) >= 1.4.0. The external dependency
[`@ruvector/core`](https://www.npmjs.com/package/@ruvector/core) (version `0.1.32`, pinned)
is installed automatically as a regular dependency — it is the native vector database engine
that performs insertion, deletion, and cosine similarity search over stored vectors. The SDK
ships Bun-native TypeScript source, so add `@types/bun` and `@types/node` as dev dependencies
when typechecking your project.

## Quick start

```ts
import { createRuVectorIndex } from "@godspeedai/cognate-cognitive-ruvector";

// `storagePath` is required: without it RuVector would write ./ruvector.db
// into the current working directory.
const index = await createRuVectorIndex({ dimension: 8, storagePath: "./cognition.rvdb" });

console.log([...index.flags]); // ["vector_search"] — the only capability it declares

await index.upsert([/* CognitiveEntry values with 8-dimensional embeddings */]);

const hits = await index.similar({
  vector: new Float32Array(8),
  k: 5,
  tenant: "tenant-a",          // required; scopeIds: ["root"] optional
});
// hits: [{ id, score }] — higher score = more similar

await index.close();
```

## What persists — and what does not

**Nothing persists across restarts, by design.** RuVector would happily reload its on-disk
file at `storagePath`, but this adapter's provenance map (the only source of tenant, scope,
and source-ref information) starts empty every process. To guarantee RuVector never serves an
entry the adapter has no provenance for, opening the index **deletes and recreates the
backing file**. Treat this index as a cache: rebuild it after a restart by replaying events
through the indexer projection from
[`@godspeedai/cognate-cognitive-api`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-api).

## Filtering constraints

- Tenant and scope filtering happens **in this adapter, not in RuVector**: RuVector's own
  filter option cannot be relied on in this version. `similar` therefore requests extra
  candidates, drops every hit without matching provenance or outside the query's tenant and
  scopes, and widens the request if too few matches survive — correctness over speed. A
  candidate with no provenance in the adapter is never disclosed, whatever its id.
- The index declares exactly `vector_search`. There is no `related` (graph traversal) and no
  temporal search, because the underlying library exposes no such API.
- RuVector's search returns a distance (0 = identical); the adapter converts it to a
  similarity score (`1 / (1 + distance)`) so higher always means more similar.

## Limitations

- Not a persistence layer (see above); do not point `storagePath` at a file you care about —
  it is reset on every open.
- The overfetch-and-filter loop can scan the entire entry set when tenant/scope filters are
  highly selective; size your expectations accordingly.
- Single process: concurrent writers from multiple processes are not supported.
- `clear()` deletes every known id individually; RuVector has no bulk truncate.

## Related packages

- [`@godspeedai/cognate-cognitive-api`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-api) —
  the `CognitiveIndex` contract, recall pipeline, indexer projection, and conformance kit.
- [`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory) —
  the in-process exact-cosine fallback.
- [`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf) —
  the durable, snapshot-capable RVF-backed index.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
