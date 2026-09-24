# packages/domainforge

Adapter only: `Graph.parse` -> `SemanticProjection`. Never throw; classify
errors by `.message` (DEBT-002). Flow id is derived, never the native UUID
(DEBT-001). Don't edit `test/`, fixtures, or the pinned `@godspeedai/domainforge`
version. Keep `mappingTable` covering all 13 kinds.
