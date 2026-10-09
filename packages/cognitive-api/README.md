# @godspeedai/cognate-cognitive-api

The retrieval contract for Cognate applications: a `CognitiveIndex` interface, the standard
recall pipeline, an event-driven indexing projection, and a conformance kit for index
implementations. It defines no vector database and no embedding model — implementations and
embedders plug in.

**When to use this package:** you are building or consuming semantic recall ("find me
documents like this query") and want one interface that works over any index backend, with
tenant/scope filtering and authorization built into the pipeline rather than bolted on.
Pick an implementation such as
[`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory),
[`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector),
or [`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf).

## Installation

```sh
bun add @godspeedai/cognate-cognitive-api
```

Requires [Bun](https://bun.sh) >= 1.4.0. The SDK ships Bun-native TypeScript source, so add
`@types/bun` and `@types/node` as dev dependencies when typechecking your project.

## Quick start: recall

```ts
import { createRecall } from "@godspeedai/cognate-cognitive-api";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";

const recall = createRecall({
  index: createMemoryIndex({ dimension: 256 }),
  embedder: hashingEmbedder(256),
  resolver: {
    // Fetch authoritative content for an entry's source, with your own authorization.
    async resolve(sourceRef, actor, tenant) {
      return { kind: "ok", value: { text: "Refunds are approved by a manager." } };
    },
  },
});

const result = await recall.recall({
  text: "who approves refunds?",
  actor: { id: "alice", kind: "user" },
  tenant: "tenant-a",
  scopeIds: [],
  k: 5,
});

if (result.status === "ok") {
  for (const item of result.items) console.log(item.sourceRef, item.score);
} else {
  // "degraded": the index or embedder was unavailable; continue without cognition
  console.warn(result.reason);
}
```

The pipeline: embed the query, ask the index for candidates (with tenant/scope pre-filtering),
re-check each candidate's provenance against the query's tenant and scopes, then fetch
authoritative content through your `SourceResolver`. Sources that come back denied or missing
are dropped silently — recall never discloses that a result existed. Results never exceed `k`.
If the index or embedder throws, recall degrades to `{ status: "degraded", items: [] }` unless
the query sets `required: true`, in which case it throws `CognitionUnavailableError`.

## Keeping an index fed: the indexer projection

`cognitiveIndexer` is a projection that turns durable events into index entries. You provide
a deterministic `extract` function per event; the projection embeds the extracted documents
and upserts them (idempotent by entry id, so replay is safe). When an event's payload is
erased, its derived entries are removed — even across restarts.

```ts
import { cognitiveIndexer } from "@godspeedai/cognate-cognitive-api";

const indexer = cognitiveIndexer({
  name: "my-cognition",
  version: "1",
  index,               // a CognitiveIndex
  embedder,            // an Embedder
  extract: (event) =>
    event.eventType === "doc.created"
      ? [{ id: `doc:${event.eventId}`, sourceType: "event", sourceRef: `event:${event.eventId}`,
           tenant: event.tenant, scopeId: event.scopeId, semanticRef: null, eventRef: event.eventId,
           traceRef: null, metadata: {}, relationships: [], validFrom: event.occurredAt, validTo: null,
           text: String((event.payload as { title?: string }).title ?? "") }]
      : [],
});
```

Run it with a projection runner (the reference runtime accepts it via its `projections`
option), or drive it yourself with
[`@godspeedai/cognate-projections`](https://www.npmjs.com/package/@godspeedai/cognate-projections).

## Conformance kit for index implementations

The `@godspeedai/cognate-cognitive-api/conformance` subpath exports
`cognitiveIndexConformance(name, make)` — the behavior suite (nearest-first ordering,
idempotent upserts, provenance preservation, tenant isolation, scope restriction, dimension
checks) and an `entry()` fixture helper. Every index implementation in the Cognate family
passes it unchanged; run it against your own implementation before trusting one.

## Limitations

- This package ships no index and no embedder — quality depends entirely on your choices.
- Index candidates are never authoritative; only what your `SourceResolver` returns is.
- Recall drops denied or missing sources without signaling which ones, by design.

## Related packages

- [`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory) —
  in-process exact-cosine index and deterministic hashing embedder.
- [`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector) —
  index backed by the external RuVector library.
- [`@godspeedai/cognate-cognitive-rvf`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-rvf) —
  index backed by RVF files with snapshot/branch support.
- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) and
  [`@godspeedai/cognate-projections`](https://www.npmjs.com/package/@godspeedai/cognate-projections) —
  the event store and projection machinery the indexer builds on.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
