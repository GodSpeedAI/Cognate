# @cognate/domainforge

Version-pinned adapter from `@godspeedai/domainforge@0.18.2`'s `Graph` output
to Cognate's `SemanticRef`s and a read-only `SemanticProjection` (spec §7.1,
§19). `loadSemanticProjection` never throws: parse failures come back as a
typed `SemanticError` (`syntax`, `unresolved_reference`, `ambiguous_identity`,
`binding_unavailable`, `unknown`), classified from `Error.message` because
this binding's `.code` is always `GenericFailure` (DEBT-002).

Identity: `Entity`/`Resource`/`Role`/`Instance` use `namespace::name`;
`Relation` uses `namespace::name`; `Flow` (whose native id is a random UUID
per parse, DEBT-001) uses a derived id
`namespace::flow(resourceRef|fromRef|toRef)`. Colliding computed ids surface
as `ambiguous_identity`.

`SemanticRegistry` archives projections by source digest; a ref only
resolves against the projection pinned by its digest, and renames never
resolve to a same-named object without an explicit, reviewed `alias()`
(spec §7.1, §13.3). `bindCapabilities` is the only path from a semantic
object to a `CapabilityContract`; unbound objects never become capabilities.

## Mapping table (spec §19)

| Kind | Supported | View |
| --- | --- | --- |
| Entity, Resource, Flow, Role, Relation, Instance | yes | read-only semantic object |
| Policy | yes | referenced constraint only (never a capability/permission) |
| Metric, Dimension, Unit, Mapping, Projection | yes | read-only semantic object via 0.18.2 Graph accessors |
| External | no | no SEA grammar, AST, or Graph declaration; not mappable |

See `mappingTable` in `src/index.ts` for the full row data (meaning,
cardinality, provenance, reason).
