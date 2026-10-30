# kernel-api / src / conformance — executable kernel contract

## Overview

Six suites that any kernel engine adapter calls from its own tests: `contractSuite`, `lifecycleSuite`, `effectsSuite`, `dependenciesSuite`, `scopesSuite`, and `authoritySuite` `[suites.ts:contractSuite]`. The module exposes the suites through `./suites.ts` and the fixtures namespace through `./harness.ts` `[index.ts:1]`. `packages/kernel-cordis` imports these suites over the `@godspeedai/cognate-kernel-api/conformance` export map `[packages/kernel-api/package.json:exports]`.

## Interface

- `contractSuite` / `lifecycleSuite` / `effectsSuite` / `dependenciesSuite` / `scopesSuite` / `authoritySuite` — the six executable suites `[suites.ts:authoritySuite]`
- `fixtures` — namespace re-export of the harness module `[index.ts:2]`
- `harness` — builds a kernel from a factory with a recorded event log and effect log `[harness.ts:harness]`
- `provider` / `consumer` — component factories that record setup and teardown markers `[harness.ts:provider]`
- `allowAll` and `contract` / `invocation` — permissive policy and contract/context builders `[harness.ts:allowAll]`
- `until` / `delay` — bounded polling helpers for asynchronous assertions `[harness.ts:until]`

## Invariants

- `harness` always sets the principal to `system` in tenant `tenant-a`, and the default policy allows every capability `[harness.ts:harness]`
- `provider` and `consumer` register a teardown effect marker, so teardown ordering is observable `[harness.ts:provider]`
- `until` fails after its timeout instead of returning false, so a stuck condition cannot silently pass `[harness.ts:until]`
- `contract` defaults version to `1.0.0` when none is supplied `[harness.ts:contract]`

## Side Effects

- Kernel creation through the caller-supplied `KernelFactory` and event subscription on the created kernel `[harness.ts:harness]`
- Wall-clock delays via `setTimeout` in `delay` and `until` `[harness.ts:delay]`

## Verification

- Run: `cd packages/kernel-cordis && bun test`
