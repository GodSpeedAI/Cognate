# human-approval — durable suspension on a human decision

## Overview
An agent calls `ctx.waitFor` with a `human_approval` condition and returns nothing
until a decision arrives. The script observes the run go into an open continuation,
resolves it, and confirms the run completes with the approved outcome — a durable
suspension point, not a blocked thread or a poll.

## Interface
- `ctx.waitFor` — suspends the run on `"approve"` with `{ type: "refund-approval", condition: { kind: "human_approval" }, payload: { amount } }` `[examples/human-approval/index.ts:ctx.waitFor]`
- `AgentDefinition` — `agent.refund` maps the resolved decision to `{ amount, approved, status }` where status is `"refunded"` or `"denied"` `[examples/human-approval/index.ts:refundAgent]`
- `state.openContinuations` — the run state list; length becomes 1 while suspended and each entry has `id` and `type` `[examples/human-approval/index.ts:waiting]`
- `client.resolveContinuation` — resolves by `(id, "resume", { approved: true })` `[examples/human-approval/index.ts:client.resolveContinuation]`
- `createClient` / `alice` — client over `runtime.service` with the conformance principal `[examples/human-approval/index.ts:createClient]`

## Invariants
- The observed continuation type must be `"refund-approval"`, matching what the agent declared `[examples/human-approval/index.ts:approval.type]`.
- Suspension is detected by polling for `openContinuations.length === 1`, bounded by the 8000 ms `waitUntil` budget `[examples/human-approval/index.ts:waitUntil]`.
- The run must then reach `status === "completed"` with `output.approved === true` `[examples/human-approval/index.ts:done.output]`.
- The run is started with input `{ amount: 75 }`, which the agent forwards into the continuation payload `[examples/human-approval/index.ts:client.startRun]`.

## Side Effects
- In-memory store; the continuation survives only for the life of the runtime `[examples/human-approval/index.ts:createRuntime]`.
- `finally` closes the client then the runtime `[examples/human-approval/index.ts:finally]`.

## Verification
- Run: `bun run example:human-approval`
