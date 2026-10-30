# artifact-workbench — durable, content-addressed artifacts

## Overview
An agent writes bytes through the run context, and the script then reads the same
artifact back through the client to confirm the authoritative record and the
content-addressed bytes agree. It exercises the artifact path from inside a run to
outside it, with a conformance caller standing in for an authenticated principal.

## Interface
- `createRuntime` — runtime with `store: ":memory:"`, permissive `policy` and `actions`, and the single `agent.report` agent `[examples/artifact-workbench/index.ts:createRuntime]`
- `ctx.artifact` — records `{ name, mediaType, bytes }` and returns an artifact id used as the run output `[examples/artifact-workbench/index.ts:ctx.artifact]`
- `createClient` — client over `runtime.service` with `caller: alice` `[examples/artifact-workbench/index.ts:createClient]`
- `alice` — the conformance principal imported from `@godspeedai/cognate-runtime-api/conformance` `[examples/artifact-workbench/index.ts:alice]`
- `client.startRun` / `client.run(runId).get()` — start the run and read its state, including `status`, `output`, and `artifacts` `[examples/artifact-workbench/index.ts:client.startRun]`
- `client.artifact(id)` — returns the record whose `bytes` and `mediaType` are asserted `[examples/artifact-workbench/index.ts:client.artifact]`

## Invariants
- The run must reach `status === "completed"` before the output is read, enforced by the local `waitUntil` poller `[examples/artifact-workbench/index.ts:waitUntil]`.
- Exactly one artifact must be listed and it must equal the id returned by `ctx.artifact`, so extra or missing records fail `[examples/artifact-workbench/index.ts:state.artifacts]`.
- Decoded bytes must contain `"Total refunded: 42"`, tying the produced content to the input `total` `[examples/artifact-workbench/index.ts:text]`.

## Side Effects
- No disk or network writes; the artifact store is the in-memory runtime store `[examples/artifact-workbench/index.ts:createRuntime]`.
- `TextEncoder` encodes the agent's markdown and `TextDecoder` decodes the read-back bytes `[examples/artifact-workbench/index.ts:TextEncoder]`.
- `finally` closes the client then the runtime `[examples/artifact-workbench/index.ts:finally]`.

## Verification
- Run: `bun run example:artifact-workbench`
