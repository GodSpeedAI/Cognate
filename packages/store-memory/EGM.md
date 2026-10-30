# store-memory

## Overview

`package.json` declares `@godspeedai/cognate-store-memory` at version `0.8.0`: an in-memory `DurableStore` with the same semantics as the SQLite store, used for tests and ephemeral runtimes. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the store implementation lives in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `createMemoryStore`, the internal `State` maps, and the code-point ordering helpers
- test: `conformance.test.ts` and `isolation.test.ts` — the store's own suites (not contract targets)

## Global Invariants

- The only runtime dependency is `@godspeedai/cognate-events`, so the store is built against the port and its error types rather than another implementation `[packages/store-memory/package.json:dependencies]`
- Parity with the SQLite store is proven by running the shared `storeConformance` suite from `@godspeedai/cognate-events/conformance` `[packages/store-memory/test/conformance.test.ts:storeConformance]`
- Listing order is code-point order, matching SQLite's BINARY collation rather than plain UTF-16 comparison `[packages/store-memory/src/index.ts:compareCodePoints]`

## Global Side Effects

- None: all state (events, records, outbox, projections, blobs, listeners) is held in process memory and dropped on `close()` `[packages/store-memory/src/index.ts:createMemoryStore]`

## Verification

- Run: `cd packages/store-memory && bun test`
