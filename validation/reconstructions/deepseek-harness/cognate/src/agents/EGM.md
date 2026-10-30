# agents — the three agent definitions

## Overview

This directory holds the reconstruction's only agent definitions. `agent.coding` is the live tool
loop; `agent.config` and `agent.cognitive` are deterministic recorders whose runs only emit durable
facts after a capability has already done the I/O. That split is stated at the top of each file and
is what makes the config and cognitive paths replay-safe
`[validation/reconstructions/deepseek-harness/cognate/src/agents/agentConfig.ts]`, `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCognitive.ts]`.

## Interface

- `AGENT_CODING`, `agentCodingAgent` — one run per user turn over `{ sessionId, workspaceId, message, ... }`, correlated by `session:<id>` `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- `TOOL_DEFS`, `UI_TOOL_DEFS` — the standing model-facing tool catalog and the Case-only shared-attention tools `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:TOOL_DEFS]`
- `PRESET_TOOLS`, `toolsForPreset`, `isAgentPreset` — per-turn tool scoping by agent preset `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:PRESET_TOOLS]`
- `AgentCodingInput` — turn input including optional `mode`, `preset`, `caseId`, `taskId` `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:AgentCodingInput]`
- `AGENT_CONFIG`, `agentConfigAgent`, `AgentConfigInput` — the discriminated command union it records `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentConfig.ts:AgentConfigInput]`
- `AGENT_COGNITIVE`, `agentCognitiveAgent`, `COGNITIVE_EVENT_TYPES` — the allowed cognitive event set `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCognitive.ts:COGNITIVE_EVENT_TYPES]`

## Invariants

- `agent.config` performs no I/O and no randomness: every case strips `kind` and emits the matching event; an unknown command is a compile error and a runtime throw `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentConfig.ts:agentConfigAgent]`
- `agent.config` may only mint events listed in `WORKBENCH_EVENTS`, checked before each emit `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentConfig.ts:agentConfigAgent]`
- `agent.cognitive` throws for any event type outside `COGNITIVE_EVENT_TYPES` `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCognitive.ts:agentCognitiveAgent]`
- An absent preset keeps the full `TOOL_DEFS` catalog; the UI tools are appended only when `caseId` is present `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- The turn event carries `mode` and `preset` only when supplied, so direct API runs do not overwrite projected state `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- Tool failures are recorded as `tool.call.failed` and returned to the model as `Error: <message>` rather than aborting the turn `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- Plan mode is read through `plan.state`; `/plan off` is handled without a model round trip `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`

## Side Effects

- Emits `session.turn.started`, `tool.call.started/completed/failed`, `workbench.task.activity`, `model.request.retried`, and plan events `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- Invokes `tool.<name>`, `plan.state`, `model.generate`, and `subagent.start` through the run context `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`
- Optionally sleeps between model retries inside a recorded `ctx.step` `[validation/reconstructions/deepseek-harness/cognate/src/agents/agentCoding.ts:agentCodingAgent]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/J-C-tool-execution.test.ts ./test/J-E-plan.test.ts ./test/J-F-delegation.test.ts`
