# kernel-api

## Overview

The framework-owned kernel contract package. It declares the context, scope, capability, component, fiber, and effect types that any engine adapter must implement, plus the pure policy and version-compatibility helpers those contracts use. Its `description` states the boundary it enforces: "No engine types" `[package.json:description]`. It exposes two entrypoints, the contract root and a `conformance` subpath that carries the executable kernel suites `[package.json:exports]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the contract types, policies, compatibility predicate, error classes, and the `conformance/` suites an adapter runs

## Global Invariants

- The package depends on nothing at runtime (`peerDependencies` is empty), so every declaration here is contract rather than engine `[package.json:peerDependencies]`
- `Json` is re-declared locally instead of imported from `@godspeedai/cognate-events`, because that package already depends on this one and importing it would cycle the package graph `[src/types.ts:Json]`
- `Kernel` exposes exactly `root`, `mount`, `resolve`, `observe`, and `shutdown`; anything an engine adds beyond that is not contract `[src/types.ts:Kernel]`
- Capability eligibility is a pure function of requirement and contract, so an adapter cannot substitute a different resolution rule `[src/compat.ts:isCompatible]`

## Global Side Effects

- None. The package declares types, pure predicates, and error classes; the only process access is the `crypto.randomUUID` default named in `KernelOptions.ids`, which the engine supplies, not this package `[src/types.ts:KernelOptions]`

## Verification

- Run: `cd packages/kernel-cordis && bun test` — the conformance suites are executed by the engine adapter's test directory, not by this package
