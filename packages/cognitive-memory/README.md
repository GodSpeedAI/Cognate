# @godspeedai/cognate-cognitive-memory

The dependency-free fallback for Cognate semantic recall: an in-process `CognitiveIndex` with
exact cosine similarity, plus a deterministic hashing embedder. Nothing to install, no
network, no native code.

**When to use this package:** tests, small datasets, and offline development — or as the
correctness baseline other index implementations are compared against. For large corpora or
durable vector files, use
[`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector)
or
[`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf)
instead.

## Installation

```sh
bun add @godspeedai/cognate-cognitive-memory
```

Requires [Bun](https://bun.sh) >= 1.4.0. The SDK ships Bun-native TypeScript source, so add
`@types/bun` and `@types/node` as dev dependencies when typechecking your project.

## Quick start

```ts
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";

const dimension = 8;
const index = createMemoryIndex({ dimension }); // id defaults to "memory"
const embedder = hashingEmbedder(dimension);

const [vector] = await embedder.embed(["Refunds are approved by a manager."]);
await index.upsert([{
  id: "doc-1",
  sourceType: "knowledge",
  sourceRef: "knowledge:refund-policy", // the route back to authoritative content
  tenant: "tenant-a",
  scopeId: "root",
  semanticRef: null,
  eventRef: null,
  traceRef: null,
  embedding: vector!,
  metadata: { title: "Refund policy" }, // non-sensitive metadata only
  relationships: [],                    // e.g. [{ type: "about", target: "doc-2" }]
  validFrom: new Date().toISOString(),
  validTo: null,
  indexerVersion: "1",
  durable: true,
}]);

const [query] = await embedder.embed(["who approves refunds?"]);
const hits = await index.similar({ vector: query!, k: 3, tenant: "tenant-a" });
// [{ id: "doc-1", score: ... }] — highest similarity first

console.log(await index.count()); // 1
await index.close();
```

## Behavior

- **Filtering.** `similar` always filters by tenant, and by `scopeIds` when the query provides
  them — another tenant's entries are never returned.
- **Graph traversal.** The index declares `graph_traversal`: `related(id, { types?, depth })`
  walks `relationships` breadth-first, in discovery order, without duplicates, excluding the
  start id. It also declares `temporal_search` (validity windows are carried on entries).
- **Safety.** Upserting an entry whose embedding has the wrong dimension throws before
  anything is stored. Entries and embeddings are copied on the way in and out, so mutating a
  result never corrupts the index.
- **The embedder.** `hashingEmbedder(dimension)` lowercases, tokenizes on non-alphanumerics,
  feature-hashes tokens into `dimension` signed buckets, and L2-normalizes. It is
  deterministic and instant, but *not semantic*: it captures token overlap, not meaning.
  Empty text embeds to the zero vector. Swap in a real embedder (same `Embedder` interface)
  for quality.

## Limitations

- **In-process only.** State lives in a `Map`; everything is gone when the process exits.
  Rebuild from your event store via the indexer projection of
  [`@godspeedai/cognate-cognitive-api`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-api).
- **Exact search.** Similarity scans every entry — O(n) per query. Fine for thousands of
  entries, not for millions.
- Use a real embedding model for production recall; the hashing embedder is for tests and
  bootstrapping.

## Related packages

- [`@godspeedai/cognate-cognitive-api`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-api) —
  the `CognitiveIndex`/`Embedder` contract, recall pipeline, and conformance kit this
  package satisfies.
- [`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector) —
  the same contract over the external RuVector library.
- [`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf) —
  the same contract over RVF files with snapshot/branch support.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
