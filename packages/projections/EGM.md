# projections — checkpointed rebuildable projections

## Overview

`package.json` declares `@godspeedai/cognate-projections`, checkpointed, idempotent, rebuildable projections over the durable event log (spec §11). The `exports` map has a single entry, `.`, resolving to `./src/index.ts`. Source lives in `src/`; the manifests for memory and SQLite stores appear as dev-only dependencies.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `ProjectionRunner`, the `Projection` contract, and the catch-up result type

## Global Invariants

- The only runtime dependency is `@godspeedai/cognate-events`, so the runner depends on the store port rather than a concrete store `[packages/projections/package.json:dependencies]`
- `@godspeedai/cognate-store-memory` and `@godspeedai/cognate-store-sqlite` are dev-only, so no store implementation ships with the package `[packages/projections/package.json:devDependencies]`

## Global Side Effects

- None at package load; checkpoint commits and event reads belong to the runner in `src/` `[packages/projections/package.json:exports]`

## Verification

- Run: `cd packages/projections && bun test`
