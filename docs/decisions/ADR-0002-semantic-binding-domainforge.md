# ADR-0002: Semantic binding — DomainForge TypeScript/N-API Graph API

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
## Status

Proposed (Phase 0 characterization complete; not yet adopted for Phase 5
implementation).

## Context

Spec §3.2 requires the Framework to integrate DomainForge through a
version-pinned adapter against a supported binding, without modifying
DomainForge or `.sea`. It names the TypeScript/N-API `@godspeedai/domainforge`
Graph API as the first candidate, pinned to the repository-declared version
`0.16.0`, and treats a Bun 1.4 load/parse fixture plus a package-availability
check as Phase 0 gates rather than established facts. Spec §7.1 requires an
opaque `SemanticRef` derived from DomainForge identity (`namespace::name`)
with an explicit non-continuity rule across rename/namespace changes. Spec
§19 requires V0 golden fixtures covering graph parsing, rename, missing
reference, and version/namespace change, plus a documented per-kind mapping
table.

This Phase 0 pass built exactly that fixture set in isolation
(`compatibility/phase0/domainforge/`), against the real, exact-pinned npm
package under Bun 1.4.0, with no modification to the DomainForge or
`sea-rs`/`tree-sitter-sea` checkouts used only for read-only reference. Full
detail and per-behaviour results are in
`.agents/evidence/phase0-domainforge.md` and `compatibility/phase0/domainforge/API_NOTES.md`.

## Decision

Adopt `@godspeedai/domainforge` 0.16.0's `Graph.parse(source)` static API as
the V0 semantic source for the DomainForge Adapter (spec §19), with the
following adapter-owned constraints derived from this Phase 0 evidence:

1. **Entity and Resource identity is safe to use directly.** Their `id`
   getters are content-derived (`namespace::name`) and stable across
   re-parses of identical source; renaming or changing namespace correctly
   mints a new id while leaving unrelated concepts' ids untouched. The
   adapter's `SemanticRef` for Entity/Resource kinds MAY use the native
   `id` field as the DomainForge object identity component.

2. **Flow identity is NOT safe to use directly.** `Flow.id` is a freshly
   randomized value on every `Graph.parse` call, even for byte-identical
   source. The adapter MUST derive a `SemanticRef` for Flow from
   `(resourceId, fromId, toId)` plus the caller-supplied source digest,
   never from the native `Flow.id` alone, until DomainForge changes this
   behavior upstream (out of scope for the Framework to fix — spec §3.2
   forbids DomainForge forks).

