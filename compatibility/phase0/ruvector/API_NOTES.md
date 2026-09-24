# @ruvector/core API notes (Phase 0)

Package: `@ruvector/core@0.1.32` (exact pin). Narrow package chosen over the
`ruvector` umbrella (0.3.3) per spec §38 preference for narrow packages.
Native NAPI-RS binding; platform binary resolved via optionalDependencies
(`ruvector-core-linux-x64-gnu@0.1.30` on this host — note the version skew:
core is 0.1.32 but pins platform binaries at 0.1.30).

Verified under Bun 1.4.0, linux x64. `require()`-based CJS loader; imports
fine from Bun ESM via `await import("@ruvector/core")`.

## Import

```ts
import { VectorDb } from "@ruvector/core";
// or: const { VectorDb } = require("@ruvector/core");
// VectorDB (capital DB) is also exported as an alias.
```

## Constructor

```ts
new VectorDb({
  dimensions: number,          // required
  storagePath?: string,        // see "Persistence" below — no true in-memory mode
  distanceMetric?: "Cosine" | "Euclidean" | "DotProduct" | "Manhattan",
  // NOTE: values are PascalCase strings, not lowercase as README/.d.ts imply.
  // README-documented but unverified: maxElements, ef_construction, m, hnswConfig.
})
```

## Methods (verified against installed `.node` binary, not just README)

- `insert(entry: { id?: string; vector: Float32Array; metadata?: string }): Promise<string>`
  - `vector` MUST be a real `Float32Array`. A plain `number[]` (which
    `index.d.ts`'s `Float32Array | number[]` union claims works) throws:
    `Get TypedArray info failed on JsVectorEntry.vector` (code `InvalidArg`).
  - `metadata` MUST be a `string`. Passing an object (as the README's own
    example does: `metadata: { title: '...' }`) throws:
    `Failed to convert JavaScript value ... into rust type String on
    JsVectorEntry.metadata` (code `StringExpected`). Caller must
    `JSON.stringify`/`JSON.parse` metadata itself.
- `insertBatch(entries): Promise<string[]>` — not exercised in Phase 0 fixture; assumed same per-entry contract as `insert`.
- `search({ vector: Float32Array; k: number; efSearch?: number; filter?: string }): Promise<{id, score, vector, metadata}[]>`
  - `filter` field exists on the native `JsSearchQuery` type (undocumented in
    README/`index.d.ts`) and accepts a **string**, not an object/predicate.
    Passing an object throws `StringExpected`. Passing a plausible SQL-like
    string (`'tenant = "acme"'`) was accepted without error but did **not**
    filter results (all records returned regardless of tenant) — the string
    filter syntax/semantics are unconfirmed and NOT safe to rely on for
    tenant/scope pre-filtering. Treat query-time metadata filtering as
    **unsupported** until RuVector publishes the filter grammar.
  - Result entries include `vector` (as a plain object with numeric keys,
    not a Float32Array) and `metadata` (still the raw JSON string — not
    auto-parsed).
- `delete(id: string): Promise<boolean>` — verified.
- `get(id: string): Promise<entry | null>` — verified.
- `len(): Promise<number>`, `isEmpty(): Promise<boolean>` — verified.
- No `destroy()`/`close()`/`rebuild()` method exists. "Rebuild" in practice
  means: construct a new `VectorDb` (optionally pointing at a fresh
  `storagePath`) and re-insert from the authoritative record array.

## Persistence — IMPORTANT deviation from README

The README states: *"In-memory only: const db = new VectorDb({ dimensions:
128 }); // No storagePath = in-memory"*. **This is false** for 0.1.32:

- Omitting `storagePath` (or passing `":memory:"`) silently creates/opens a
  `ruvector.db` file in `process.cwd()` and persists to it.
- Passing `storagePath: ""` throws `Is a directory (os error 21)`.
- Passing `storagePath: null` throws (rust String conversion failure).
- There is no verified way to get a truly ephemeral, non-persisting
  in-memory-only instance in this version. **Always pass an explicit,
  unique file path** (e.g. under a temp dir) to avoid cross-instance state
  leakage — this is what the Phase 0 fixture does for every "in-memory"
  test case.
- When a real file `storagePath` IS given, a second `VectorDb` instance
  constructed against the same path **does** transparently reload prior
  entries (verified: `len()` on the reloaded instance equalled the original
  insert count, and a search against it returned the expected nearest id).

## Graph / relationship features

`@ruvector/core@0.1.32`'s `VectorDb` exposes only:
`insert, insertBatch, search, delete, get, len, isEmpty`. No graph
traversal, relationship, or temporal/causal query methods exist on this
package. Spec §14's `graph_traversal`, `temporal_search`, `causal_search`
capability flags are **not satisfiable by `@ruvector/core` alone**. A
separate package, `@ruvector/graph-node@2.1.1` ("Native Node.js bindings for
RuVector Graph Database with hypergraph support, Cypher queries"), exists
under the same npm org and would need its own Phase 0 fixture before any
profile claims graph capability.

## Fallback

No documented WASM fallback shipped with `@ruvector/core` itself (a
separate `@ruvector/wasm@0.1.31` package exists — "Rust vector database for
browsers via WASM" — but was not evaluated in this fixture; it targets
browser/IndexedDB use, not Bun server-side). The Phase 0 fixture instead
demonstrates the application-level fallback shape required by §31.3: a
try/catch around the binding import, falling back to a deterministic
in-JS cosine-similarity ordering with no learned/random state.

## Related narrower packages discovered (not installed/tested)

- `@ruvector/graph-node@2.1.1` — graph database bindings (Cypher, hypergraph).
- `@ruvector/gnn@0.1.25` — graph neural network bindings.
- `@ruvector/rvf@0.3.4` / `@ruvector/rvf-node@0.2.3` — RVF format SDK / native bindings (spec §18/§37 Phase 7 optional RVF gate).
- `@ruvector/wasm@0.1.31` — browser/WASM vector DB (not a Bun-native fallback).
