# @godspeedai/cognate-continuations

Durable pauses and durable external effects for Cognate applications. `ContinuationService`
parks a workflow until the outside world answers (a human approval, a callback);
`CommitmentService` records an intention to affect an external system and drives it to a
known outcome. Both keep every transition as committed facts in your
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events)
store, so they survive crashes and restarts.

**When to use this package:** your run must wait for input that arrives later, or it must
call a system where "did it happen?" matters (payments, emails, tickets). Continuations are
pauses with an audit trail; commitments are the alternative to fire-and-forget HTTP calls.

## Installation

```sh
bun add @godspeedai/cognate-continuations
```

Requires [Bun](https://bun.sh) >= 1.4.0 and a store:
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
for durability or
[`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory)
for tests. The SDK ships Bun-native TypeScript source, so add `@types/bun` and `@types/node`
as dev dependencies when typechecking your project.

## Continuations quick start

```ts
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { ContinuationService } from "@godspeedai/cognate-continuations";

const store = openSqliteStore({ path: "./app.sqlite" });
const continuations = new ContinuationService(store, {
  policy: {
    authorize: ({ actor }) =>
      actor.kind === "user" ? { allow: true, reason: "approver" } : { allow: false, reason: "not an approver" },
  },
});

// Register the code that runs when a continuation of this type is resumed.
const unregister = continuations.registerHandler({
  id: "refund.resume",
  version: "1.0.0",
  supports: (storedVersion) => storedVersion.startsWith("1."),
  handle: async (record) => {
    // continue the workflow with record.resolution.input
  },
});

const request = await continuations.open({
  type: "refund-approval",
  tenant: "tenant-a",
  runId: "run-1",
  scopeId: "root",
  correlationId: "corr-1",
  condition: { kind: "human_approval", role: "manager" },
  payload: { amount: 42 },
  handler: { id: "refund.resume", version: "1.0.0" },
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // optional
});

// Later — when the approval arrives:
const outcome = await continuations.resume(request.id, {
  actor: { id: "alice", kind: "user" },
  idempotencyKey: "approval-form-8123",
  input: { approved: true },
});
// outcome.kind is one of:
//   "transitioned" | "duplicate" | "already_terminal" | "denied" | "version_mismatch" | "not_found"

// From a background loop: deliver resumed continuations to handlers, expire due ones.
await continuations.dispatchResumes();
await continuations.expireDue();
```

A continuation moves `OPEN` → `RESUMED` | `CANCELLED` | `EXPIRED` | `FAILED`, exactly once:
concurrent resume/cancel/expiry attempts resolve to a single terminal transition, and losers
get `already_terminal`. Repeating a request with the same actor and idempotency key returns
`duplicate` with the original result. A resumed continuation whose registered handler does
not support the stored handler version goes to `BLOCKED` instead of being delivered;
`unblock` returns it to `RESUMED` for delivery after you register a compatible handler.

## Commitments quick start

```ts
import { CommitmentService } from "@godspeedai/cognate-continuations";

const commitments = new CommitmentService(store);

commitments.registerTarget({
  id: "payment-api",
  idempotent: true, // true only if the target deduplicates retries by idempotency key
  async dispatch({ idempotencyKey, payload }) {
    const remoteRef = await chargeCard(idempotencyKey, payload); // your call
    return { remoteRef, result: { charged: true } };
  },
  // optional: lets reconcile() ask the target what happened
  async status({ idempotencyKey }) {
    return { state: "succeeded", remoteRef: "ch_123", result: { charged: true } };
  },
});

await commitments.intend({
  targetId: "payment-api",
  operation: "charge",
  idempotencyKey: "order-42",
  payload: { cents: 1999 },
  tenant: "tenant-a",
  scopeId: "root",
  correlationId: "corr-1",
});

// From a background loop:
await commitments.dispatch();
```

A commitment moves `INTENDED` → `DISPATCHING` → `SUCCEEDED` | `FAILED` |
`UNKNOWN_RECONCILIATION_REQUIRED`. `dispatch` records `DISPATCHING` *before* calling the
target, so a crash can never lose the fact that an attempt started. A definitive rejection
(throw `CommitmentRejectedError` from `dispatch`) is terminal `FAILED`; any other error is
`UNKNOWN` — retried automatically only when the target is idempotent, otherwise left for
`reconcile()` (asks `target.status`) or `resolveManually()`. To undo a succeeded commitment,
`compensate()` creates a *new* commitment with `compensates` set; the original is never
mutated.

## Limitations

- Handlers and targets are registered in-process. Re-register them after a restart before
  `dispatchResumes()`/`dispatch()` will succeed; undeliverable work retries with backoff
  (default base 1 s, max 30 s, 8 attempts) and then waits for operator attention.
- Delivery is at-least-once: handlers must tolerate being called more than once.
- Nothing here runs timers. Call `expireDue()` and `dispatch()`/`dispatchResumes()` from your
  own background loop (the reference runtime does this for you).
- Commitments do not make external systems transactional. They make outcomes *knowable*:
  `UNKNOWN_RECONCILIATION_REQUIRED` still needs `reconcile` or `resolveManually` to settle.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) —
  the store contract, outbox, and idempotency machinery both services use.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) and
  [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) —
  store implementations.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime; `waitFor` in agents is built on this package, and its background
  loop drains the queues.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
