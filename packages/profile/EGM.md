# profile

## Overview

The profile package holds composition only: a profile is a named selection of registered component factories plus per-component options, and it introduces no kernel primitive `[src/index.ts:ProfileDefinition]`. Its `description` restates that boundary — "select and configure components without new kernel concepts (spec §29)" `[package.json:description]`. The sole runtime dependency is the workspace kernel contract, and nothing here mounts, resolves, or invokes anything.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `defineProfile`, `resolveProfile`, the profile/component entry types, and `ProfileError`
- test/ — `profile.test.ts`

## Global Invariants

- A validated profile is frozen, including its `components` list and `options` record, so a resolved composition cannot be mutated after definition `[src/index.ts:defineProfile]`
- Resolution never silently drops a requested component: every requested name lands either in `contributions` or in `unresolved` with a reason `[src/index.ts:resolveProfile]`
- An unsupported component carries a required `reason` that becomes the unresolved reason, so an unmet gate stays visible instead of disappearing `[src/index.ts:ComponentEntry]`
- Contributions preserve the profile's mount order rather than registry order `[src/index.ts:resolveProfile]`
- Composition only: the package depends on the kernel contract and nothing else `[package.json:dependencies]`

## Global Side Effects

- None beyond calling each supported component's `contribute` during `resolveProfile`, which is supplied by the caller `[src/index.ts:resolveProfile]`

## Verification

- Run: `cd packages/profile && bun test`
