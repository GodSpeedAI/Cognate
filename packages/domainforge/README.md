# @godspeedai/cognate-domainforge

Turn DomainForge domain models into Cognate semantic objects and capabilities. This package is
a version-pinned adapter around the external
[`@godspeedai/domainforge`](https://www.npmjs.com/package/@godspeedai/domainforge) npm package
(pinned to `0.19.0`), which parses the `.sea` domain language into a graph of entities,
resources, flows, relations, policies, and metrics. The adapter converts that graph into
Cognate `SemanticRef`s and a read-only `SemanticProjection`, and is the only supported path
from a domain model to Cognate capability contracts.

**When to use this package:** you model your domain in `.sea` and want your Cognate
application's capabilities to carry verifiable provenance — every semantic object traceable
to a digest of the exact source it came from, with renames never silently re-resolved.

## Installation

```sh
bun add @godspeedai/cognate-domainforge
```

Requires [Bun](https://bun.sh) >= 1.4.0. The external parser
[`@godspeedai/domainforge`](https://www.npmjs.com/package/@godspeedai/domainforge) at
`0.19.0` is installed automatically as a pinned regular dependency; it performs the actual
`.sea` parsing (including its native binding). The SDK ships Bun-native TypeScript source, so
add `@types/bun` and `@types/node` as dev dependencies when typechecking your project.

## Quick start

```ts
import {
  bindCapabilities,
  loadSemanticProjection,
  SemanticRegistry,
  serializeProjection,
} from "@godspeedai/cognate-domainforge";

const source = `
Entity "Warehouse" in logistics
Entity "Factory" in manufacturing
Resource "Cameras" units in equipment
Flow "Cameras" from "Warehouse" to "Factory" quantity 10
`;

const result = loadSemanticProjection(source, { uri: "file:///domain/logistics.sea" });
if (!result.ok) {
  // Never throws: failures come back typed as one of
  // "syntax" | "unresolved_reference" | "ambiguous_identity" | "binding_unavailable" | "unknown"
  console.error(result.error.kind, result.error);
} else {
  const projection = result.projection;
  projection.objects.map((o) => o.ref.id);
  // ["logistics::Warehouse", "manufacturing::Factory", "equipment::Cameras",
  //  "equipment::flow(equipment::Cameras|logistics::Warehouse|manufacturing::Factory)"]
  console.log(projection.source.digest); // sha256 of the exact source text

  // Canonical, deterministic serialization (stable key order) for storage or diffing:
  const canonical = serializeProjection(projection);

  // Resolve historical refs against exactly the projection they came from:
  const registry = new SemanticRegistry();
  registry.register(projection);
  const resolution = registry.resolve(projection.objects[0]!.ref);
  // { kind: "resolved", object, projection } — or { kind: "unresolved", ref, reason }
  // A rename does not resolve to the same-named object unless you record an explicit,
  // reviewed alias: registry.alias(oldRef, newRef, { reviewedBy: "...", meaningCheck: "..." });

  // The only path from a semantic object to a capability contract:
  const contracts = bindCapabilities(projection, [
    { semanticId: "logistics::Warehouse", capability: { id: "logistics.warehouse", version: "1.0.0", attributes: {} } },
  ]);
  contracts[0]!.semanticRef; // the provenance attached to the capability
}
```

## What the adapter adds over the parser

- **Typed, never-throwing loads.** `loadSemanticProjection` returns a `LoadResult`; parse
  failures are classified by message shape into `syntax`, `unresolved_reference`,
  `ambiguous_identity`, `binding_unavailable`, or `unknown`.
- **Stable identity.** Objects are identified as `namespace::name`. Flows get a deterministic
  derived id (`namespace::flow(resource|from|to)`) because the underlying parser assigns
  flows a fresh random id on every parse; a computed-id collision surfaces as
  `ambiguous_identity` instead of a silent merge.
- **Capability gating.** `bindCapabilities` throws on an unknown semantic id and refuses to
  bind `Policy` objects — policies are referenced constraints, never capabilities.
  Unbound objects produce nothing: no implicit capabilities.
- **A mapping table.** `mappingTable` records, for every DomainForge kind, whether it is
  supported, its framework view, meaning, cardinality, and source accessor. `External` is the
  one unmappable kind (it has no graph declaration).

## Limitations

- Pinned to `@godspeedai/domainforge` `0.19.0`. The projection records which binding produced
  it; newer parser versions require a deliberate adapter upgrade, not an accidental drift.
- Projections are read-only data. Nothing here executes models, enforces policies, or grants
  permissions — it makes semantics referenceable.
- Error classification matches the parser's human-readable messages; an unrecognized failure
  is reported as `unknown` with its text rather than misclassified.

## Related packages

- [`@godspeedai/domainforge`](https://www.npmjs.com/package/@godspeedai/domainforge) — the
  independent DomainForge parser this adapter wraps (kept at its own version, pinned here).
- [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api) —
  `SemanticRef` and `CapabilityContract` types the projection produces.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime that invokes bound capabilities.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
