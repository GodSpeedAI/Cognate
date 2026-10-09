# @godspeedai/cognate-kernel-cordis

A complete implementation of the [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api)
kernel contract — scopes, components, capabilities, fibers, effects, policy — built on the Cordis
plugin system. This is the only Cognate package that imports `cordis`, and no Cordis type appears in
its public surface: consumers program entirely against the kernel contract.

**When to use this package:** you want a standalone capability kernel without the rest of the
runtime. Most applications meet it indirectly through
[`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun),
which embeds this kernel.

## Installation

```sh
bun add @godspeedai/cognate-kernel-cordis
```

Requires [Bun](https://bun.sh) >= 1.4.0 (`cordis` is installed automatically as a dependency).

## Quick start

```ts
import { allowCapabilities, isUnavailable } from "@godspeedai/cognate-kernel-api";
import { createCordisKernel } from "@godspeedai/cognate-kernel-cordis";

const kernel = await createCordisKernel({
  tenant: "tenant-a",
  principal: { id: "system", kind: "system" },
  policy: allowCapabilities("allow-greetings", ["greet"]),
});

// Mount a component; its activation runs, and its capability is published on success.
const handle = await kernel.mount({
  id: "greeter",
  provides: [{ id: "greet", version: "1.0.0" }],
  activate(fiber) {
    fiber.effects.register(() => console.log("greeter cleaned up"));
    fiber.provide({ id: "greet", version: "1.0.0" }, async (name: string) => ({ hello: name }));
  },
});
await handle.waitFor("ACTIVE");

// Resolution matches deterministically and never consults policy;
// the invocation is what the policy authorizes.
const resolved = kernel.resolve({ capability: "greet" });
if (!isUnavailable(resolved)) {
  const result = await resolved.invoke("Ada", {
    actor: { id: "alice", kind: "user" },
    correlationId: "corr-1",
  });
  console.log(result); // { ok: true, value: { hello: "Ada" } }
}

// Disposes every fiber and effect, children first.
await kernel.shutdown("done");
```

`createCordisKernel` is a `KernelFactory`: it returns a `Kernel` whose `mount`, `resolve`,
`observe`, and `shutdown` follow the shared contract. A failed resolution is not an exception — it
returns `{ unavailable: true, requirement, reason }`, which `isUnavailable` distinguishes from a
lease.

## What the engine guarantees

- **All-or-nothing activation.** A failed activation disposes that attempt's effects in reverse
  order and publishes nothing. A component whose requirements are missing stays `WAITING` with no
  fiber and activates automatically when a compatible provider appears.
- **Orderly teardown.** `handle.dispose`, `scope.close`, and `kernel.shutdown` run every disposer in
  reverse order and are idempotent; failures aggregate into a single `CleanupError` rejection.
  Closing a scope closes its children first.
- **Cancellation.** Every activation and invocation carries an `AbortSignal`, aborted on caller
  cancellation, deadline expiry, or provider teardown.
- **Retries with backoff.** Transient activation failures retry per the component's `retry` policy.
  Throwing `PermanentActivationError` skips retries until `handle.reset()`. Activation that exceeds
  `activationTimeoutMs` (default 30 seconds) fails transiently instead of hanging.
- **Scoped visibility.** A provided capability is visible in its scope and its descendants only;
  sibling scopes never see it. Child scopes may narrow the principal and never gain authority by
  inheritance.
- **Audit.** `kernel.observe` streams fiber-state transitions, capability publication and
  withdrawal, cleanup failures, and every policy decision.

## Limitations

- In-process and single-tenant: one kernel serves one tenant, and there is no network surface. The
  runtime layers caller tenancy and services on top.
- Mounting into a closed scope throws `ScopeClosedError`.
- The kernel resolves and invokes capabilities but knows nothing about durability, runs, events, or
  persistence — that is the runtime's job.

## Related packages

- [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api) —
  the contract this package implements, including the conformance suites it passes.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime that embeds this kernel.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
