# packages/cognitive-rvf

## Overview

"Optional RVF-backed CognitiveIndex with snapshot/branch, Cognate-owned integrity manifests, and attached/detached import classification (spec §18; DEBT-006 mitigations)" `[packages/cognitive-rvf/package.json:description]`. It wraps the native `@ruvector/rvf` `0.3.4` binding behind the same `CognitiveIndex` contract the in-process implementation satisfies `[packages/cognitive-rvf/src/index.ts:1]`. Because RVF 0.3.4 does not verify integrity on open, this package owns a sidecar manifest with its own sha256 digest `[packages/cognitive-rvf/src/index.ts:RvfManifest]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `RvfIndex`, snapshot/import, and the manifest contract

## Global Invariants

- The adapter is strictly optional: it is not a dependency of the reference runtime's dependency list and adds a native binding `[packages/cognitive-rvf/package.json:dependencies]`
- The RVF version is pinned exactly (`0.3.4`), not ranged `[packages/cognitive-rvf/package.json:dependencies]`
- Only `.` is exported and only `src` is published `[packages/cognitive-rvf/package.json:exports]`
- The conformance suite and the adapter-specific suite both run from this package `[packages/cognitive-rvf/test/conformance.test.ts:1, packages/cognitive-rvf/test/rvf.test.ts:1]`

## Global Side Effects

- Native RVF database creation, ingest, query, and delete against a filesystem path `[packages/cognitive-rvf/src/index.ts:RvfIndex]`
- Snapshot and import copy `.rvf` files plus their sidecars, and write `<name>.manifest.json` `[packages/cognitive-rvf/src/index.ts:SnapshotOptions]`
- A snapshot manifest is recorded in the durable store's `rvf_snapshots` collection `[packages/cognitive-rvf/src/index.ts:RvfIndex]`

## Verification

- Run: `cd packages/cognitive-rvf && bun test`
