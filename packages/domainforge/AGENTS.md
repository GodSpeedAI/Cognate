# packages/domainforge

Adapter only: `Graph.parse` -> `SemanticProjection`. Never throw; classify
errors by `.message` (DEBT-002). Flow id is derived, never the native UUID
(DEBT-001). Don't edit `test/`, fixtures, or the pinned `@godspeedai/domainforge`
version. Keep `mappingTable` covering all 13 kinds.

## Pin changes

The pin moves only as a stack-wide DomainForge lockstep bump that the owner has
approved. In that case the manifest pin, `BINDING` in `src/types.ts`, the binding
string in the projection fixture, the lockfile entries and `DOMAINFORGE_VERSION`
in CI move together in one change; nothing else in `test/` or the fixtures is
edited. Record each approved bump here.

| Date | From | To | Approved by | Change |
|---|---|---|---|---|
| 2026-11-13 | 0.21.1 | 0.21.2 | owner | #77 (RealityTrace and the DomainForge head were already on 0.21.2; readiness gate C01) |
