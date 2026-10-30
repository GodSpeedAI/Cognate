# packages/domainforge — version-pinned DomainForge adapter

## Overview

This package owns the only Cognate import of the `@godspeedai/domainforge` native binding, pinned to `0.21.1` in `dependencies` and mirrored by the adapter's own `BINDING` constant `[package.json:dependencies]`. Its single export entry point resolves to the adapter implementation, so every consumed symbol arrives through `src/index.ts` re-exporting `src/types.ts` `[package.json:exports]`. The declared scope is turning DomainForge Graph output into `SemanticRefs` and read-only semantic projections, not executable capabilities `[package.json:description]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — adapter implementation, projection types, and the `BINDING` pin
- test/ — adapter, diagnostics, identity, and world tests with `.sea` fixtures and a golden projection; no separate contract

## Global Invariants

- `BINDING` is the literal `@godspeedai/domainforge@0.21.1`, which must stay equal to the declared dependency range `[src/types.ts:BINDING]`
- `PROJECTION_SCHEMA` is the schema marker `cognate.semantic.v1` that every emitted projection carries `[src/types.ts:PROJECTION_SCHEMA]`
- The substrate check re-reads `BINDING` from source and fails when the installed `node_modules` copy disagrees `[scripts/check-substrate.ts:82]`
- A `BINDING` line that does not parse as `BINDING = "name@version"` is itself a substrate error `[scripts/check-substrate.ts:86]`
- The package publishes only `src` and declares Bun `>=1.4.0` `[package.json:engines]`

## Global Side Effects

- Reads the design spec, requirements ledger, status, and debt files from disk and parses YAML `[scripts/check-substrate.ts:5]`
- Reads `packages/domainforge/node_modules/@godspeedai/domainforge/package.json` to compare the installed version `[scripts/check-substrate.ts:92]`
- Terminates the process with exit status 1 when any collected error remains `[scripts/check-substrate.ts:102]`

## Verification

- Run: `cd packages/domainforge && bun test`
- Run: `bun run check`
