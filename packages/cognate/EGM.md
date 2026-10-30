# packages/cognate

## Overview

The SDK umbrella package: "one import for the reference runtime, the headless client, and their core contracts" `[packages/cognate/package.json:description]`. It owns no implementation — `src/index.ts` states that every export is a re-export so versioning, tree-shaking, and behavior stay with the owning `@godspeedai/cognate-*` package `[packages/cognate/src/index.ts:3]`. The manifest exposes three subpaths, `.`, `./runtime`, and `./client` `[packages/cognate/package.json:exports]`, and depends only on `cognate-client`, `cognate-runtime-api`, and `cognate-runtime-bun` `[packages/cognate/package.json:dependencies]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the three re-export entrypoints and the curated root surface

## Global Invariants

- Heavier adapters (cognitive backends, RealityTrace, DomainForge, protocol transports, React bindings) are deliberate opt-ins and are not re-exported from the root entrypoint `[packages/cognate/src/index.ts:6]`
- Only three workspace packages may be reachable from this package, so the umbrella cannot widen the graph `[packages/cognate/package.json:dependencies]`
- `files` publishes `src` only, so tests never ship `[packages/cognate/package.json:files]`
- `engines.bun` is pinned to `>=1.4.0` `[packages/cognate/package.json:engines]`
- The package is `type: module` and imports are ESM-only `[packages/cognate/package.json:type]`

## Global Side Effects

- None. The package's own suite asserts that every documented entrypoint resolves and that the re-exported runtime and client execute a capability, without the package itself performing I/O `[packages/cognate/test/cognate.test.ts:describe]`

## Verification

- Run: `cd packages/cognate && bun test`
