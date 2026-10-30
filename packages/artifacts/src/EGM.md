# artifacts / src — durable content-hashed artifacts

## Overview

`ArtifactService` stores artifact bytes content-addressed on a `DurableStore` and commits the record and its `artifact.created` event only after the bytes exist `[index.ts:ArtifactService]`. Access is authorized per record against a tenant and an optional reader list `[index.ts:isAuthorized]`. Removal is a tombstone plus reference-counted blob deletion, so no other artifact loses bytes `[index.ts:ArtifactService]`.

## Interface

- `ArtifactService` — `put`, `get`, `list`, `delete` over the collection `artifacts` `[index.ts:ArtifactService]`
- `ArtifactRecord` — id, name, media type, size, `sha256:<hex>` content hash, access, retention, semantic ref, run id, representations, state, tombstone `[index.ts:ArtifactRecord]`
- `ArtifactAccess` — tenant, scope id, and reader principal ids `[index.ts:ArtifactAccess]`
- `PutArtifact` — write input including optional id, retention, semantic ref, run id, and extra representations `[index.ts:PutArtifact]`
- `ReadResult` — `ok` | `denied` | `not_found` | `tombstoned` | `lost` `[index.ts:ReadResult]`

## Invariants

- Bytes are written before the record commits, so an artifact is never claimed available before its bytes exist `[index.ts:ArtifactService]`
- An empty `readers` list means any principal of the tenant; a non-empty list must contain the actor id `[index.ts:isAuthorized]`
- A record from another tenant is denied even when the actor is listed `[index.ts:isAuthorized]`
- A tombstoned record returns `tombstoned` rather than `denied` or `ok`, so deliberate removal is distinguishable from data loss `[index.ts:ArtifactService]`
- Missing bytes for an untombstoned record return `lost`, reported distinctly from removal `[index.ts:ArtifactService]`
- The first element of `representations` is the primary representation, and reading an unlisted media type is `not_found` `[index.ts:ArtifactService]`
- Deletion keeps a blob whose hash is still referenced by an available record other than the one deleted `[index.ts:ArtifactService]`

## Side Effects

- Blob writes and deletes through `DurableStore.putBlob` / `deleteBlob` `[index.ts:ArtifactService]`
- Durable commits of the `artifacts` record plus an `artifact.created` or `artifact.tombstoned` append on stream `artifact-<id>` `[index.ts:ArtifactService]`
- Clock reads via `new Date().toISOString()` for `occurredAt` and tombstone timestamps, and `randomUUID()` for ids `[index.ts:ArtifactService]`

## Verification

- Run: `cd packages/artifacts && bun test`
