# Copilot profile

## Overview
The `@godspeedai/cognate-profile-copilot` package is the copilot reference profile (spec §29.1): a pure composition of registered components — runtime, runs, continuations, frontend capabilities, state and artifact projections, AG-UI, React, and Astryx. It adds no kernel primitives; the model provider and each backend tool are mounted as ordinary kernel components.

## Interface
- `COPILOT_AGENT` — the profile's single agent id, `"agent.copilot"` `[profiles/copilot/src/index.tsx:COPILOT_AGENT]`
- `copilotProfile` — `ProfileDefinition` naming nine components `[profiles/copilot/src/index.tsx:copilotProfile]`
- `copilotRegistry` — one `ComponentEntry` per component name, each backed by an existing package `[profiles/copilot/src/index.tsx:copilotRegistry]`
- `createCopilotApp(options)` — builds the runtime, the model → tool → model agent, and the AG-UI handler `[profiles/copilot/src/index.tsx:createCopilotApp]`
- `BackendTool` — capability contract plus optional `requiresApproval`, `statePatch`, `render`, and `artifact` projections `[profiles/copilot/src/index.tsx:BackendTool]`
- `CopilotAppOptions` / `CopilotApp` — store path, model, instructions, backend/frontend tools; `{ runtime, agUi, close }` `[profiles/copilot/src/index.tsx:CopilotApp]`
- `GenerativeSurface` — React component that renders a run's `ui.render` events through an application registry `[profiles/copilot/src/index.tsx:GenerativeSurface]`
- `test/` — `setup-dom.ts` (happy-dom registration) and the acceptance suite (no EGM.md)

## Invariants
- Each backend tool is mounted as a component that provides its own contract id `[profiles/copilot/src/index.tsx:backendToolComponent]`
- The kernel policy allows exactly `model.generate` and the backend tool ids `[profiles/copilot/src/index.tsx:allowCapabilities]`
- A streaming provider that ends without a `done` delta throws `[profiles/copilot/src/index.tsx:model provider stream ended without a done delta]`
- An unapproved call becomes a `refused:` tool message; `ContinuationClosedError` is treated as "not approved", not as a crash `[profiles/copilot/src/index.tsx:ContinuationClosedError]`
- The agent emits an empty `state.changed` snapshot before the first model turn so `add`-style patches apply `[profiles/copilot/src/index.tsx:state.changed]`
- Every declared component name resolves through the registry; the test asserts `unresolved` is empty `[profiles/copilot/test/copilot.test.tsx:resolveProfile]`

## Side Effects
- Opens the durable store at `options.store` (SQLite path or `":memory:"`) when the app is created `[profiles/copilot/src/index.tsx:CopilotAppOptions]`
- Commits artifacts through the run context (`ctx.artifact`) with name, media type, and bytes `[profiles/copilot/src/index.tsx:"ctx.artifact"]`
- Emits `message.delta`, `state.changed`, and `ui.render` events on the run's stream `[profiles/copilot/src/index.tsx:"ui.render"]`
- The test writes and removes a temporary SQLite directory under the OS temp dir and registers happy-dom globals process-wide `[profiles/copilot/test/setup-dom.ts:GlobalRegistrator]`

## Verification
- Run: `bun test ./profiles/copilot/test/copilot.test.tsx`
