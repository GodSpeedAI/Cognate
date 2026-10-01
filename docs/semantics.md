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

[`@cognate/domainforge`](../packages/domainforge/README.md) binds `@godspeedai/domainforge` 0.18.2's `Graph.parse(source)` API ([ADR-0002](decisions/ADR-0002-semantic-binding-domainforge.md)). Entity and Resource `id` getters are content-derived (`namespace::name`) and stable across re-parses, so the adapter uses them directly as `SemanticRef` identity components.

### Mapping table (spec §19)

The following rows describe the mapping. DEBT-003 closed when the pin moved to `@godspeedai/domainforge` 0.18.1, which exposes every SEA-declared collection; the golden gate passes against the published binding. The pre-existing CG-SEM-001 baseline remains implemented in the ledger.

| Kind | Supported | View |
|---|---|---|
| Entity, Resource, Flow, Role, Relation | yes | read-only semantic object |
| Instance | yes | read-only `ResourceInstance` from the Graph API; no SEA declaration |
| EntityInstance | yes | read-only entity instance declared with SEA `Instance` |
| Pattern, ConceptChange | yes | read-only semantic object |
| Policy | yes | read-only referenced constraint only — never a capability or permission |
| Metric, Dimension, Unit, Mapping, Projection | yes | read-only semantic object |
| External | no | semantic-pack enum only; no SEA grammar, AST, or Graph declaration |

The full row data (meaning, cardinality, provenance, reason) is in `mappingTable`, [`packages/domainforge/src/index.ts`](../packages/domainforge/src/index.ts). Appearing in the table never grants authority: `bindCapabilities` requires an explicit binding and rejects Policy objects (`CG-SEM-001`).

## Known gaps

- **[DEBT-001](../.agents/DEBT.md) — Flow ids are random per parse.** `Graph.parse` assigns a fresh UUID to each Flow on every parse; only Entity/Resource ids are stable. The adapter derives Flow identity from `(resource, from, to)` plus the source digest instead of using the native id.
- **[DEBT-002](../.agents/DEBT.md) — DomainForge errors share one code.** Missing-reference and syntax errors both throw `Error` with `code: "GenericFailure"`; the adapter currently classifies failures by message text, which is fragile across DomainForge releases.
- **[DEBT-003](../.agents/DEBT.md) — Kinds without a Graph accessor (closed).** DomainForge 0.18.1 exposes every SEA-declared collection to TypeScript, and the adapter maps them, including Policy as a read-only constraint. `External` is not a SEA declaration and remains unmapped.

## Status

`CG-SEM-001` and `CG-SEM-002` have passing evidence against the exact-pinned `@godspeedai/domainforge@0.18.2` package under Bun 1.4.0 (first characterized on 0.16.0 in `.agents/evidence/phase0-domainforge.md`, re-run on 0.17.0 in `.agents/evidence/2026-09-25-releases.md`, closed on 0.18.1 in `.agents/evidence/2026-09-26-debt-003-close.md`). The DEBT-003 expansion is verified against the published binding, including the byte-identical golden projection.

## Related

- [concepts.md](concepts.md) — how a `SemanticRef` flows into a `CapabilityContract`.
- [evidence.md](evidence.md) — how a semantic operation correlates to a RealityTrace observation.
- [architecture.md](architecture.md) — where the semantic plane sits relative to execution.
- [workflows/startup-and-the-background-loop.md](workflows/startup-and-the-background-loop.md) — where `domain/*.sea` is parsed at startup and its digest is computed.
- [explanation/why-adapters.md](explanation/why-adapters.md) — why DomainForge is pinned and unchanged.
