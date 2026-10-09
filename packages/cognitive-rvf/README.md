# @godspeedai/cognate-cognitive-rvf

A Cognate `CognitiveIndex` backed by RVF files — a vector-file format from the external
[`@ruvector/rvf`](https://www.npmjs.com/package/@ruvector/rvf) library — with snapshot,
branch, and verified import support. Vectors live in the `.rvf` file; all provenance (tenant,
scope, source references, metadata) lives in a Cognate-owned sidecar that this adapter
verifies with an integrity digest before anything is opened.

**When to use this package:** cognition that must be moved between processes or machines —
snapshot an index, verify it on import, branch it for experiments. For an in-process search
accelerator that deliberately persists nothing, use
[`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector);
for tests, [`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory).

## Installation

```sh
bun add @godspeedai/cognate-cognitive-rvf
```

Requires [Bun](https://bun.sh) >= 1.4.0. The external dependency
[`@ruvector/rvf`](https://www.npmjs.com/package/@ruvector/rvf) (version `0.3.4`, pinned) is
installed automatically — it reads and writes the RVF vector-file format. A snapshot needs a
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) store
to record snapshots durably. The SDK ships Bun-native TypeScript source, so add `@types/bun`
and `@types/node` as dev dependencies when typechecking your project.

## Quick start: snapshot and verified import

```ts
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { createRvfIndex, importSnapshot } from "@godspeedai/cognate-cognitive-rvf";

const index = await createRvfIndex({ dimension: 4, path: "./cognition.rvf" });
await index.upsert([/* CognitiveEntry values with 4-dimensional embeddings */]);

// Snapshot: writes base.rvf, base.entries.json, and base.manifest.json into ./snapshots,
// then records the snapshot (with its integrity digest) in the store.
const store = createMemoryStore();
const manifest = await index.snapshot(store, {
  dir: "./snapshots",
  name: "base",
  lineage: "app-1",       // which application history this cognition derives from
  indexedThrough: 10,     // the event position the indexer has processed
  storeHead: 10,          // the store's current head position
  onBehind: "fail",       // refuse to snapshot when indexing lags the head
  frameworkVersion: "0.1.0",
});

// Elsewhere (or later): verify before opening.
const result = await importSnapshot(store, "./snapshots/base.manifest.json", {
  lineage: "app-1",
  storeHead: 10,
  allowedTenants: ["tenant-a"],
  maxEntries: 100_000,
  maxBytes: 50_000_000,
});

if (result.kind === "attached") {
  // lineage matches, checkpoint is at or before the store head, and the store
  // has recorded this exact digest — the snapshot belongs to this history.
} else if (result.kind === "detached") {
  // verified and usable, but foreign to this store — result.reason says which checks failed
} else {
  // rejected: bad manifest, missing files, integrity mismatch, over limits,
  // or a disallowed tenant — nothing was opened
}
```

## Trust model

The underlying library performs no integrity checking when it opens a file, so this adapter
does it before: the manifest carries a `sha256` digest over the `.rvf` bytes plus the entries
sidecar, and `importSnapshot` verifies it, the entry/byte limits, and every tenant in the
manifest *before* opening anything. A truncated or tampered snapshot is rejected without its
bytes ever being read by the vector engine. Provenance is never handed to the vector file at
all — it lives in the entries sidecar, which is the only source used to answer `get` and to
filter `similar` by tenant and scope.

Snapshots are classified as **attached** only when the manifest's lineage matches the target
store, its checkpoint is at or before the store's head, and that store has already recorded
the same integrity digest; anything else verified opens **detached** with a reason.

## Branching

`branch(childPath)` creates a copy-on-write branch: the child sees the parent's vectors,
writes on either side stay isolated, and `lineage()` reports the file id, parent, and depth.
Like `snapshot`, it copies the sidecar files alongside the vector bytes.

## What persists — and what does not

The `.rvf` file and its sidecars do persist, but `createRvfIndex` always starts **empty**:
it resets any pre-existing files at the path, because derived cognition must be rebuildable
from the event stream and the only trusted way to open existing data is `importSnapshot`,
which verifies it first.

## Limitations

- Snapshot and import operate on file paths only (no in-memory bytes).
- Branches of branches are not exercised; a branch's parent file must stay present at its
  original path, so snapshotting a branch (rather than a root index) is not supported by this
  adapter.
- Concurrent multi-process writers to the same `.rvf` path are not supported.
- The library's compute/kernel segments are never read or written by this adapter.

## Related packages

- [`@godspeedai/cognate-cognitive-api`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-api) —
  the `CognitiveIndex` contract, recall pipeline, indexer projection, and conformance kit.
- [`@godspeedai/cognate-cognitive-memory`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-memory) —
  the in-process fallback index.
- [`@godspeedai/cognate-cognitive-ruvector`](https://www.npmjs.com/package/@godspeedai/cognate-cognitive-ruvector) —
  the non-persistent RuVector-backed index.
- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) —
  the store where snapshots are registered.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
