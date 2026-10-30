# packages/execution — execution-world contracts and providers

## Overview

Framework-owned execution-world contracts: filesystem and process ports, replaceable providers, and the `filesystem.*` / `process.*` capability component `[package.json:description]`. The root export publishes the ports, registry, providers, and capability component, while a separate subpath publishes the executable conformance suite `[package.json:exports]`. The package depends on the kernel API for `Component`, `CapabilityContract`, and `SemanticRef` types only, and on the Cordis kernel at development time only `[package.json:devDependencies]`. No transport or library type crosses this boundary `[src/types.ts:1]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the ten contract, provider, capability, and conformance sources
- test/ — per-provider suites that invoke the shared conformance contract; no separate contract

## Global Invariants

- `./conformance` is a public executable contract that external providers import instead of reimplementing `[package.json:exports]`
- `WorldKind` is deliberately an open `string`, so `local`, `memory`, and provider-specific names are not a closed enum `[src/types.ts:WorldKind]`
- Importing the conformance subpath registers `bun:test` suites in the consuming package `[src/conformance.ts:executionWorldConformance]`
- Every published capability id shares the single version `1.0.0` `[src/capabilities.ts:EXECUTION_CAPABILITY_VERSION]`
- The provider list is a fixed set of seven capability ids: six `filesystem.*` ids plus `process.exec` `[src/capabilities.ts:EXECUTION_CAPABILITY_IDS]`

## Global Side Effects

- The local provider performs host filesystem reads, writes, stats, and directory listings `[src/local.ts:localExecutionWorld]`
- Child processes are spawned for `exec`, with timers enforcing timeouts and abort `[src/local.ts:createLocalProcess]`
- The conformance suite writes files under a provider-owned root and disposes each provider after a test `[src/conformance.ts:executionWorldConformance]`

## Verification

- Run: `cd packages/execution && bun test`
