# cognitive-rvf / src — optional RVF-backed cognitive index

## Overview

`createRvfIndex` wraps `@ruvector/rvf`'s `RvfDatabase` as a `CognitiveIndex` and adds snapshot, branch, and lineage `[index.ts:createRvfIndex]`. Because RVF 0.3.4 does not verify integrity on open, a Cognate-owned `RvfManifest` sidecar carries lineage, checkpoint, tenants, entry count, and an integrity digest `[index.ts:RvfManifest]`. `importSnapshot` verifies a manifest and its bytes before opening anything, and classifies the result as `attached`, `detached`, or `rejected` `[index.ts:importSnapshot]`.

## Interface

- `createRvfIndex` — opens a fresh index at a path and returns `RvfIndex` `[index.ts:createRvfIndex]`
- `RvfIndex` — `CognitiveIndex` plus `snapshot(store, options)`, `branch(path)`, `lineage()` `[index.ts:RvfIndex]`
- `snapshot` — writes `<name>.rvf`, `<name>.entries.json`, `<name>.manifest.json`, then records the manifest in collection `rvf_snapshots` `[index.ts:RvfIndex]`
- `importSnapshot` — verify-then-open for an existing snapshot `[index.ts:importSnapshot]`
- `RvfManifest` — format `cognate.rvf.v1`, lineage, checkpoint, snapshot/parent ids, tenants, entry count, integrity `[index.ts:RvfManifest]`
- `ImportResult` — `attached` / `detached` with index and manifest, or `rejected` with a reason `[index.ts:ImportResult]`
- `isFsyncFailed` — true only for `RvfError` with code `FsyncFailed`, matched by code and never by message `[index.ts:isFsyncFailed]`

## Invariants

- Opening a path resets the backing file and its sidecars, so RVF never serves an entry this adapter has no provenance for; the only way to keep entries is `importSnapshot` `[index.ts:createRvfIndex]`
- Every entry's dimension is validated before any native ingest or sidecar write, so a mismatched batch mutates nothing `[index.ts:RvfIndex]`
- `similar` overfetches and filters by tenant and scope in-process, dropping hits with no known provenance, and converts RVF distance to `1 / (1 + distance)` `[index.ts:RvfIndex]`
- A snapshot with `indexedThrough < storeHead` and `onBehind: "fail"` throws instead of writing a partial checkpoint `[index.ts:RvfIndex]`
- No file write happens before all snapshot files can be produced; the durable `rvf_snapshots` record commits only after the files exist `[index.ts:RvfIndex]`
- Import rejects on unsupported format, digest mismatch, entry count over `maxEntries`, size over `maxBytes`, or a tenant outside `allowedTenants` `[index.ts:importSnapshot]`
- Import opens a fresh temporary copy and never mutates the source snapshot files `[index.ts:importSnapshot]`
- Attached requires matching lineage, a checkpoint at or before the store head, and a `rvf_snapshots` record with the same integrity `[index.ts:importSnapshot]`
- Index creation retries `FsyncFailed` up to five attempts with linear backoff `[index.ts:createWithFsyncRetry]`

## Side Effects

- Native `RvfDatabase.create` / `open` / `branch` / `ingestBatch` / `delete` / `query` / `close` calls `[index.ts:createRvfIndex]`
- Filesystem writes of the `.rvf` file, the entries sidecar, and the manifest; temporary files under `tmpdir()` during import `[index.ts:importSnapshot]`
- `Bun.sleep` between fsync retries, and `fsync`-affecting native persistence `[index.ts:createWithFsyncRetry]`
- Durable commits into collection `rvf_snapshots` `[index.ts:RvfIndex]`

## Verification

- Run: `cd packages/cognitive-rvf && bun test`
