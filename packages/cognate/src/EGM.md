# cognate / src — SDK umbrella

## Overview

This package owns no implementation: every export is a re-export, so versioning, tree-shaking, and behavior stay with the owning `@godspeedai/cognate-*` package `[index.ts:1]`. Three entrypoints exist: the curated start-here surface at `.`, the full reference runtime at `./runtime`, and the full headless client at `./client`, matching the `exports` map in the manifest. Heavier adapters (cognitive backends, RealityTrace, DomainForge, transports, React bindings) are deliberate opt-ins and are not re-exported.

## Interface

- `createRuntime` and `CognitionOptions` / `RuntimeOptions` — re-exported from `@godspeedai/cognate-runtime-bun` `[index.ts:createRuntime]`
- `createClient` and `CognateClient` / `ClientOptions` / `RunState` / `ThreadSharedState` — re-exported from `@godspeedai/cognate-client` `[index.ts:createClient]`
- `AgentDefinition` / `Caller` / `RuntimeService` — re-exported types from `@godspeedai/cognate-runtime-api` `[index.ts:19]`
- `./runtime` — `export *` of `@godspeedai/cognate-runtime-bun` `[runtime.ts:2]`
- `./client` — `export *` of `@godspeedai/cognate-client` `[client.ts:2]`

## Invariants

- No value or type in `src/` is defined here; each export statement names an owning package `[index.ts:15]`
- The curated root surface deliberately omits cognitive backends, RealityTrace, DomainForge, protocol transports, and React bindings `[index.ts:1]`
- `./runtime` and `./client` are full-surface passthroughs and must not diverge from their owning packages `[runtime.ts:1]`

## Side Effects

- None. Importing any entrypoint performs no I/O, starts no clock, and opens no connection.

## Verification

- Run: `cd packages/cognate && bun test`
