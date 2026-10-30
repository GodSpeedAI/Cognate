# domainforge / src — DomainForge Graph adapter

## Overview

This package is the only Cognate importer of `@godspeedai/domainforge@0.21.1`, enforcing a version-pinned adapter boundary `[index.ts:1]`. It turns a parsed DomainForge `Graph` into a read-only `SemanticProjection` of `SemanticObject` / `SemanticRelation` values plus an explicit `unmapped` list `[index.ts:projectGraph]`. `mappingTable` documents every DomainForge kind including unsupported ones with a source-backed reason `[index.ts:mappingTable]`. The adapter never grants capabilities or authority `[index.ts:projectGraph]`.

## Interface

- `loadSemanticProjection` — parses one standalone `.sea` source into a projection, returning a typed `LoadResult` `[index.ts:loadSemanticProjection]`
- `loadSemanticWorld` — resolves a multi-module world with `Graph.parseSourceMap`, producing a `worldRef` and `DomainModelIdentity` `[index.ts:loadSemanticWorld]`
- `mappingTable` — one `MappingRow` per DomainForge kind with view, meaning, cardinality, and provenance `[index.ts:mappingTable]`
- `classifyParseError` — maps a thrown error to `ambiguous_identity`, `unresolved_reference`, `syntax`, `binding_unavailable`, or `unknown` `[index.ts:classifyParseError]`
- `serializeProjection` — deterministic JSON with stable sort order for archiving and golden fixtures `[index.ts:serializeProjection]`
- `SemanticRegistry` — archive of projections by source digest with `register`, `resolve`, `alias`, `aliasesOf` `[index.ts:SemanticRegistry]`
- `bindCapabilities` — binds explicitly named semantic ids to capability contracts `[index.ts:bindCapabilities]`
- `PROJECTION_SCHEMA` = `cognate.semantic.v1` and `BINDING` = `@godspeedai/domainforge@0.21.1` `[types.ts:PROJECTION_SCHEMA]`

## Invariants

- A computed id claimed by two different native ids raises an ambiguous-identity error classified before the generic mapper `[index.ts:AmbiguousIdentityError]`
- `loadSemanticWorld` fails closed when `Graph.parseSourceMap` is absent rather than returning a partial graph `[index.ts:loadSemanticWorld]`
- References in a composed world are pinned to DomainForge's verified resolved-world digest, not a locally concatenated file hash `[index.ts:loadSemanticWorld]`
- `SemanticRegistry.resolve` returns a typed `unresolved` with reason `unknown_source` or `not_in_source`, never a same-named current object `[index.ts:SemanticRegistry]`
- Aliases are recorded only through explicit `alias(...)` with `reviewedBy` and `meaningCheck` `[index.ts:SemanticRegistry]`
- `bindCapabilities` throws for an unknown semantic id and for a `Policy` object, which is a referenced constraint only `[index.ts:bindCapabilities]`
- Imports in a `.sea` source require `loadSemanticWorld`; `Graph.parse` alone cannot resolve them `[index.ts:loadSemanticProjection]`

## Side Effects

- Native DomainForge binding calls for parse, source-map resolution, identity, and world-ref verification `[index.ts:loadSemanticWorld]`
- SHA-256 of each loaded source echoed into `projection.source.digest` `[index.ts:loadSemanticProjection]`

## Verification

- Run: `cd packages/domainforge && bun test`
