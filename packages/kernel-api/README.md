# @godspeedai/cognate-kernel-api

The framework-owned kernel contract for Cognate: components, scopes, capabilities, fibers, effects, and policy — as TypeScript types plus a few deterministic helpers. No engine code ships here.

**When to use this package:** you are authoring capability components or writing code that must type against the kernel, or you are implementing a kernel engine. Applications normally get it transitively through
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) or the [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) umbrella.

## Installation

```sh
bun add @godspeedai/cognate-kernel-api
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## What's in the box

- **Types** — `Kernel`, `Scope`, `Component`, `FiberContext`, `CapabilityLease`, `Effects`, `Policy`, `InvocationResult`, and the rest of the kernel vocabulary.
- **`isCompatible(requirement, contract)`** — deterministic capability eligibility: same capability id, same major version with minor/patch >= required, and every required attribute equal. No engine required.
- **Policies** — `denyAll` (nothing is authorized unless you say so), `rulePolicy(policyId, rules)` (first matching rule decides, no match denies), and `allowCapabilities(policyId, ids)` for explicit allow-lists.
- **`isUnavailable(value)`** — type guard distinguishing a failed resolution from a lease.
- **Typed errors** — `CleanupError`, `PermanentActivationError`, `ActivationTimeoutError`, `UndeclaredCapabilityError`, `ScopeClosedError`.

## Quick start

Declare a component that provides a capability, and pick a policy for its invocations:

```ts
import { allowCapabilities, isCompatible } from "@godspeedai/cognate-kernel-api";
import type { Component } from "@godspeedai/cognate-kernel-api";

const greeter: Component = {
  id: "greeter",
  provides: [{ id: "greet", version: "1.0.0" }],
  activate(fiber) {
    // Reversible effects, torn down in reverse order on disposal.
    fiber.effects.register(() => console.log("greeter cleaned up"));
    // Publish the capability; visible only after activation succeeds.
    fiber.provide({ id: "greet", version: "1.0.0" }, async (name: string) => ({
      hello: name,
    }));
  },
};

// Deterministic eligibility — computed locally, no engine involved:
isCompatible({ capability: "greet", version: "1.0.0" }, greeter.provides![0]!); // true

// Every invocation passes through a policy; anything not allowed is denied.
const policy = allowCapabilities("allow-greetings", ["greet"]);
```

Mounting components, resolving leases, and invoking capabilities need an engine: use
[`@godspeedai/cognate-kernel-cordis`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-cordis)
or the runtime, which embed one.

## Semantics the contract pins down

- Resolution never consults policy; every invocation does, and the default is deny. Each decision is emitted as an `invocation` audit event through `kernel.observe`.
- Invocation never throws: it returns an `InvocationResult` with a typed failure — `unavailable`, `denied`, `deadline_exceeded`, `cancelled`, or `failed`.
- Activation is all-or-nothing: a failed activation disposes that attempt's effects in reverse order and publishes nothing.
- Disposal is idempotent, runs every disposer in reverse order, and rejects once with `CleanupError` if any disposer failed.
- A provided capability is visible in its scope and its descendants only; a child scope may narrow its principal but never gains authority by inheritance.

## Conformance kit for engine implementers

If you implement `KernelFactory`, run the executable contract unchanged in your own test suite:

```ts
import { contractSuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "@godspeedai/cognate-kernel-cordis";

contractSuite("my-kernel", createCordisKernel);
```

The subpath exports six suites (`contractSuite`, `lifecycleSuite`, `effectsSuite`, `dependenciesSuite`, `scopesSuite`, `authoritySuite`) plus a `fixtures` namespace with ready-made principals, providers, and consumers for your own kernel tests.

## Limitations

- This package enforces nothing at runtime beyond the small helpers it exports: it does not mount components, match providers, or authorize calls. Pair it with an engine implementation.
- The types are compile-time only; nothing validates your components against the contract until TypeScript checks them.

## Related packages

- [`@godspeedai/cognate-kernel-cordis`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-cordis) — the kernel engine implementation of this contract.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the reference runtime that embeds the kernel.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella; the easiest way to get a working kernel-backed runtime.

## License

Apache-2.0
