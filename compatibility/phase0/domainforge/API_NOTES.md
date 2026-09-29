# `@godspeedai/domainforge` 0.16.0 — Phase 0 API notes (Bun 1.4)

Verified against the exact-pinned npm package under `bun install` in this
directory; snippets are copied from working test/probe code, not the
package's own docs. See `domainforge.test.ts` for the runnable proof and
`.agents/evidence/phase0-domainforge.md` for the full evidence log.

**2026-09-28:** this fixture now pins `@godspeedai/domainforge@0.18.1`
(bumped from 0.17.0; `bun.lock` regenerated via scoped `bun install` here).
The notes below still characterize 0.16.0 behaviour as originally verified —
no observed-behaviour changes; the suite passes unmodified against 0.18.1
(3/3 runs, 9 pass / 0 fail each).

## Import

```ts
import { Graph } from "@godspeedai/domainforge";
```

`main`/`types` resolve to a single-file N-API build
(`domainforge-core.linux-x64-gnu.node` on this host) bundled directly in the
package (no `optionalDependencies` platform split observed on npm for this
version — `files` uses a `domainforge-core.*.node` glob). Bun `>= 1.1.0` is
declared in `engines`; this fixture verifies Bun 1.4.0 specifically.

## Graph API (verified subset)

```ts
class Graph {
  constructor();
  static parse(source: string): Graph;           // throws on syntax/reference errors
  addEntity(e: Entity): void;
  addResource(r: Resource): void;
  addFlow(f: Flow): void;
  addInstance(i: ResourceInstance): void;
  addRole(r: Role): void;
  addRelation(r: Relation): void;
  entityCount(): number; resourceCount(): number; flowCount(): number;
  instanceCount(): number; roleCount(): number; relationCount(): number;
  hasEntity(id: string): boolean;   // throws if id is not UUID-shaped
  getEntity(id: string): Entity | null;
  findEntityByName(name: string): string | null;  // returns id or null
  findResourceByName(name: string): string | null;
  findRoleByName(name: string): string | null;
  flowsFrom(entityId: string): Flow[];
  flowsTo(entityId: string): Flow[];
  allEntities(): Entity[]; allResources(): Resource[]; allFlows(): Flow[];
  allInstances(): ResourceInstance[]; allRoles(): Role[]; allRelations(): Relation[];
  addPolicy(policyJson: string): void;
  evaluatePolicy(policyJson: string): EvaluationResult;
  setEvaluationMode(useThreeValuedLogic: boolean): void;
  useThreeValuedLogic(): boolean;
  exportCalm(): string; static importCalm(json: string): Graph;
  exportProtobuf/exportAiLearning/exportLean/exportRdfProjection/exportBpmn/
    exportCmmn/exportArchimate/exportOtelSemconv/exportBaml/exportDspy/
    exportZenml(...): string | JSON-string (contract/export outputs; not
    exercised by this Phase 0 fixture — record as unmapped for V0);
  toString(): string;
}
```

## Typed collection shapes (constructor + getters, verified)

| Class | Constructor | Getters |
| --- | --- | --- |
| `Entity` | `(name, namespace?)` | `id, name, namespace` |
| `Resource` | `(name, unit, namespace?)` | `id, name, unit, namespace` |
| `Flow` | `(resourceId, fromId, toId, quantity)` | `id, resourceId, fromId, toId, quantity, namespace` |
| `ResourceInstance` | `(resourceId, entityId, namespace?)` | `id, resourceId, entityId, namespace` |
| `Instance` | `(name, entityType, namespace?)` | `id, name, entityType, namespace` |
| `Role` | `(name, namespace?)` | `id, name, namespace` |
| `Relation` | `(name, subjectRoleId, predicate, objectRoleId, namespace?, viaFlowId?)` | `id, name, namespace, subjectRoleId, predicate, objectRoleId, viaFlowId` |
| `Metric` | (no public ctor) | `name, namespace, threshold, target, unit, severity` |
| `Mapping` / `Projection` | (no public ctor) | `name, targetFormat` |
| `Dimension` | `static parse(name)` | `name` |
| `Unit` | `(symbol, name, dimension, baseFactor, baseUnit)` | `symbol, name, dimension, baseFactor, baseUnit` |

