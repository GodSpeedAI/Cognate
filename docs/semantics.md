# Semantics: `.sea` and DomainForge

## Why a separate semantic plane

`.sea` expresses domain meaning; DomainForge projects that meaning into a graph. Cognate does not modify either — spec §3.2 requires the framework to integrate DomainForge through a version-pinned adapter, without changing DomainForge or `.sea`, and spec §3.1 freezes `.sea` itself as unchanged. The adapter's job is narrow: turn DomainForge concepts into opaque, versioned references the rest of the framework can use without knowing DomainForge's internals.

## `SemanticRef`

A `SemanticRef` ([`packages/kernel-api/src/types.ts`](../packages/kernel-api/src/types.ts)) is the framework-owned, opaque handle to an existing semantic object (spec §7.1):

```ts
interface SemanticRef {
  readonly namespace: string;
  readonly id: string; // DomainForge object identity, e.g. `namespace::name`
  readonly kind?: string;
  readonly source: { readonly uri: string; readonly digest: string };
  readonly projectionVersion: string; // Cognate-owned adapter projection schema version
}
```

Identity is pinned to source revision: a rename or namespace change mints a **new** identity rather than silently reinterpreting the old one (`CG-SEM-002`).

## Adapter: `@cognate/domainforge`

[`@cognate/domainforge`](../packages/domainforge/README.md) binds `@godspeedai/domainforge` 0.17.0's `Graph.parse(source)` API ([ADR-0002](decisions/ADR-0002-semantic-binding-domainforge.md)). Entity and Resource `id` getters are content-derived (`namespace::name`) and stable across re-parses, so the adapter uses them directly as `SemanticRef` identity components.

### Mapping table (spec §19)

| Kind | Supported | View |
|---|---|---|
| Entity, Resource, Flow, Role, Relation, Instance | yes | read-only semantic object |
| Policy | no | referenced constraint only — never a capability or permission |
| Metric, Dimension, Unit, Mapping, Projection | no | no Graph accessor in 0.17.0 ([DEBT-003](../.agents/DEBT.md)) |
| External | no | no constructor or accessor at all in 0.17.0 ([DEBT-003](../.agents/DEBT.md)) |

The full row data (meaning, cardinality, provenance, reason) is in `mappingTable`, [`packages/domainforge/src/index.ts`](../packages/domainforge/src/index.ts). A DomainForge kind never becomes a capability unless it appears in this table (`CG-SEM-001`).

## Known gaps

- **[DEBT-001](../.agents/DEBT.md) — Flow ids are random per parse.** `Graph.parse` assigns a fresh UUID to each Flow on every parse; only Entity/Resource ids are stable. The adapter derives Flow identity from `(resource, from, to)` plus the source digest instead of using the native id.
- **[DEBT-002](../.agents/DEBT.md) — DomainForge errors share one code.** Missing-reference and syntax errors both throw `Error` with `code: "GenericFailure"`; the adapter currently classifies failures by message text, which is fragile across DomainForge releases.
- **[DEBT-003](../.agents/DEBT.md) — Kinds without a Graph accessor.** Nine `ConceptKind` values exist; the 0.17.0 binding exposes collections for only six. The other three (Policy partially, Metric/Dimension/Unit/Mapping/Projection, External) stay unmapped by design until a later binding exposes them.

## Status

`CG-SEM-001` and `CG-SEM-002` are `implemented` per [`requirements/ledger.yaml`](../requirements/ledger.yaml), proven against the real, exact-pinned `@godspeedai/domainforge@0.17.0` package under Bun 1.4.0 (`compatibility/phase0/domainforge/`; first characterized on 0.16.0 in `.agents/evidence/phase0-domainforge.md`, re-run on 0.17.0 in `.agents/evidence/2026-09-25-releases.md`). The mapping is a V0 slice; DEBT-003 is open by design, not a bug.

## Related

- [concepts.md](concepts.md) — how a `SemanticRef` flows into a `CapabilityContract`.
- [evidence.md](evidence.md) — how a semantic operation correlates to a RealityTrace observation.
- [architecture.md](architecture.md) — where the semantic plane sits relative to execution.
