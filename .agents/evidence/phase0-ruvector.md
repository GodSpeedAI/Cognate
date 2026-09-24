# Phase 0 RuVector compatibility evidence — 2026-09-24

Environment observed: Bun 1.4.0, linux x86_64. Fixture lives at
`compatibility/phase0/ruvector/` (its own `package.json`, own `bun install`,
own lockfile — not part of the root dependency graph).

Package under test: `@ruvector/core@0.1.32` (narrow package, preferred per
spec §38 over the `ruvector` umbrella package `0.3.3`). Platform binary
resolved via optionalDependencies: `ruvector-core-linux-x64-gnu@0.1.30`
(note: this pins a lower patch version than the `@ruvector/core` package
itself — a real, observed version skew in the upstream publish, not a
typo in this fixture).

Test file: `compatibility/phase0/ruvector/ruvector.test.ts`. Run with
`bun test` from that directory. Result at time of writing: **10 pass, 0
fail** (`bun test v1.4.0`).

| Behaviour (spec item) | Result | Observed detail |
| --- | --- | --- |
| (1) load under Bun | PASS | `@ruvector/core` native NAPI binding loads under Bun 1.4.0 via `await import(...)`; no fallback needed on this host. |
| (2) fixed-dimension index; insert with id+metadata; deterministic similarity search | PASS | Hand-made orthogonal vectors; `search({vector:[1,0,0,0],k:2})` returns `["a","d"]` in that order, matching hand-computed cosine similarity. |
| (2b) metadata round-trip | PASS (with caveat) | `metadata` round-trips through `insert`->`get`, but only as a raw JSON **string** — see API deviation below. |
| (3) delete entry | PASS | Deleted id no longer appears in subsequent `search()` results. |
| (4) persistence to temp-dir file + reload | PASS | A second `VectorDb` instance constructed against the same `storagePath` transparently saw all 4 previously-inserted entries (`len()===4`) and returned the correct nearest id on search — persistence + reload works when an explicit file path is given. |
| (5) REBUILD: destroy + rebuild from authoritative array, compare search results | PASS | Two independently constructed, separately-storage-pathed `VectorDb` instances, both populated from the same authoritative record array, returned identical nearest-id ordering for an unambiguous query vector. (Note: a query vector with a genuine tie among candidates produced different HNSW tie-breaks across instances — expected for an approximate index; the test was redesigned to query an unambiguous vector instead of treating this as a defect.) |
| (6) query-time metadata filtering | **DISPROVEN / unsupported** | `SearchQuery` has an undocumented `filter` field, but it requires a **string**, not a predicate object (`Failed to convert JavaScript value Object into rust type String on JsSearchQuery.filter`). A plausible SQL-like string (`'tenant = "acme"'`) was accepted without error but did **not** actually filter results — all records were returned regardless of tenant. Query-time metadata filtering must be treated as unsupported by `@ruvector/core@0.1.32`; tenant/scope pre-filtering per spec §16 must happen in application code (post-search predicate, or per-tenant `VectorDb` instances). |
| (7) graph/relationship features | **Absent — characterized only** | `VectorDb`'s only methods are `insert, insertBatch, search, delete, get, len, isEmpty`. No graph traversal, relationship, temporal, or causal query methods exist. Spec §14's `graph_traversal`/`temporal_search`/`causal_search` capability flags are not satisfiable by `@ruvector/core` alone. A separate package, `@ruvector/graph-node@2.1.1` ("hypergraph support, Cypher queries"), exists under the same npm org but was not installed or tested in this fixture. |
| (8) deterministic fallback via try/catch loader | PASS | A forced import-failure branch falls back to a pure-JS cosine-similarity ordering with no randomness/learned state; two successive calls with the same query produced bit-identical results. |

## Notable API deviations from published docs (empirically verified, not assumed)

1. **`vector` must be a real `Float32Array`.** `index.d.ts` types it as
   `Float32Array | number[]`, but passing a plain array throws
   `Get TypedArray info failed on JsVectorEntry.vector` (`InvalidArg`).
2. **`metadata` must be a `string`, not an object.** The README's own
   quick-start example passes `metadata: { title: 'Example Document' }`
   directly; this throws `Failed to convert JavaScript value ... into rust
   type String on JsVectorEntry.metadata` (`StringExpected`). Callers must
   `JSON.stringify`/`JSON.parse` metadata themselves.
3. **No true in-memory mode.** The README states *"No storagePath =
   in-memory"*. Empirically false: omitting `storagePath` (or passing
   `":memory:"`) silently creates/reuses a `ruvector.db` file in
   `process.cwd()`. `storagePath: ""` throws `Is a directory`;
   `storagePath: null` throws a Rust `String` conversion error. Every
   "isolated"/"in-memory" case in the fixture had to be given an explicit
   unique temp-dir file path to avoid state leaking between test cases and
   across `bun test` runs.

Full method-by-method notes: `compatibility/phase0/ruvector/API_NOTES.md`.

## Spec cross-references

- §3.5 (SQLite authoritative, RuVector derived): the REBUILD fixture (item
  5) empirically demonstrates that a fresh index rebuilt from an
  authoritative record array reproduces the original's ranking — consistent
  with the rebuildability requirement, given a genuinely authoritative
  record source (here, the hand-made `RECORDS` array standing in for
  SQLite).
- §16 (retrieval pipeline: "authorization/scope filtering ... SHOULD occur
  as early as the RuVector implementation safely permits"): **not
  satisfiable within RuVector for this package** — filtering must be
  pushed entirely into the "authoritative object fetch" / application layer
  since `@ruvector/core` has no working predicate filter.
- §31.3 (RuVector failure -> deterministic fallback): demonstrated
  (item 8).
- §37 ("test the selected RuVector Bun native binding and identify a
  documented fallback where one exists; do not assume the RVF package has
  a Bun WASM fallback"): no WASM fallback was found or tested for
  `@ruvector/core` specifically (`@ruvector/wasm@0.1.31` exists as a
  separate browser-targeted package, untested here); the fixture instead
  proves the application-level deterministic fallback shape.
