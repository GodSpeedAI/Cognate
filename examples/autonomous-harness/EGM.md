# autonomous-harness — the reference model/tool loop

## Overview
This script stands up the Harness reference profile with a scripted local model and
one tool, then sends a user message and waits for the run to settle. It proves the
loop closes: the model requests the tool, the harness executes it, and the model
answers from the tool result.

## Interface
- `createHarness` — creates the harness with `store: ":memory:"` and `instructions: "You are a calculator agent."` `[examples/autonomous-harness/index.ts:createHarness]`
- `providerComponent` / `toolComponent` — mount adapters that turn a provider and a tool descriptor into kernel components `[examples/autonomous-harness/index.ts:providerComponent]`
- `localProvider` — the scripted model with a single `rules[].respond` function `[examples/autonomous-harness/index.ts:localProvider]`
- `harness.mount` — mounts the provider component, then the `add` tool component `[examples/autonomous-harness/index.ts:harness.mount]`
- `harness.send` — sends `"What is 19 + 23?"` on session `"session-1"` and returns a `runId` `[examples/autonomous-harness/index.ts:harness.send]`
- `harness.session` — returns the session's runs, each with `runId`, `status`, and `output` `[examples/autonomous-harness/index.ts:harness.session]`

## Invariants
- The scripted model returns a `toolCalls` result with `finishReason: "tool_calls"` only while no message with `role: "tool"` exists, so the loop must actually run the tool to progress `[examples/autonomous-harness/index.ts:respond]`.
- The tool's `inputSchema` requires both `a` and `b`, and its handler returns the sum as a string `[examples/autonomous-harness/index.ts:toolComponent]`.
- Settlement is defined as a status other than `"running"` or `"waiting"`, then narrowed to `"completed"` `[examples/autonomous-harness/index.ts:runs]`.
- `run.output.answer` must contain `"42"`, so a fabricated answer fails `[examples/autonomous-harness/index.ts:answer]`.

## Side Effects
- No network egress: the model is the local provider and the store is in memory `[examples/autonomous-harness/index.ts:localProvider]`.
- `harness.close()` runs in `finally` `[examples/autonomous-harness/index.ts:harness.close]`.

## Verification
- Run: `bun run example:autonomous-harness`
