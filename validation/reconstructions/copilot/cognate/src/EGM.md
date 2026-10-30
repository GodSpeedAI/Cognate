# copilot/cognate/src — reconstruction server and journey agents

## Overview

This directory is the executable half of the CopilotKit reconstruction: one Bun process that
composes a Cognate `Runtime` (PostgreSQL-backed), serves Connect `RuntimeService`, an AG-UI SSE
endpoint, and a browser bundle of the React app in `./ui/`. The tree's own product doc frames the
three claims the app demonstrates — conversation, frontend capability, shared state
`[validation/reconstructions/copilot/PRODUCT.md]` — and the behavior matrix records the pinned reference and its evidence class
`[validation/reconstructions/copilot/reference-behavior-matrix.md]`. The code itself never mutates reference material: the `.sea`
model is read in place `[validation/reconstructions/copilot/cognate/src/domain.ts:loadJourneyABindings]`.

## Interface

- `startServer` — builds the store, runtime, AG-UI handler, Connect handlers, and Bun.serve routes; returns `AppServer` `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- `LOCAL_OPERATOR` — the fixed dev caller (`operator` / `tenant-a`) used for bridge and token issuance `[validation/reconstructions/copilot/cognate/src/server.ts:LOCAL_OPERATOR]`
- `createJourneyAApp` — isolated J-A runtime plus AG-UI handler for tests; no CopilotKit runtime involved `[validation/reconstructions/copilot/cognate/src/journey.ts:createJourneyAApp]`
- `chatAgent`, `threadHistoryProjection`, `deterministicModelComponent` — J-A agent, durable transcript view, rule-based local model `[validation/reconstructions/copilot/cognate/src/journey.ts:chatAgent]`
- `createRemainingJourneysApp` — isolated runtime hosting J-D..J-K plus the MCP journey `[validation/reconstructions/copilot/cognate/src/remaining-journeys.ts:createRemainingJourneysApp]`
- `journeyDAgent`..`journeyMcpAgent`, `mcpAppProjection`, `declarativeCatalogProjection` — the per-journey agents and their projections `[validation/reconstructions/copilot/cognate/src/remaining-journeys.ts:journeyEAgent]`
- `connectMcpBridge` — publishes each listed MCP tool as a remote capability offer and revokes them on `dispose` `[validation/reconstructions/copilot/cognate/src/mcp-bridge.ts:connectMcpBridge]`
- `startMcpFixtureServer` — loopback MCP server fixture with a `create_view` tool and a `ui://fixture/create-view` resource `[validation/reconstructions/copilot/cognate/src/mcp-fixture-server.ts:startMcpFixtureServer]`
- `loadJourneyABindings`, `loadJourneyCBindings` — bind `.sea` entities to conversation/state capabilities; `storeConfigFor` derives the PostgreSQL schema per data path `[validation/reconstructions/copilot/cognate/src/domain.ts:loadJourneyABindings]`
- `ChatSurface`, `SharedStateSurface`, `remoteCapabilityAgent` — J-A/J-B/J-C surfaces and agent `[validation/reconstructions/copilot/cognate/src/ChatSurface.tsx:ChatSurface]`
- Subdirectories: [ui](./ui/EGM.md) — React surfaces for all journeys

## Invariants

- The served runtime hosts every journey agent and only the six listed public projections, so each UI surface can start its own run `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- AG-UI authentication derives the caller from a `Bearer <id>` header, falling back to `LOCAL_OPERATOR` in the served app and to `undefined` in the isolated journey apps `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- `threadHistoryProjection` only folds `thread:`-correlated events and appends model text from `model.generate` progress `[validation/reconstructions/copilot/cognate/src/journey.ts:threadHistoryProjection]`
- `sharedStateCanvasProjection` folds only tenant-scope `state.changed` events and swallows `StatePatchError` `[validation/reconstructions/copilot/cognate/src/shared-state.ts:sharedStateCanvasProjection]`
- `mcpAppProjection` ignores every `ui.render` whose component is not `MCP_APP_COMPONENT`, and counts renders per run `[validation/reconstructions/copilot/cognate/src/remaining-journeys.ts:mcpAppProjection]`
- Bridge offers are keyed `mcp.<toolName>` with a 30 s default TTL, and `dispose` revokes each of them `[validation/reconstructions/copilot/cognate/src/mcp-bridge.ts:connectMcpBridge]`

## Side Effects

- Creates `options.home`, writes `.generated/entry.tsx`, and runs `Bun.build` at boot `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- Binds `127.0.0.1` on `options.port`, serving `/health`, `/agui`, `/cognate.v1.RuntimeService/`, `/app.js`, `/app.css`, `/` `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- Starts a loopback HTTP MCP fixture server and a bridge client; `stop()` disposes bridge, client, fixture, runtime `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`
- Reads `PORT` (default 3190) and `COGNATE_HARNESS_HOME` when run as the main module `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`

## Verification

- Run: `cd validation/reconstructions/copilot/cognate && bun test test`
