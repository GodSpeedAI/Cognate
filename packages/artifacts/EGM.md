# artifacts

## Overview

Blueprint directory for `@godspeedai/cognate-artifacts`, which provides durable, addressable, content-hashed artifacts with access policy, retention, and tombstones `[packages/artifacts/package.json:description]`. Its single source module defines the artifact record shape, the authorization predicate, and the `ArtifactService` that writes bytes through a `DurableStore` before committing the record and its event `[packages/artifacts/src/index.ts:ArtifactService]`. The only public entrypoint is `./src/index.ts` `[packages/artifacts/package.json:exports]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the artifact record types and `ArtifactService` in `index.ts`
- test/ — behavior tests for this package; not a source boundary
- No child `EGM.md` exists under this package.

## Global Invariants

- Bytes are written content-addressed before the record and `artifact.created` event commit, so an artifact is never claimed available before its bytes exist `[packages/artifacts/src/index.ts:ArtifactService.put]`
- Reads are authorized by tenant equality and, when `readers` is non-empty, membership of the actor id; access is denied before tombstone or blob state is consulted `[packages/artifacts/src/index.ts:isAuthorized]`
- `ReadResult` distinguishes five outcomes — `ok`, `denied`, `not_found`, `tombstoned`, `lost` — and reports missing bytes without a tombstone as `lost` rather than `not_found` `[packages/artifacts/src/index.ts:ReadResult]`
- `get` addresses the first representation by default, or the representation whose `mediaType` matches the requested one; an unmatched representation is `not_found` `[packages/artifacts/src/index.ts:ArtifactService.get]`
- `delete` tombstones the record, appends `artifact.tombstoned`, then deletes only hashes no other available artifact still references `[packages/artifacts/src/index.ts:ArtifactService.delete]`
- Materialized records default retention class to `default` and `until` to `null`, and record state starts `available` with no tombstone `[packages/artifacts/src/index.ts:ArtifactService.put]`

## Global Side Effects

- Blob writes and reads in the injected `DurableStore` `[packages/artifacts/src/index.ts:ArtifactService.put]`
- Durable commits of record versions plus `artifact.created` / `artifact.tombstoned` stream appends `[packages/artifacts/src/index.ts:ArtifactService.delete]`
- `randomUUID` for artifact ids, event ids, and tombstone correlation ids, and `new Date().toISOString()` clock reads `[packages/artifacts/src/index.ts:ArtifactService.put]`

## Verification

- Run: `cd packages/artifacts && bun test`
