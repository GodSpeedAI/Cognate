# copilot — the Copilot reference profile

## Overview
This script composes the Copilot reference profile from a scripted local model and a
single backend tool, then drives it with an ordinary client run. It is the smallest
end-to-end demonstration that a profile is a composition of runtime components, not
a separate runtime.

## Interface
- `createCopilotApp` — builds the profile from `{ store, model, instructions, backendTools }` and exposes `runtime.service` and `close` `[examples/copilot/index.ts:createCopilotApp]`
- `COPILOT_AGENT` — the profile's agent id, passed to `client.startRun` `[examples/copilot/index.ts:COPILOT_AGENT]`
- `localProvider` — scripted model that requests `billing.quote` once, then answers from the tool result `[examples/copilot/index.ts:localProvider]`
- `backendTools[].contract` / `.handler` — tool declared as `{ id: "billing.quote", version: "1.0.0" }` with a handler doubling `amount` `[examples/copilot/index.ts:backendTools]`
- `createClient` — client over `copilot.runtime.service` with `caller: alice` `[examples/copilot/index.ts:createClient]`
- `client.run(runId).get()` — observed state carries both `status` and accumulated `text` `[examples/copilot/index.ts:waitUntil]`

## Invariants
- The store is a real file at `<tmpdir>/app.sqlite`, so the profile is exercised against SQLite rather than memory `[examples/copilot/index.ts:createCopilotApp]`.
- The model emits a `toolCalls` turn with `finishReason: "tool_calls"` only while no `role: "tool"` message is present `[examples/copilot/index.ts:respond]`.
- The tool answer is parsed from `JSON.parse(lastTool.content).total`, tying the rendered text to the executed handler `[examples/copilot/index.ts:respond]`.
- `state.text` must include `"42"` (21 doubled), so a skipped tool call fails `[examples/copilot/index.ts:state.text]`.

## Side Effects
- Creates and removes a temp directory via `mkdtempSync` / `rmSync(..., { recursive: true, force: true })` `[examples/copilot/index.ts:mkdtempSync]`.
- No network egress; the model is local `[examples/copilot/index.ts:localProvider]`.
- `finally` closes the client, then the profile app, then deletes the directory `[examples/copilot/index.ts:finally]`.

## Verification
- Run: `bun run example:copilot`
