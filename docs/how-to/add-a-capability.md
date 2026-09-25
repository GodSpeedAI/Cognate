# How to: add a capability

The primary extension move. A capability is a versioned contract a provider publishes and a
consumer requires; there is no separate plugin API.

**Goal.** Add a capability that agents and any `RuntimeService` client can invoke, with policy
deciding who may call it.

**Prerequisites.** A working Cognate application — see
[start-an-app-from-a-checkout](../tutorials/start-an-app-from-a-checkout.md) — or a runtime you
composed yourself.

## 1. Choose the id and version

Ids are dotted lowercase (`billing.quote`, `storage.kv`, `model.generate`); versions are semver.
Attributes are the metadata a consumer can require: `provider-local` advertises
`{ description }`, `billing.quote` above advertises `{ currency: "usd" }`.

`isCompatible` requires: same id, same major version with minor/patch at least as high as the
requirement, and every **required** attribute equal. Extra attributes on the contract are fine.

## 2. Write the component

```ts
// src/capabilities/billing.ts
import type { CapabilityContract, Component } from "@cognate/kernel-api";

const contract: CapabilityContract = {
  id: "billing.quote",
  version: "1.0.0",
  attributes: { currency: "usd" },
};

export const billingQuote: Component = {
  id: "billing",
  version: "1.0.0",
  provides: [contract],
  activate(fiber) {
    fiber.provide(contract, async (input, ctx) => {
      // fiber.effects.register(disposer, label) ties cleanup to this fiber.
      const timer = setInterval(() => {}, 60_000);
      fiber.effects.register(() => clearInterval(timer), "billing-poll");

      const { amount } = input as { orderId: number; amount: number };
      if (amount <= 0) throw new Error("amount must be positive");
      return { total: Math.round(amount * 1.2), currency: "usd", by: ctx.actor.id };
    });
  },
};
```

Rules that matter:

- `provides` declares what you may publish. `fiber.provide` for an undeclared contract throws
  `UndeclaredCapabilityError`.
- `activate` returns nothing; `fiber.provide(contract, handler)` **is** the publication, and it
  becomes visible only after `activate` resolves. If `activate` throws, the attempt's effects are
  disposed and nothing is published.
- `requires` is a name-keyed record — `requires: { quote: { capability: "storage.kv" } }` — and each
  resolved lease is available on `fiber.dependencies.<name>`.
- Register reversible effects with `fiber.effects.register(disposer, label)`. They unwind in
  reverse order when the component unloads.
- Throwing from a handler produces `InvocationFailure{kind:"failed"}` — the caller sees a typed
  failure, not a crash. Validation errors belong here, not in the transport.
- If activation can hang, set `activationTimeoutMs` on the component (default 30 000); the fiber
  fails with `ActivationTimeoutError` rather than staying `ACTIVATING` forever.

## 3. Mount it

In a runtime you compose yourself:

```ts
const runtime = await createRuntime({
  store: ":memory:",
  policy: allowCapabilities("my-app", ["billing.quote"]),
  actions: { authorize: () => ({ allow: true, reason: "local" }) },
  agents: [myAgent],
  components: [billingQuote],
});
```

In a profile, add a `ComponentEntry` and mount through the profile's registry; the profile
resolves names in order and reports anything it cannot include in `unresolved`.

## 4. Allow it, explicitly

`denyAll` is the default: every invocation is refused unless a rule allows it. Pick one:

```ts
import { allowCapabilities, rulePolicy, denyAll } from "@cognate/kernel-api";

policy: allowCapabilities("my-app", ["billing.quote"])          // any actor, these ids
policy: rulePolicy("my-app", [                                    // first match wins
  (r) => r.context.tenant === "tenant-a" && r.capability.id === "billing.quote"
    ? { allow: true, policyId: "my-app", reason: "tenant-a" }
    : undefined,
])
```

A missing match denies. If you want different behavior per caller, the `Policy` receives
`AuthorizationRequest` with `actor`, `tenant`, `scopeId`, the capability contract, the selected
provider, and the correlation ids.

**The service is a separate gate.** `ctx.invoke` goes through the kernel `Policy`; a direct
`RuntimeService.invoke` also goes through it. But `run.start`, `run.cancel`, `continuation.resume`,
`continuation.cancel`, and `run.state.update` are decided by the `ActionPolicy` you pass to
`createRuntime`. Configure both.

## 5. Call it

From an agent:

```ts
const quote = await ctx.invoke("billing.quote", { orderId: 7, amount: 100 });
const pinned = await ctx.invoke("billing.quote", { orderId: 7, amount: 100 }, { version: "1.2.0" });
```

From a client or any protocol surface:

```ts
const value = await client.invoke("billing.quote", { orderId: 7, amount: 100 });
```

`ctx.invoke` records a `run.invocation` event; the client call does not. Use the agent path when
the call must be inspectable and replayable.

## 6. Verify

```bash
bun test ./packages/kernel-cordis/test/contract.test.ts   # the contract is unchanged
bun run typecheck
```

And a runtime check:

```ts
const value = await runtime.service.invoke(caller, { capability: "billing.quote", input: { orderId: 7, amount: 100 } });
console.log(value);          // { total: 120, currency: "usd", by: "alice" }

const denied = await runtime.service.invoke(otherCaller, { capability: "billing.quote", input: { amount: 1 } })
  .catch((e) => `${e.code}: ${e.message}`);                // permission_denied: …
```

## Common failure symptoms

| Symptom | Cause | Fix |
|---|---|---|
| `unavailable: no eligible provider for billing.quote` | not mounted, mounted in an unreachable scope, or a version/attribute mismatch | check `provides` and the requirement's `version`/`attributes` |
| `permission_denied` | the `Policy` denied; eligibility passed | read `policyId`/`reason` on the `run.invocation` metadata |
| `UndeclaredCapabilityError` | `provide()` for something not in `provides` | declare it |
| works, then stops after a `dispose()` | the provider was unloaded | dependency closure deactivated the consumer too; that is correct |
| a second provider is never chosen | it is not `isCompatible` | compare versions and attributes |

## Related

- [add-a-projection.md](add-a-projection.md) — the other main extension move.
- [../extensions.md](../extensions.md) — the whole extension surface in one page.
- [../workflows/capability-invocation.md](../workflows/capability-invocation.md) — the exact path.
- [../explanation/authority-and-learning.md](../explanation/authority-and-learning.md) — why
  eligibility and authorization are separate.

## Source trail

- `packages/kernel-api/src/types.ts` — `Component`, `CapabilityContract`, `Requirement`,
  `FiberContext`, `Effects`.
- `packages/kernel-api/src/compat.ts`, `packages/kernel-api/src/policy.ts`.
- `examples/capability-hot-swap/index.ts` — a provider replaced live.
- `packages/kernel-cordis/test/contract.test.ts` — the contract.
