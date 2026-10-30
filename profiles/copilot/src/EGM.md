# profiles/copilot/src — copilot profile composition

## Overview
The copilot reference profile as a single composition module: it declares the profile's registered component names, the package behind each name, and the factory that builds a runnable copilot app. The agent loop is written entirely against `RunContext`, so the model provider and each backend tool are mounted as ordinary kernel components rather than kernel features. The React surface at the bottom renders a run's `ui.render` events through an application-supplied component map.

## Interface
- `COPILOT_AGENT` — the agent id `"agent.copilot"` `[profiles/copilot/src/index.tsx:COPILOT_AGENT]`
- `COPILOT_COMPONENTS`, `copilotProfile`, `copilotRegistry` — the nine component names and their backing packages `[profiles/copilot/src/index.tsx:copilotProfile]`
- `BackendTool` — contract, description, input schema, handler, plus optional approval, state patch, render and artifact projections `[profiles/copilot/src/index.tsx:BackendTool]`
- `CopilotAppOptions`, `CopilotApp` — store path, model provider, instructions, backend and frontend tools; runtime, AG-UI handler and `close` `[profiles/copilot/src/index.tsx:CopilotAppOptions]`
- `createCopilotApp` — builds the policy, agent, components and runtime, then the AG-UI handler `[profiles/copilot/src/index.tsx:createCopilotApp]`
- `GenerativeSurface` — React component rendering buffered and live `ui.render` events `[profiles/copilot/src/index.tsx:GenerativeSurface]`

## Invariants
- No kernel additions: provider and tools are mounted as components `[profiles/copilot/src/index.tsx:createCopilotApp]`
- The policy allows `model.generate` plus exactly the declared backend tool capability ids `[profiles/copilot/src/index.tsx:policy]`
- Backend tools are matched before frontend tools; an unmatched call is fed back to the model as `unknown tool: <name>` rather than throwing `[profiles/copilot/src/index.tsx:createCopilotApp]`
- A streaming provider that ends without a `done` delta is an error `[profiles/copilot/src/index.tsx:collectResponse]`
- Shared state is initialised to an empty snapshot so `add`-style patches apply cleanly `[profiles/copilot/src/index.tsx:createCopilotApp]`
- A tool marked `requiresApproval` must wait for a human-approval continuation before it is invoked `[profiles/copilot/src/index.tsx:BackendTool]`

## Side Effects
- Opens the SQLite store named by `options.store` and starts a runtime; `close()` must be called to release it `[profiles/copilot/src/index.tsx:CopilotApp]`
- Emits `state.changed`, `message.delta`, `ui.render` and artifacts onto the run context `[profiles/copilot/src/index.tsx:createCopilotApp]`
- Registers an AG-UI HTTP handler authenticating `Bearer <tenant>:<user>` in dev `[profiles/copilot/src/index.tsx:createAgUiHandler]`

## Verification
- Run: `cd profiles/copilot && bun test`