3. **Error handling must branch on `.message`, not `.code`.** `Graph.parse`
   throws a plain `Error` for both missing-reference and syntax failures,
   both carrying the same napi-rs `code: "GenericFailure"`. The adapter's
   typed diagnostic layer (spec §19's "typed error/diagnostic") must wrap
   this by pattern-matching `.message` (e.g. `/^Parse error: Undefined \w+/`
   vs `/^Parse error: Syntax error/`) rather than relying on `.code`, and
   must not present this generic code as if it were a DomainForge-specific
   error taxonomy.

4. **The mapping table (spec §19) is narrower than `ConceptKind` implies.**
   `ConceptKind` enumerates `Entity, Resource, Role, Flow, Policy, Metric,
   Dimension, Unit, External` (9 kinds), but this binding's `Graph` exposes
   first-class typed collections (add/count/get/all) for only Entity,
   Resource, Flow, ResourceInstance/Instance, Role, and Relation. Policy is
   JSON-string add/evaluate only. Metric, Dimension, Unit, Mapping,
   Projection have standalone classes with no discovered `Graph` collection
   accessor in 0.16.0. External has no discovered accessor at all. Per spec
   §19 ("map only explicitly documented DomainForge concept/contract kinds"),
   the V0 adapter mapping table MUST list Metric/Dimension/Unit/Mapping/
   Projection/External/Policy as explicitly unmapped-in-V0 rather than
   silently omitting them or guessing a mapping.

5. **Lookup APIs (`hasEntity`/`getEntity`) throw on malformed input.** A
   non-UUID-shaped id argument throws `Invalid UUID: ...`
   (`code: "GenericFailure"`) rather than returning `false`/`null`. The
   adapter must validate/guard id shape before calling these, or catch and
   re-classify this as a programmer error distinct from a "not found" result.

## Consequences

* The Phase 0 gate for DomainForge (spec §37) is satisfied for the narrow
  V0 surface: install succeeds under Bun 1.4.0, `Graph.parse` loads and
  runs, and all six required golden-fixture behaviours have a runnable,
  passing (or explicitly-failing-and-recorded) test in
  `compatibility/phase0/domainforge/domainforge.test.ts`.
* Phase 5 (DomainForge + RealityTrace adapter implementation) may proceed
  against this binding, but MUST implement the Flow-identity workaround in
  decision point 2 before treating any Flow `SemanticRef` as durable across
  re-parses (e.g. across a source-file edit-and-reparse cycle in a running
  Framework instance).
* The adapter's per-kind mapping table (spec §19) must be written against
  the six-kind, not nine-kind, live surface, with the remaining three kinds
  (Metric, Dimension, Unit — plus Mapping, Projection, External, Policy)
  marked unsupported/unmapped-in-V0 until a grammar-level check against
  `tree-sitter-sea`/`sea-rs` clarifies whether they are reachable via SEA
  source syntax at all.
* This decision does not cover macOS or Windows native-binary loading
  (untested — this host is `linux-x64-gnu` only), SemanticPack ingestion
  (explicitly deferred by spec §7.1), or the `evaluatePolicy`/
  `entityContractJson` contract-output surface (no sample policy JSON was
  authored in this pass). Each remains an open question in
  `.agents/evidence/phase0-domainforge.md` and must be closed before the
  adapter depends on it.

## References

* `compatibility/phase0/domainforge/domainforge.test.ts` — runnable proof.
* `compatibility/phase0/domainforge/API_NOTES.md` — verified API surface.
* `.agents/evidence/phase0-domainforge.md` — environment, commands, exit
  codes, per-behaviour results, limits, open questions.
* Spec: `.agents/specs/software-design-spec-cognate.-frameworkmd` §3.2, §7.1,
  §19, §37.

## Addendum (2026-09-25): pin moved to 0.17.0

The operator published `@godspeedai/domainforge` 0.17.0. Before changing the pin, diagnostic goldens were added (`packages/domainforge/test/diagnostics.test.ts`, DEBT-002 recommended action) covering every message shape the adapter classifies: undefined entity, undefined resource, syntax error, duplicate declaration (now classified as `ambiguous_identity` instead of falling through to `unknown`), empty source, and the unknown fallback. A side-by-side probe of 0.16.0 and 0.17.0 showed identical messages, the same single `GenericFailure` code, and still-random native Flow ids (so DEBT-001's derived identity remains required).

With the pin at 0.17.0: AK-003 fixture 9/9, adapter + goldens + semantic-to-observation 19/19, three consecutive runs each; `example:domainforge` passes. Projections now record `binding: "@godspeedai/domainforge@0.17.0"`. Historical projections archived under 0.16.0 keep their recorded binding; resolution is by source digest, so they remain resolvable.

## Addendum (2026-10-01): pin moved to 0.18.2

`@godspeedai/domainforge` 0.18.2 differs from 0.18.1 only in the native binary; `index.js` and `index.d.ts` are byte-identical. Phase 0 fixture 9/9 ×3, adapter + goldens + semantic-to-observation 20/20 ×3, `example:domainforge` passes. One observable change: Policy `expression` strings render as `forall f in flows: …` where 0.18.1 produced `ForAll(f in flows: …)`; the golden projection was regenerated through the adapter and the diff is exactly that field plus the `binding` string. Diagnostics remain message-only under one `GenericFailure` code (DEBT-002 stays open). Evidence: `.agents/evidence/2026-10-01-domainforge-0.18.2.md`.

## Addendum (2026-09-26): pin moved to 0.18.1, DEBT-003 closed

The operator published `@godspeedai/domainforge` 0.18.1 (0.18.0 added the DEBT-003 read accessors; 0.18.1 unified the release process; neither changed the SEA surface the adapter consumes). All nine new accessors (`allPolicies`, `allMetrics`, `allMappings`, `allProjections`, `allDimensions`, `allUnits`, `allPatterns`, `allConceptChanges`, `allEntityInstances`) exist as functions. The staged adapter mapping needed no code change — only the pin, the `BINDING` constant, and the regenerated golden fixture. `just verify` and `just gates` pass 78/78, including the byte-identical golden projection across two loads and the architecture test forbidding implicit capabilities. Policy stays a read-only referenced constraint: `bindCapabilities` rejects Policy ids. `External` remains unmapped because SEA has no grammar, AST, or Graph declaration for it (verified: no `external` in the DomainForge parser, graph, or grammar).