All entity-like classes also expose `setAttribute(key, valueJson)` /
`getAttribute(key)` (JSON-string values) and `toString()`.

`id` is always a string that renders as a UUID (v5-shaped for Entity/
Resource/Role/Instance; v4-shaped and **not deterministic** for Flow — see
Identity below). `hasEntity`/`getEntity`-style lookups validate the id
argument's shape and **throw** `Invalid UUID: ...` (`code: "GenericFailure"`)
for a malformed string, rather than returning `false`/`null`; a well-formed
but absent id returns `false`/`null` as expected.

## Complete `ConceptKind` enum (from `index.d.ts`)

```
Entity = 0, Resource = 1, Role = 2, Flow = 3, Policy = 4,
Metric = 5, Dimension = 6, Unit = 7, External = 8
```

Graph exposes first-class typed collections (add/count/get/all) for
**Entity, Resource, Flow, ResourceInstance/Instance, Role, Relation**.
**Policy** is add/evaluate-only via JSON string, not a typed collection.
**Metric, Dimension, Unit, Mapping, Projection** are standalone value
classes with no visible `Graph.addX`/`allX` accessor in this version —
they surface only through the export/contract methods (e.g.
`entityContractJson`, `exportRdfProjection`) or must be constructed
independently. **External** has no visible constructor/collection at all
in this binding. This is the mapping-table gap the adapter's kind table
(spec §19) must record explicitly as "unsupported / unmapped in V0."

## Error shapes (verified, `Graph.parse`)

Both a missing-reference error and a syntax error are a plain `Error`
instance with the **same** `code: "GenericFailure"` (the generic napi-rs
status), distinguished only by `.message` text:

```
Parse error: Undefined entity: Nowhere at 0:0
Parse error: Syntax error at 1:1: expected program
```

There is no dedicated exception class, no structured `{ severity, span }`
diagnostic object, and no line/column beyond what's embedded in the message
string (`"at 0:0"` was observed for the reference error — the position was
not resolved to a real location). **Adapters must not branch on `.code`**
to distinguish error kinds; they must parse or pattern-match `.message`.

## Identity (verified against spec §7.1's `namespace::name` claim)

* **Entity / Resource**: id is **content-derived and stable** — parsing the
  same source twice yields identical ids; renaming the entity or changing
  its namespace yields a **new** id; an untouched sibling entity's id is
  unaffected. Consistent with `namespace::name`-derived identity.
* **Flow**: id is **not stable** across two parses of byte-identical
  source — each parse mints a new v4-shaped UUID. An adapter's `SemanticRef`
  for a Flow **cannot** rely on cross-parse id stability; it must derive
  Flow identity from `(resourceId, fromId, toId)` plus source digest instead,
  or treat Flow SemanticRefs as parse-scoped only. This is recorded as a
  failing/`observed:` characterization test, not silently worked around.

## Contract / policy outputs

`entityContractJson(entityId)` returns a JSON string or `null` for
"bodyless legacy entities." `evaluatePolicy(policyJson)` returns
`{ isSatisfied, isSatisfiedTristate?, violations: Violation[] }` where
`Violation = { name, message, severity: Severity }`. Not exercised in this
fixture's fixtures (no sample policy JSON authored); recorded as an open
question for the adapter's policy mapping.

## Open questions (carried to evidence log)

* Flow identity instability across re-parses — confirmed above; needs an
  adapter-level identity strategy before Phase 5.
* No visible Graph accessor for Metric/Dimension/Unit/Mapping/Projection —
  unclear if reachable via untested SEA syntax or only via exports; needs a
  grammar-level check against `tree-sitter-sea`/`sea-rs` before the
  adapter's mapping table is finalized.
* `External` concept kind has no discovered constructor/collection at all.
* macOS/Windows/other-arch load unverified (this host is `linux-x64-gnu`);
  `napi.triples.additional` lists darwin/win32 but only one native binary
  was installed here.
