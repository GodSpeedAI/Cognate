# runtime-api

## Overview

`package.json` declares `@godspeedai/cognate-runtime-api` at version `0.8.0`: the transport-independent runtime service contract, the agent authoring surface, and the service conformance kit. The `exports` map has two entries, `.` resolving to `./src/index.ts` and `./conformance` resolving to `./src/conformance.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; all contract modules live in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the `RuntimeService` and `RunContext` contracts, state patching, frontend capability invocation, and `runtimeServiceConformance`

## Global Invariants

- Runtime dependencies are `@godspeedai/cognate-events` and `@godspeedai/cognate-kernel-api` only, so the service contract names framework types and no transport `[packages/runtime-api/package.json:dependencies]`
- The conformance kit is a separate export path because it imports `bun:test`, keeping the test-only surface out of the `.` entry `[packages/runtime-api/package.json:exports, packages/runtime-api/src/conformance.ts:runtimeServiceConformance]`
- There is no `test/` directory in this package; the kit is executed from the runtime and transport packages that satisfy it `[packages/runtime-api/src/conformance.ts:runtimeServiceConformance]`

## Global Side Effects

- None at package load; the kit registers `describe`/`test` blocks with `bun:test` and closes each factory-created handle in `afterEach` `[packages/runtime-api/src/conformance.ts:runtimeServiceConformance]`

## Verification

- Run: `cd packages/runtime-api && bun test`
