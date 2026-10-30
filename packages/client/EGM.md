# client

## Overview

Headless, framework-neutral client over `RuntimeService`: it exposes observable `Readable` values for run state, thread shared state, projections, and connection status, and it adapts event subscriptions with cursor resume `[src/index.ts:createClient]`. All exposed state is derived from durable events and can be rebuilt by replaying the tenant stream from position 0 `[src/index.ts:1]`. The entry point re-exports the `CognateClient`, `RunState`, `Readable`, and related types plus `createClient` from `./src/index.ts` `[package.json:exports]`. It depends only on `@godspeedai/cognate-events` and `@godspeedai/cognate-runtime-api`, with no React dependency `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the single-module engine implementing the client surface `[src/index.ts:createClient]`
- test/ — `client.test.ts` and `projection-convergence.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- Reconnect backoff defaults to 50 ms doubling to 2000 ms `[src/index.ts:createClient]`
- `startRun`, `cancelRun`, `updateState`, and `resolveContinuation` generate a `crypto.randomUUID()` idempotency key when the caller omits one `[src/index.ts:createClient]`
- `ConnectionStatus` is exactly `connecting`, `live`, `reconnecting`, `closed` `[src/index.ts:ConnectionStatus]`
- `RunState.status` may be `unknown`, so a run not yet observed is distinguishable from a real runtime status `[src/index.ts:RunState]`
- A shared-state write is accepted into the local thread store only after the service call returns `[src/index.ts:createClient]`
- `close()` closes the engine, awaits closure, then revokes remote offers `[src/index.ts:createClient]`

## Global Side Effects

- Network/service calls through the injected `RuntimeService` for every mutation `[src/index.ts:createClient]`
- Long-lived event subscriptions with automatic reconnect `[src/index.ts:subscribe]`
- Timer activity for reconnect backoff `[src/index.ts:ClientOptions]`
- `crypto.randomUUID()` generation for default idempotency keys `[src/index.ts:createClient]`

## Verification

- Run: `cd packages/client && bun test`
