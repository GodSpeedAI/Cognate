# Tutorial: a human in the loop

Extend the first tutorial with work that cannot finish yet. The agent suspends, the process can
die while it waits, and the run resumes from durable state when a person decides.

**Prerequisites.** [run-your-first-agent.md](run-your-first-agent.md), or the equivalent working
setup.

## 1. Make the agent wait

Replace the agent's `run` with:

```ts
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";

export const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount, account } = input as { amount: number; account: string };

    await ctx.emit("message.delta", { text: `Requesting approval for $${amount}.\n` });

    // Valid execution that cannot continue yet. The wait is durable, not a promise.
    const decision = (await ctx.waitFor("approve", {
      type: "refund-approval",
      condition: { kind: "human_approval" },
      payload: { amount, account },
    })) as { approved: boolean; by?: string };

    if (!decision.approved) {
      await ctx.emit("message.delta", { text: "Refund denied.\n" });
      return { status: "denied" };
    }

    const receipt = await ctx.artifact({
      name: "refund-receipt.json",
      mediaType: "application/json",
      bytes: new TextEncoder().encode(JSON.stringify({ amount, account, by: decision.by })),
    });

    await ctx.emit("message.delta", { text: `Refund issued. Receipt ${receipt}.\n` });
    return { status: "refunded", receipt };
  },
};
```

`ctx.waitFor` returns the resolution input when the continuation is resumed. If the continuation is
cancelled or expires, it throws `ContinuationClosedError` instead — catch it if the agent should
degrade rather than fail.

## 2. Start the run and wait for it to suspend

```ts
const { runId } = await client.startRun("agent.refund", { amount: 120, account: "acct-9" });

const suspended = await waitFor(
  () => client.run(runId).get(),
  (r) => r.status === "waiting" && r.openContinuations.length > 0,
);
console.log("waiting on:", suspended.openContinuations.map((c) => c.id));
```

`suspended.openContinuations[0].payload` is `{ amount, account }` — the approval card's data. The
run's status is `waiting` because `foldRun` reports `waiting` while any continuation is open.

## 3. Read the durable state from another process

Kill the process. Nothing is lost. From a fresh process, open the same database:

```ts
import { Database } from "bun:sqlite";
const db = new Database("./my-app.sqlite", { readonly: true });
const row = db.query("SELECT value FROM records WHERE collection = ?").get("continuations");
console.log(JSON.parse(String(row.value)).status);   // "OPEN"
```

The continuation is a record, and `run.waiting` is an event. The run is now resumable by any
process, which is the entire point of the design.

## 4. Approve it

```ts
const [continuation] = suspended.openContinuations;

// The client resolves and unwraps: it returns a ContinuationView, not the
// service's { outcome, continuation } envelope, and it mints its own idempotency key.
const resolved = await client.resolveContinuation(continuation!.id, "resume", {
  approved: true,
  by: "alice",
});

console.log(resolved.status, resolved.version);   // RESUMED 2
```

If you need the `transitioned | duplicate | already_terminal` outcome, or your own idempotency key,
call the service directly: `runtime.service.resolveContinuation(caller, { …, idempotencyKey })`.

The service commits the record change, the `continuation.resumed` event, the idempotency result,
and a resume outbox intent in one transaction. The background loop delivers that intent, which
re-enters the run.

## 5. Watch it finish

```ts
const finished = await waitFor(
  () => client.run(runId).get(),
  (r) => r.status === "completed" || r.status === "failed",
);

console.log(finished.status, JSON.stringify(finished.output));
// completed {"status":"refunded","receipt":"<runId>.artifact.1"}
console.log("artifacts:", finished.artifacts);

const artifact = await client.artifact(finished.artifacts[0]!);
console.log(artifact.name, artifact.mediaType, new TextDecoder().decode(artifact.bytes));
// refund-receipt.json application/json {"amount":120,"account":"acct-9","by":"alice"}
```

Actual output from the run above, in order: the continuation id
(`<runId>.wait.approve`), its payload, `RESUMED 2`, the completed status with the artifact id, the
artifact id, and the receipt bytes.

The agent's code before `waitFor` runs *again* on this pass — and every `ctx.emit`,
`ctx.invoke`, and `ctx.step` before the wait returns its recorded result instead of repeating the
work. That is replay, and it is why the billing quote is not computed twice.

## 6. Try the interesting cases

These are all exercised against the **service** (`runtime.service.resolveContinuation`), because
that is where the idempotency key, the `expectedVersion` guard, and the outcome live; the client
wraps it and mints a key per call.

| Try | Expect |
|---|---|
| retry the *same* `resolveContinuation` call (same key) | the second returns `{ outcome: "duplicate" }`; a different key against a terminal record returns `already_terminal` |
| cancel instead of resume | `ContinuationClosedError` on re-entry → `run.wait.closed`, then `run.failed` |
| `expectedVersion: 999` | `failed_precondition` naming the current version |
| two callers race the resume | one wins; the other sees `already_terminal` or `version_mismatch` |
| restart the whole app before approving | the run is still `waiting`; approving after restart resumes it |
| set `expiresAt` in the past | the loop expires it on the next tick and the wait closes |

## 7. Render it in a browser

Two options, and they are genuinely different mechanisms:

1. **Native UI** — `Approvals` from `@godspeedai/cognate-ui-astryx` renders the open continuations of a run;
   `ApprovalCard` takes `onResolve(approved)`. This is the copilot path.
2. **A frontend capability** — if the "human" step is really a browser API (pan a map, pick a
   file), have the agent wait on
   `{ kind: "frontend_capability", capability: "map.focus" }` and register the handler with
   `client.provideCapability(...)` or `useCapability(...)`. The client executes it locally and
   resolves the continuation with `{ ok, value }`.

Both reduce to the same continuation; only who resolves it differs.

## What you just built

| Piece | Package |
|---|---|
| `ctx.waitFor` | `@godspeedai/cognate-runtime-api` |
| continuation records, lifecycle, resume delivery | `@godspeedai/cognate-continuations` |
| the resume handler and re-entry | `@godspeedai/cognate-runtime-bun` |
| approval resolution | `RuntimeService.resolveContinuation` |
| approval UI | `@godspeedai/cognate-ui-astryx`, or AG-UI `CUSTOM cognate.continuation` |

## Next

- [workflow: continuation and resume](../workflows/continuation-and-resume.md) — the full trace.
- [how-to: add a capability](../how-to/add-a-capability.md) — the extension mechanism itself.
- [troubleshooting: a run is stuck waiting](../troubleshooting.md).

## Source trail

- `examples/human-approval/index.ts` — the minimal version, run by `tests/examples.test.ts`.
- `packages/runtime-bun/src/executor.ts:172-215` — `ctx.waitFor`.
- `packages/continuations/src/continuations.ts` — the lifecycle.
- `tests/integration/continuation-restart.test.ts` — restart survival.
- `profiles/copilot/src/index.tsx` — `requiresApproval` on a backend tool, and the Astryx
  approval surfaces.
