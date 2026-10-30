# phase0

## Overview
One directory per Phase 0 dependency proof, each carrying its own `package.json`,
`bun.lock`, and `node_modules`. `connect/` and `ui/` form a linked vertical slice:
hand-written `.proto` sources produce generated TypeScript that a `src/` client and
server consume, and a React client bundle is served and hydrated in a browser.
`sqlite.test.ts` is the single loose file at this level.

## Subdirectories & Boundaries
- connect: [./connect/EGM.md](./connect/EGM.md) — Connect RPC over `Bun.serve()`, from `.proto` through generated code to client and server
- ui: [./ui/EGM.md](./ui/EGM.md) — React 19 + Astryx SSR, hydration, and browser bundling
- ag-ui/ — `@ag-ui/core` event and schema characterization
- cordis/ — `cordis` fiber/effect lifecycle characterization
- domainforge/ — DomainForge N-API Graph binding characterization
- mcp/ — Model Context Protocol server/client over an in-memory transport
- realitytrace/ — RealityTrace CLI and record-schema characterization
- ruvector/ — `@ruvector/core` binding characterization, outside the framework dependency graph
- rvf/ — exact-pinned `@ruvector/rvf` fixture, intentionally not a workspace member
- sona/ — `@ruvector/sona` ranking characterization, outside the framework dependency graph

## Global Invariants
- Each fixture suite is named for its dependency (`<dep>.test.ts`) and is run only from inside its own directory `[compatibility/phase0/rvf/rvf.test.ts:bun test]`.
- Characterizing a package does not admit it to the framework dependency graph `[compatibility/phase0/sona/sona.test.ts:framework dependency]`.
- An exact-pinned fixture keeps its tree off the root lockfile by not being a workspace member `[compatibility/phase0/rvf/rvf.test.ts:package.json]`.

## Global Side Effects
- SQLite characterization creates and deletes temporary directories `[compatibility/phase0/sqlite.test.ts:mkdtempSync]`.
- Connect and UI fixtures bind loopback ports, and the UI fixture kills a spawned child on teardown `[compatibility/phase0/ui/pw-global-setup.ts:globalSetup]`.

## Verification
- Run: `cd compatibility/phase0/connect && bun test`
- Run: `cd compatibility/phase0/ui && bun test ui.test.tsx`
- Run: `bun test ./compatibility/phase0/sqlite.test.ts` (from the repo root)
