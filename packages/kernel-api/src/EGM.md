# kernel-api / src — framework-owned kernel contract

## Overview

`types.ts` declares the whole kernel contract — contexts, scopes, capabilities, components, fibers, effects — with no engine types `[types.ts:Kernel]`. `policy.ts` supplies the default no-authority policy and two policy builders `[policy.ts:denyAll]`. `compat.ts` defines deterministic capability eligibility, and `errors.ts` the framework's kernel error classes `[compat.ts:isCompatible]`. The `conformance/` subdirectory holds the executable suites an engine adapter runs from its own tests.

## Interface

- `Kernel` / `KernelOptions` / `KernelFactory` — the engine contract `[types.ts:Kernel]`
- `Component` / `ComponentHandle` / `Scope` / `ScopeOptions` / `FiberContext` / `FiberState` — composition and lifecycle surface `[types.ts:Component]`
- `CapabilityContract` / `Requirement` / `InvocationContext` / `CapabilityLease` / `Unavailable` / `InvocationResult` — capability surface `[types.ts:CapabilityContract]`
- `AuthorizationRequest` / `PolicyDecision` / `Policy` — the authorization surface `[types.ts:Policy]`
- `Principal` / `Attributes` / `SemanticRef` / `Json` — identity and value primitives `[types.ts:Principal]`
- `Effects` / `EffectHandle` / `Disposer` — the effect boundary `[types.ts:Effects]`
- `denyAll`, `rulePolicy`, `allowCapabilities`, `Rule` — policies `[policy.ts:rulePolicy]`
- `isCompatible` — same id, same major, minor/patch at or above required, and every required attribute equal `[compat.ts:isCompatible]`
- `CleanupError`, `PermanentActivationError`, `ActivationTimeoutError`, `UndeclaredCapabilityError`, `ScopeClosedError` — kernel errors `[errors.ts:PermanentActivationError]`
- `isUnavailable` — narrows a lease/`Unavailable` union `[index.ts:isUnavailable]`
- Subdirectories: [conformance](./conformance/EGM.md) — the executable kernel contract suites

## Invariants

- `denyAll` is the default policy and denies every invocation with a stated reason `[policy.ts:denyAll]`
- `rulePolicy` is first-match-wins and denies when no rule matches `[policy.ts:rulePolicy]`
- `isCompatible` rejects a differing major version and a lower minor/patch than required `[compat.ts:isCompatible]`
- `parse` throws a `TypeError` for a non-numeric capability version `[compat.ts:parse]`
- A `CleanupError` aggregates every failed disposer for one component `[errors.ts:CleanupError]`
- `PermanentActivationError` marks a failure retrying cannot fix and requires `reset()` `[errors.ts:PermanentActivationError]`

## Side Effects

- None. The module declares types, pure predicates, and error classes only.

## Verification

- Run: `cd packages/kernel-cordis && bun test` — the suites are executed by the engine adapter, not by this package
