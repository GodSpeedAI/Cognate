# capability-hot-swap — replacing a provider while the kernel runs

## Overview
Two providers both implement `model.generate`. The script mounts provider A, invokes
the capability, disposes A, mounts provider B, and invokes again without touching
caller code. It demonstrates that mounting and disposal are live kernel operations
rather than a restart boundary.

## Interface
- `createRuntime` — runtime with `store: ":memory:"`, `agents: []`, and the policy returned by `allowCapabilities` `[examples/capability-hot-swap/index.ts:createRuntime]`
- `allowCapabilities` — builds the policy from `("hot-swap-example", ["model.generate"])` `[examples/capability-hot-swap/index.ts:allowCapabilities]`
- `providerComponent` — wraps a provider into a mountable component `[examples/capability-hot-swap/index.ts:providerComponent]`
- `localProvider` — provider A answers `"response from A"`, provider B answers `"response from B"` `[examples/capability-hot-swap/index.ts:localProvider]`
- `runtime.kernel.mount` — returns a handle exposing `waitFor` and `dispose` `[examples/capability-hot-swap/index.ts:runtime.kernel.mount]`
- `runtime.service.invoke` — invokes `model.generate` for the `alice` principal in `tenant-a` `[examples/capability-hot-swap/index.ts:runtime.service.invoke]`

## Invariants
- Each handle must reach `"ACTIVE"` within 5000 ms before the capability is invoked `[examples/capability-hot-swap/index.ts:handleA.waitFor]`.
- `handleA.dispose("hot swap to provider B")` must complete before B is mounted, so the two providers never serve concurrently `[examples/capability-hot-swap/index.ts:handleA.dispose]`.
- The first invoke must return A's content and the second must return B's, which is the whole assertion of the swap `[examples/capability-hot-swap/index.ts:first]`.
- The granted capability set is exactly `["model.generate"]`, so the policy is capability-scoped rather than role-scoped `[examples/capability-hot-swap/index.ts:allowCapabilities]`.

## Side Effects
- In-memory store only; no provider performs network I/O `[examples/capability-hot-swap/index.ts:localProvider]`.
- `await runtime.close()` in `finally` tears down the kernel and both handles `[examples/capability-hot-swap/index.ts:runtime.close]`.

## Verification
- Run: `bun run example:capability-hot-swap`
