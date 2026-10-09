# Workflow: capability invocation

What happens between an agent (or a client, an MCP host, an A2A client) asking for a capability
and the provider's handler running — and where authorization actually happens.

## Summary

Invocation is a five-step path with a deliberate gap in the middle: `kernel.resolve` finds an
*eligible* provider and consults no policy; the `Policy` is consulted by the lease at the moment
of invocation, and its decision is captured per call so it can be recorded on the resulting event.

## Sequence

1. A caller asks: `ctx.invoke(capability, input)` from an agent, or
   `RuntimeService.invoke(caller, …)` from a client/protocol adapter.
2. The runtime resolves through the kernel: `kernel.resolve({ capability, version? })`.
3. If nothing eligible matches, the result is `Unavailable` — surfaced as
   `InvocationFailure{kind:"unavailable", reason}`, **not** as a permission error.
4. The lease's `invoke` consults `Policy.authorize` with the full `InvocationContext`
   (actor, tenant, scope, capability, selected provider, correlation/causation ids, signal, and an
   optional deadline).
5. The handler runs, or a typed failure is returned. **Invocation never throws for a denial**: it
   returns `InvocationResult`, `ok: false`, with a failure kind.
6. The runtime records the outcome.

## The two decision points, precisely

```text
kernel.resolve(requirement)                ← eligibility only
  isCompatible: same id, same major, minor/patch ≥ required,
               every required attribute equal
  policy consulted: NO
  grants authority: NO

lease.invoke(input, context)               ← authorization
  Policy.authorize(request): default denyAll
  emits a `invocation` kernel event
  on denial: { ok: false, failure: { kind: "denied", decision } }
```

The kernel conformance suite pins this by counting policy consultations across a resolve and
asserting the count is zero.

### How the decision is captured

`Invoker` wraps the caller's `Policy` in a decorator that stores the decision in an
`AsyncLocalStorage` slot for the duration of that call. The runtime reads the slot afterwards to
attach `decision`, `providerId`, `componentId`, `fiberId`, `capability`, `ok`, and `failureKind` to
the `run.invocation` event's **metadata**. Input and result go in the **payload**, which erasure
can scrub; routing facts stay in metadata, which it cannot.

That split is the point: after `runtime.erase(...)`, the audit trail still shows that capability
`billing.quote` was invoked and under which policy, without retaining what was asked or answered.

### Tenant propagation

The kernel is single-tenant by contract (`tenant: "runtime"`). The caller's real tenant reaches
the `Policy` through the `InvocationContext`, supplied by the `Invoker` on each call — not through
the kernel's own tenant. A `Policy` that ignores `context.tenant` will authorize across tenants.

## The two-phase selection model

Where more than one provider is eligible, `@godspeedai/cognate-capabilities` runs two phases:

1. **Every `EligibilityRule` filters every candidate**, and every `(provider, rule)` result is
   recorded. Only now is the eligible set fixed.
2. **Only the eligible set reaches an optional `Ranker`.** A ranker may reorder or drop; it may
   never add. An entry that is unknown, ineligible, duplicated, or non-finite is dropped. A
   missing or throwing ranker falls back to deterministic `providerId` order.

`createOutcomeRanker(store)` turns recorded outcomes into a UCB1 ranker:
`successRate + sqrt(2 ln N / n)`, untried providers first, ties in provider-id order. The
exploration term is why a provider that failed once is retried instead of abandoned. Feedback
affects ranking only after it is committed and projected — never in flight (`CG-COG-006`).

The rule this protects: **learning cannot grant authority.** Adaptive containment is a property
test, not a convention.

## Direct service invocation

`RuntimeService.invoke` differs from the agent path in one way worth knowing: it does **not**
record an event. It authorizes through the `Invoker` and returns the value, or throws a
`ServiceError` with the mapped code:

| failure kind | `ServiceErrorCode` |
|---|---|
| `denied` | `permission_denied` |
| `unavailable` | `unavailable` |
| `deadline_exceeded` | `deadline_exceeded` |
| `cancelled` | `unavailable` |
| `failed` | `failed_precondition` |

An agent calling `ctx.invoke` gets the recorded *failure* back and the run event carries the same
information; that is the durable, inspectable form.

