# profile/src — profile composition primitives

## Overview
This directory holds the entire profile layer: two functions and the types they exchange. A profile is a named selection of registered component factories plus per-component options, and the module header states it introduces no kernel primitive `[packages/profile/src/index.ts:Profiles are composition]`. `defineProfile` validates and freezes a definition; `resolveProfile` turns a definition plus a caller-supplied registry into contributions and an explicit unresolved list.

## Interface
- `ProfileDefinition` — frozen `name`, `description`, ordered `components`, and `options` `[packages/profile/src/index.ts:ProfileDefinition]`
- `ProfileError` — `Error` subclass whose `name` is `"ProfileError"` `[packages/profile/src/index.ts:ProfileError]`
- `defineProfile(profile)` — validates, normalizes, freezes, and returns a `ProfileDefinition` `[packages/profile/src/index.ts:defineProfile]`
- `ComponentEntry<T>` — registered factory: `name`, `package`, `supported`, optional `reason`, and `contribute(options)` `[packages/profile/src/index.ts:ComponentEntry]`
- `ResolvedProfile<T>` — the profile, ordered `contributions`, and `unresolved` entries `[packages/profile/src/index.ts:ResolvedProfile]`
- `resolveProfile<T>(profile, registry)` — resolves names against the registry in profile order `[packages/profile/src/index.ts:resolveProfile]`

## Invariants
- An empty profile name throws `ProfileError("profile name must not be empty")` `[packages/profile/src/index.ts:defineProfile]`
- Component names must be non-empty and unique; a repeat throws ``duplicate component name: ${name}`` `[packages/profile/src/index.ts:defineProfile]`
- The returned definition, its `components` array, and its `options` record are all frozen `[packages/profile/src/index.ts:defineProfile]`
- `description` defaults to `""` and `options` to `{}` when omitted `[packages/profile/src/index.ts:defineProfile]`
- A requested name missing from the registry becomes `unresolved` with reason `"unknown component"` `[packages/profile/src/index.ts:resolveProfile]`
- A registered but unsupported entry becomes `unresolved` with its own `reason`, falling back to `"unsupported component"` `[packages/profile/src/index.ts:resolveProfile]`
- `contribute` receives `profile.options[name]`, untyped, so each factory owns its own validation `[packages/profile/src/index.ts:resolveProfile]`

## Side Effects
- Calls each supported entry's `contribute` during resolution; the module performs no I/O of its own `[packages/profile/src/index.ts:resolveProfile]`

## Verification
- Run: `cd packages/profile && bun test`
