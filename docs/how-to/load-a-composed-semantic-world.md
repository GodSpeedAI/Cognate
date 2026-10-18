# Load a canonical organizational world

Cognate's legacy `loadSemanticProjection(source, { uri })` is a **single-source** adapter over `Graph.parse(source)`. It does not resolve import graphs. Never concatenate or hash multiple independent `.sea` files and present the result as a canonical world.

## Compose a world

Put a root and its dependencies under `domain/`:

```text
domain/
  organization.sea
  finance.sea
  operations.sea
```

The root imports definitions from the child modules using DomainForge's actual import/export syntax. In `cognate.config.ts`:

```ts
export default {
  profile: "copilot",
  semanticWorld: { entry: "domain/organization.sea", name: "godspeed.org" },
};
```

`cognate dev` collects all `.sea` files recursively under `domain/`, resolves the declared root with `loadSemanticWorld`, and reports `semantic.worldRef`, `semantic.semanticClosureHash`, and `semantic.digest` through `/health`. An import failure aborts startup. Multiple files without a declared root are rejected; they are **not** silently treated as one combined world.

Or call the adapter explicitly:

```ts
import { loadSemanticWorld } from "@godspeedai/cognate-domainforge";

const result = loadSemanticWorld({
  entry: "domain/organization.sea",
  worldName: "godspeed.org",
  sources: {
    "domain/organization.sea": organizationSource,
    "domain/finance.sea": financeSource,
    "domain/operations.sea": operationsSource,
  },
});
if (!result.ok) throw new Error(JSON.stringify(result.error));
const { projection, worldRef, identity } = result;
```

The adapter delegates to DomainForge's **canonical source-map resolver**, including import/alias handling and source budgets. It invokes DomainForge to compute and verify `world_ref`; Cognate does not reinterpret hashes, merge namespaces or guess whether a dependency is equivalent. Every `SemanticRef.source.digest` in this projection is the complete resolved-world digest. Single-source load semantics and golden fixtures remain unchanged.

Use `identity.semantic_closure_hash` to distinguish meaning-preserving source edits from semantic changes: both may produce new `world_ref` values.

## Native dependency and proof gate

Requires the published DomainForge 0.21.1 binding, including `Graph.parseSourceMap(entryLogicalPath, sourcesJson)`. A missing native factory is an explicit error and never falls back to a partial graph. Before deploying a composed world, run `bun test packages/domainforge/test/world.test.ts` and verify a valid pinned `world_ref` is accepted by the target SEA-Forge registry.

A `world_ref` establishes the semantic model being used, not the current operational state, not authority to act, and not evidence of developmental settlement. Governed operations still require SEA-Forge authorization, and operational events remain Cognate and RealityTrace responsibilities.