## State changes

Agent path, one event per invocation: `run.invocation` on `run-<id>`.

- payload: `{ input, result }` or `{ input, failure }` (erasable)
- metadata: `{ stepId, capability, providerId, fiberId, decision, ok, failureKind }`
- envelope: `semanticRef`, `componentId`, `fiberId` when the provider published one

Also emitted, by the kernel rather than the store: an `invocation` `KernelEvent` carrying the
capability, provider, correlation id, and decision — the machine-inspectable audit chain behind
`Runtime.inspect` (`CG-OBS-001`).

## Failure branches

| Situation | Observable result | Where |
|---|---|---|
| no eligible provider | `unavailable` with the requirement in the reason | `kernel-cordis/src/kernel.ts:36` |
| policy denies | `denied` with the full `PolicyDecision` | `kernel-api/src/policy.ts` (`denyAll`) |
| handler throws | `failed` with the message | `invoker.ts:64-67` |
| provider withdrawn after resolution | the lease's `isActive()` check fails; the invocation reports `unavailable` | `kernel-cordis/src/lease.ts` |
| deadline exceeded | `deadline_exceeded` | `HandlerContext.deadline` |
| a provider disappears entirely | dependent components deactivate (dependency closure); the *next* resolve finds another eligible provider | `fiber.ts` |
| all providers gone | `unavailable`; nothing escalates to a permission error |

## Sequence diagram

```mermaid
sequenceDiagram
    participant A as agent (ctx.invoke)
    participant X as executor
    participant I as Invoker
    participant K as kernel
    participant P as Policy
    participant H as provider handler
    participant D as DurableStore

    A->>X: ctx.invoke("billing.quote", input)
    X->>I: invoke({ capability, input, tenant, context })
    I->>K: resolve({ capability })
    K-->>I: CapabilityLease (eligible; no policy consulted)
    I->>P: authorize({ actor, tenant, capability, providerId, correlationId, … })
    P-->>I: PolicyDecision (captured in AsyncLocalStorage slot)
    I->>H: handler(input, HandlerContext)
    H-->>I: output | typed failure
    I-->>X: InvocationOutcome { ok, value|failure, providerId, fiberId, decision, semanticRef }
    X->>D: commit(run.invocation)
    D-->>A: result (or throw InvocationFailedError)
```

## Source trail

- `packages/kernel-api/src/types.ts:42-99` — `InvocationContext`, `AuthorizationRequest`,
  `PolicyDecision`, `HandlerContext`, `InvocationResult`/`InvocationFailure`.
- `packages/kernel-api/src/compat.ts` — `isCompatible`.
- `packages/kernel-api/src/policy.ts` — `denyAll`, `rulePolicy`, `allowCapabilities`.
- `packages/kernel-cordis/src/kernel.ts:33-44` — `resolve` with no policy call.
- `packages/kernel-cordis/src/lease.ts` — the invocation-time policy check and the audit event.
- `packages/runtime-bun/src/invoker.ts` — the `AsyncLocalStorage` decision capture.
- `packages/runtime-bun/src/executor.ts:111-145` — `ctx.invoke` and the `run.invocation` event.
- `packages/runtime-bun/src/service.ts:186-202` — `RuntimeService.invoke` and its error mapping.
- `packages/capabilities/src/selector.ts` — `createSelector`, `recordSelection`, `recordOutcome`,
  `outcomeProjection`, `createOutcomeRanker`.
- `packages/kernel-cordis/test/authority.test.ts`, `packages/capabilities/test/adaptive-ranker.test.ts`,
  `tests/properties/containment.property.test.ts`.
- [../security.md](../security.md) — the authority rules this path implements.
- [../cognition.md](../cognition.md) — why the ranker is UCB1 and not SONA.

## Related

- [../concepts.md](../concepts.md#capabilities-eligibility-vs-selection) — the vocabulary.
- [run-execution.md](run-execution.md) — the surrounding run.
- [../extensions.md](../extensions.md) — how to publish a capability.
- [../explanation/authority-and-learning.md](../explanation/authority-and-learning.md) — why the
  two phases are separate.
