# kernel-cordis / src — Cordis-backed kernel implementation

## Overview

`kernel.ts` implements the kernel contract over Cordis: it owns the root scope, the capability registry, and the event listener set `[kernel.ts:CordisKernel]`. `scope.ts` maps each Cognate scope onto its own Cordis `Context` obtained via `isolate()`, while capability *visibility* is kept out of Cordis `[scope.ts:ScopeImpl]`. `fiber.ts` runs one mounted component occurrence as a real Cordis plugin per activation attempt, owning the state machine, retry, timeout, and cleanup `[fiber.ts:FiberUnit]`. `lease.ts` and `registry.ts` supply the adapter-owned lease and eligibility graph that Cordis lacks.

## Interface

- `createCordisKernel` — the package's only public export, typed as the contract's `KernelFactory` `[index.ts:createCordisKernel]`
- `CordisKernel` — `mount`, `resolve`, `observe`, `shutdown` over a root scope `[kernel.ts:CordisKernel]`
- `ScopeImpl` — scope tree, `ancestorIds()`, `track`/`untrack`, `close` `[scope.ts:ScopeImpl]`
- `FiberUnit` — `ComponentHandle` implementation: state, `waitFor`, `dispose`, `reset` `[fiber.ts:FiberUnit]`
- `CapabilityRegistry` — `publish`, `find`, `bind`, `notifyLoss`, `onChange` `[registry.ts:CapabilityRegistry]`
- `createLease` / `BoundProvider` — the revocable provider wrapper `[lease.ts:createLease]`
- `Publication` — one registry entry with an `isActive()` predicate and `teardownSignal` `[registry.ts:Publication]`

## Invariants

- An activation attempt registers exactly one Cordis effect that performs teardown, bound to that attempt's own effect stack, so a late-disposed abandoned fiber never unwinds a newer attempt's effects `[fiber.ts:FiberUnit.runAttempt]`
- Activation longer than `activationTimeoutMs` (default 30000) aborts the attempt, unwinds its effects, and fails with `ActivationTimeoutError` as a transient failure `[fiber.ts:FiberUnit.runAttempt]`
- Capabilities provided during activation stay pending until the attempt settles successfully, then become visible together with the `ACTIVE` transition `[fiber.ts:FiberUnit.runAttempt]`
- `provide` throws `UndeclaredCapabilityError` unless the component declared a contract with that id `[fiber.ts:FiberUnit.buildFiberContext]`
- Teardown withdraws committed capabilities in order — deactivate, notify bound dependents, unpublish, emit `capability.withdrawn` — before unwinding the effect stack in reverse `[fiber.ts:FiberUnit.teardown]`
- Disposer failures are aggregated into a `CleanupError`, emitted as `cleanup.failed`, and rethrown once from a terminal `dispose()` `[fiber.ts:FiberUnit.deactivate]`
- A `PermanentActivationError`, or exhausting `retry.maxAttempts` (default 1), leaves a terminal `FAILED` state that only `reset()` clears `[fiber.ts:FiberUnit.handleFailure]`
- Registering an effect on an already-aborted attempt signal disposes it immediately instead of leaving it unowned `[fiber.ts:FiberUnit.buildFiberContext]`
- A lease is revalidated against `isValid` before and after authorization, so a torn-down provider yields `unavailable` rather than reaching the handler `[lease.ts:invoke]`
- Authorization and the handler both see the caller's tenant when supplied, not the kernel's `[lease.ts:invoke]`
- Cancellation, deadline expiry, and provider teardown all resolve the invocation through one `settled` promise raced against the handler `[lease.ts:invoke]`
- Visibility is computed from the caller-supplied scope-ancestor chain; a publication is visible to its own scope and descendants only `[registry.ts:CapabilityRegistry.find]`
- `close()` closes children first, then the scope's own mounts, and is idempotent; mounting into or deriving a child from a closed scope throws `ScopeClosedError` `[scope.ts:ScopeImpl.close]` `[scope.ts:ScopeImpl.child]`
- Dependency loss deactivates the dependent before its provider's effects run, via `registry.bind` then `notifyLoss` `[registry.ts:CapabilityRegistry.notifyLoss]`

## Side Effects

- Allocates a live Cordis `Context` per scope and per child, keyed `cognate:scope:<id>` `[scope.ts:ScopeImpl.child]`
- Uses `setTimeout` for activation timeouts, retry backoff, invocation deadlines, and `waitFor` `[fiber.ts:FiberUnit.waitFor]`
- Defaults the id source to `crypto.randomUUID` when `KernelOptions.ids` is absent `[kernel.ts:CordisKernel]`
- Keeps a module-level scope id counter shared by all kernels in the process `[scope.ts:nextId]`
- Adds and removes `AbortSignal` listeners on the caller signal and provider teardown signal for each invocation `[lease.ts:invoke]`

## Verification

- Run: `cd packages/kernel-cordis && bun test`
