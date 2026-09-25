# ADR-0004: RuVector as the reference CognitiveIndex implementation

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
- Status: Accepted (partial capability — see Consequences)
- Date: 2026-09-24
- Related: software-design-spec-cognate §3.5, §3.6, §14, §15, §16, §31.3, §37, §38
- Evidence: `.agents/evidence/phase0-ruvector.md`
- Fixture: `compatibility/phase0/ruvector/` (`ruvector.test.ts`, `API_NOTES.md`)

## Context

Spec §15 requires a reference `CognitiveIndex` implementation backed by
RuVector, and §38 directs Phase 0 to pin an exact package/version and
prefer a narrow package over the `ruvector` umbrella package "where
feasible." Three npm candidates were named for evaluation: `ruvector`
(umbrella, 0.3.3), `@ruvector/core` (0.1.32), `@ruvector/sona` (0.1.8,
covered by ADR-0005). A broader npm search also surfaced
`@ruvector/graph-node`, `@ruvector/gnn`, `@ruvector/rvf`,
`@ruvector/rvf-node`, and `@ruvector/wasm` as narrower single-purpose
packages under the same publisher.

Phase 0 required proving, under Bun 1.4.0: native binding load, insert
with id+metadata, deterministic similarity search, delete, persistence to
a temp-dir file and reload, index rebuild-from-authoritative-array parity,
query-time metadata filtering, graph/relationship characterization, and a
deterministic try/catch fallback.

## Decision

Pin **`@ruvector/core@0.1.32`** (exact) as the reference vector-index
binding for the `CognitiveIndex` adapter, in preference to the `ruvector`
umbrella package, per §38.

This decision is **scoped to the vector-index capability only**
(`vector_search` in §14's capability-flag vocabulary). It does **not**
extend to graph, temporal, or causal capability flags — those require a
separate, not-yet-evaluated package (`@ruvector/graph-node@2.1.1`) and a
future Phase 0 fixture before any profile may claim them.

## Rationale

- `@ruvector/core` loaded and ran all required behaviours under Bun 1.4.0
  on linux x64 (10/10 fixture assertions passing): insert with id +
  metadata, deterministic hand-vector similarity search, delete, real
  persistence + reload via an explicit `storagePath`, and rebuild-from-
  authoritative-array parity.
- It is materially narrower than the `ruvector` umbrella package (which
  bundles attention mechanisms, FlashAttention-3, Graph RAG, SONA
  keywords, and more into one dependency surface) while providing exactly
  the vector-index primitives §15's `CognitiveIndex` needs at minimum.
- Two behaviours required by Phase 0 are **not satisfied** by this
  package and must be handled at the Framework/application layer, not
  assumed to exist inside RuVector:
  1. **Query-time metadata filtering is unsupported.** The `filter`
     field on `search()` requires an undocumented string grammar that,
     when tested with a plausible expression, did not actually filter
     results. Tenant/scope pre-filtering (§16) must happen entirely in
     application code — either as a post-search predicate over returned
     ids, or via separate per-tenant `VectorDb` instances.
  2. **Graph/relationship features are entirely absent.** `VectorDb`
     exposes only `insert, insertBatch, search, delete, get, len,
     isEmpty`. §14's `graph_traversal`, `temporal_search`, and
     `causal_search` capability flags cannot be backed by this package.
- The package has real, load-bearing documentation defects that any
  adapter code MUST account for (see `API_NOTES.md` for the full list):
  `vector` must be a genuine `Float32Array` (not `number[]`, despite the
  `.d.ts` union type); `metadata` must be a pre-serialized JSON string
  (not an object, despite the README's own example); and there is no true
  in-memory mode — omitting `storagePath` silently persists to
  `./ruvector.db` in the process's current working directory. An adapter
  MUST always pass an explicit, intentional storage path.

## Consequences

- The `CognitiveIndex` adapter's `vector_search` capability flag MAY be
  advertised as supported. `graph_traversal`, `temporal_search`, and
  `causal_search` MUST NOT be advertised until `@ruvector/graph-node` (or
  an equivalent) passes its own Phase 0 fixture.
- Any adapter code wrapping `@ruvector/core` MUST: (a) convert vectors to
  `Float32Array` before calling `insert`/`search`; (b) JSON-serialize
  metadata before `insert` and JSON-parse it after `get`/`search`; (c)
  always pass an explicit `storagePath` (even for notionally "ephemeral"
  indexes, to avoid silent CWD pollution and cross-instance state
  leakage); (d) implement §16's authorization/scope filtering entirely in
  the "authoritative object fetch" step, not inside the RuVector query.
- Per §31.3, a try/catch loader with a deterministic (non-random,
  non-learned) fallback ordering is REQUIRED around the RuVector import in
  any component that must degrade gracefully when the native binding is
  unavailable on a given platform; this fixture's fallback shape is the
  reference implementation.
- This ADR does not authorize use of the `ruvector` umbrella package, nor
  of `@ruvector/graph-node`, `@ruvector/gnn`, `@ruvector/rvf`, or
  `@ruvector/wasm` — each would require its own Phase 0 fixture before
  adoption.

## Alternatives considered

- **`ruvector` (umbrella, 0.3.3)**: rejected per §38's explicit preference
  for narrow packages; pulls in unrelated capability surface (attention
  mechanisms, SONA, Graph RAG) not needed by the minimal `CognitiveIndex`
  vector-search path.
- **`@ruvector/wasm` (0.1.31)**: considered as a potential Bun-compatible
  fallback to the native binding, but its README and keywords
  (`browser`, `web-workers`, `indexeddb`) target browser/IndexedDB
  deployment, not a Bun server process; not evaluated further in Phase 0.
  Left as an open question for a future fixture if a non-native fallback
  is ever required.
