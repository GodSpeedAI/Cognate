# ag-ui — a run projected as an AG-UI event stream

## Overview
This script starts a bun runtime with one agent, wraps the runtime service in an
AG-UI HTTP handler, and issues a real `POST /agui` request against it. It then
parses the SSE response back into events and asserts the bracket structure and
reassembled text, proving that durable run events project outbound as AG-UI.

## Interface
- `createAgUiHandler` — builds the HTTP fetch handler from `{ service, defaultAgent, authenticate }` `[examples/ag-ui/index.ts:createAgUiHandler]`
- `createRuntime` — creates the runtime with `store: ":memory:"`, a permissive `policy.authorize`, permissive `actions.authorize`, and one `agents` entry `[examples/ag-ui/index.ts:createRuntime]`
- `AgentDefinition` — the agent shape; `run(input, ctx)` emits `message.delta` and `state.changed` before returning `{ echoed }` `[examples/ag-ui/index.ts:agent]`
- `authenticate` — parses `Bearer <name>` into `{ actor: { id, kind: "user" }, tenant: "tenant-a" }`, returning `undefined` when absent `[examples/ag-ui/index.ts:authenticate]`
- `runtime.service` — the service instance the handler projects from `[examples/ag-ui/index.ts:runtime.service]`

## Invariants
- The stream must begin with `RUN_STARTED` and end with `RUN_FINISHED`, so a half-open stream fails the script `[examples/ag-ui/index.ts:events]`.
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, and `STATE_SNAPSHOT` must all appear among the emitted types `[examples/ag-ui/index.ts:types]`.
- Concatenated `TEXT_MESSAGE_CONTENT.delta` values must equal `"Checking your refund"`, tying the emitted word fragments to the wire text `[examples/ag-ui/index.ts:text_]`.
- The handler is constructed with `defaultAgent: "agent.copilot"`, matching the id of the single registered agent `[examples/ag-ui/index.ts:createAgUiHandler]`.

## Side Effects
- Binds an ephemeral TCP port via `Bun.serve({ port: 0 })` `[examples/ag-ui/index.ts:Bun.serve]`.
- Performs a loopback `fetch` with an `authorization` header against `server.url.origin` `[examples/ag-ui/index.ts:fetch]`.
- In `finally`, calls `server.stop(true)` and `await runtime.close()` `[examples/ag-ui/index.ts:finally]`.

## Verification
- Run: `bun run example:ag-ui`
