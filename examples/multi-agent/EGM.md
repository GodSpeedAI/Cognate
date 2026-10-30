# multi-agent — parent run spawning and awaiting a child run

## Overview
The harness hosts two agents. The parent calls `spawnSubagent` and awaits the child's
output inside its own run, and the script asserts the nested result arrived. It
demonstrates that subagent execution is a durable run relationship rather than an
in-process function call.

## Interface
- `createHarness` — harness with `store: ":memory:"` and both `agents: [parentAgent, childAgent]` `[examples/multi-agent/index.ts:createHarness]`
- `spawnSubagent` — called as `(ctx, "child-1", "agent.child", { n })` and awaited for the child's output `[examples/multi-agent/index.ts:spawnSubagent]`
- `LOCAL_OPERATOR` — the principal used to start the parent run directly on `harness.runtime.service` `[examples/multi-agent/index.ts:LOCAL_OPERATOR]`
- `harness.runtime.service` — exposes `startRun` and `getRun` for direct service-level driving `[examples/multi-agent/index.ts:harness.runtime.service]`
- `AgentDefinition` — child returns `{ doubled: n * 2 }`; parent returns `{ childOutput }` `[examples/multi-agent/index.ts:childAgent]`

## Invariants
- The parent's output must carry the child's own object, so the caller reads `done.output.childOutput.doubled` `[examples/multi-agent/index.ts:childOutput]`.
- `doubled` must equal `42`, computed by the child from the parent's `{ n: 21 }` `[examples/multi-agent/index.ts:childOutput.doubled]`.
- Settlement requires a status other than `"running"` or `"waiting"`, then `"completed"` `[examples/multi-agent/index.ts:done.status]`.
- `startRun` passes an `idempotencyKey` (`"multi-agent-example"`) so the parent run is not duplicated `[examples/multi-agent/index.ts:view]`.

## Side Effects
- In-memory store; no child process is spawned by the example itself `[examples/multi-agent/index.ts:createHarness]`.
- `harness.close()` in `finally` `[examples/multi-agent/index.ts:harness.close]`.

## Verification
- Run: `bun run example:multi-agent`
