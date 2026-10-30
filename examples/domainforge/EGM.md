# domainforge — semantic projection and explicit capability binding

## Overview
A small DomainForge (`.sea`) source is loaded into a read-only semantic projection of
objects and relations, serialized twice to check determinism, and then bound to
capabilities. The point of the script is the boundary: nothing in the projection is
invocable until an application binds it explicitly.

## Interface
- `loadSemanticProjection` — parses source with `{ uri: "example:///logistics.sea" }` and returns a result with `ok`, `projection`, or `error` `[examples/domainforge/index.ts:loadSemanticProjection]`
- `projection.objects` / `projection.relations` — read-only semantic objects (with `ref.id`, `kind`) and typed relations such as `flow.from` `[examples/domainforge/index.ts:projection.objects]`
- `serializeProjection` — canonical serialization used to compare two independent loads byte for byte `[examples/domainforge/index.ts:serializeProjection]`
- `bindCapabilities` — takes a projection and an explicit binding list, returning capability contracts with provenance `[examples/domainforge/index.ts:bindCapabilities]`
- `mappingTable` — the table of model kinds with a `supported` flag, filtered here to supported kinds `[examples/domainforge/index.ts:mappingTable]`

## Invariants
- A load failure is fatal: the script throws with `result.error` rather than continuing with a partial projection `[examples/domainforge/index.ts:result.ok]`.
- `Warehouse` must resolve to `kind === "Entity"` under the id `logistics::Warehouse` `[examples/domainforge/index.ts:warehouse]`.
- A `flow.from` relation must point at `logistics::Warehouse`, so relations are asserted independently of objects `[examples/domainforge/index.ts:flow]`.
- `bindCapabilities(projection, [])` must produce zero capabilities, and the bound contract's `semanticRef.id` must equal `logistics::Warehouse` `[examples/domainforge/index.ts:bindCapabilities]`.
- `Entity` and `Flow` must both appear in the supported rows of `mappingTable` `[examples/domainforge/index.ts:supportedKinds]`.

## Side Effects
- None observed: the source string is inline and no file is read from the `example:///` URI `[examples/domainforge/index.ts:source]`.

## Verification
- Run: `bun run example:domainforge`
