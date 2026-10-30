# shared-state — shared application state derived from JSON Patch

## Overview
A standalone script that runs an in-process Cognate runtime, has the agent publish one
`state.changed` snapshot and two JSON Patch deltas, and then reads the run back through
the client. It proves the run's shared state is derived by folding those events rather
than stored as a mutable value. It exits non-zero if the folded state is not
`{ status: "paid", total: 42 }`.

## Interface
- `agent` — an `AgentDefinition` with id `agent.order` that emits `state.changed` once with `snapshot` and twice with `patch` `[examples/shared-state/index.ts:agent]`
- `main` — creates the runtime and client, starts a run, waits for `completed`, and asserts the folded state `[examples/shared-state/index.ts:main]`
- `waitUntil` — polls a synchronous reader every 10 ms up to an 8000 ms budget `[examples/shared-state/index.ts:waitUntil]`
- `createRuntime` — runtime with `store: ":memory:"`, permissive `policy.authorize` and `actions.authorize`, and the one agent `[examples/shared-state/index.ts:createRuntime]`
- `createClient` — client bound to `runtime.service` acting as `alice` `[examples/shared-state/index.ts:createClient]`

## Invariants
- The first `state.changed` event carries `snapshot`; the later two carry `patch` arrays, so the fold must handle both shapes `[examples/shared-state/index.ts:patches]`.
- The patches use `replace` at `/order/status` and `/order/total`, so the client must have applied the snapshot before the deltas for the assertion to pass `[examples/shared-state/index.ts:patches]`.
- The assertion is strict: both `status === "paid"` and `total === 42` must hold, otherwise the script throws `[examples/shared-state/index.ts:assertion]`.
- `run.state` is read from `client.run(runId).get()`, meaning the derived state is what the durable service reports, not anything the script computes `[examples/shared-state/index.ts:state]`.

## Side Effects
- Opens an in-memory store only; no file or network persistence `[examples/shared-state/index.ts:createRuntime]`.
- Polls with `Bun.sleep(10)` and compares against `Date.now()` `[examples/shared-state/index.ts:waitUntil]`.
- Closes both client and runtime in a `finally` block `[examples/shared-state/index.ts:finally]`.
- Writes a one-line `ok:` summary to stdout on success `[examples/shared-state/index.ts:console.log]`.

## Verification
- Run: `bun run example:shared-state`
