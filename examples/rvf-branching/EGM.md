# rvf-branching — a branched RVF index diverging from its parent

## Overview
A parent portable cognition file is created on disk, seeded, and branched into a
child file. Both indexes are then mutated independently and queried, and the script
asserts neither sees the other's later writes while the child still records lineage
back to the parent.

## Interface
- `createRvfIndex` — opens an index at `(dimension, path)`, here `dimension: 4` and `<tmp>/parent.rvf` `[examples/rvf-branching/index.ts:createRvfIndex]`
- `index.upsert` — accepts full index entries with `sourceType`, `sourceRef`, `tenant`, `scopeId`, `embedding` as `Float32Array`, validity bounds, `indexerVersion`, `durable` `[examples/rvf-branching/index.ts:entry]`
- `parent.branch` — creates the child index at a new path and returns it `[examples/rvf-branching/index.ts:parent.branch]`
- `index.similar` — query `{ vector, k, tenant }` returning hits with `id` `[examples/rvf-branching/index.ts:parentHits]`
- `index.lineage` — returns `{ parentId, depth, fileId }` `[examples/rvf-branching/index.ts:lineage]`
- `index.close` — closes child then parent, each in its own `finally` `[examples/rvf-branching/index.ts:child.close]`

## Invariants
- A child-only entry (`b`) must not appear in the parent's results, checked with `parentHits.includes("b")` `[examples/rvf-branching/index.ts:parentHits]`.
- A parent-only entry added after branching (`c`) must not appear in the child's results `[examples/rvf-branching/index.ts:childHits]`.
- `lineage.parentId` of the child must equal the parent's own `fileId` from `parent.lineage()` `[examples/rvf-branching/index.ts:lineage.parentId]`.
- All queries are scoped to `tenant: "tenant-a"`, and all entries use `validFrom: "2026-01-01T00:00:00Z"` `[examples/rvf-branching/index.ts:entry]`.

## Side Effects
- Creates real files under a `mkdtempSync` directory and writes `parent.rvf` / `child.rvf` `[examples/rvf-branching/index.ts:mkdtempSync]`.
- Removes the temp directory with `rmSync(root, { recursive: true, force: true })` in `finally` `[examples/rvf-branching/index.ts:rmSync]`.

## Verification
- Run: `bun run example:rvf-branching`
