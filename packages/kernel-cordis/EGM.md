# kernel-cordis

## Overview

The Cordis-backed implementation of the kernel contract. Its `description` names the scope rule the package enforces on the dependency graph: it is "the only package allowed to import cordis" `[package.json:description]`. It pins `cordis` at `4.0.0-rc.10` alongside the workspace kernel contract `[package.json:dependencies]`. Cordis supplies the fiber/plugin lifecycle primitive; the state machine, retry, timeout, leasing, and capability registry layered on top are adapter-owned.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the kernel implementation: kernel, scope, fiber, lease, and capability registry
- test/ — Bun test suites covering lifecycle, dependencies, effects, scopes, authority, and the contract conformance run

## Global Invariants

- No Cordis type appears in any exported signature; the package's single public export is a `KernelFactory` `[src/index.ts:createCordisKernel]`
- `cordis` is a direct dependency of this package only, so the pinned `4.0.0-rc.10` upgrade surface is one package `[package.json:dependencies]`
- Every activation attempt is a real Cordis plugin mounted through a scope's own Cordis `Context` `[src/fiber.ts:FiberUnit]`

## Global Side Effects

- Each `Scope` owns a distinct Cordis `Context` obtained via `isolate()`, so mounting a component allocates a live framework object `[src/scope.ts:ScopeImpl.child]`
- Timers are used for activation timeouts, retry backoff, and per-invocation deadlines `[src/fiber.ts:runAttempt]`

## Verification

- Run: `cd packages/kernel-cordis && bun test`
