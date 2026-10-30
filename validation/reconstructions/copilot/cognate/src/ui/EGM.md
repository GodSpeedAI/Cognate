# copilot/cognate/src/ui — React surfaces for the reconstruction journeys

## Overview

This directory is the entire browser UI: one shell (`App`) that switches between eleven journey
views, a shared primitive set, and one component per journey that reads durable projections through
`@godspeedai/cognate-react` hooks. Every surface is a view over runtime state — the shell holds only
navigation, theme, and short-lived run ids. `tokens.css` carries the app's own visual system
`[validation/reconstructions/copilot/cognate/src/ui/App.tsx:App]`.

## Interface

- `App` — view switch over `ViewMode`, theme persistence, connection status, and journey navigation `[validation/reconstructions/copilot/cognate/src/ui/App.tsx:App]`
- `ViewMode` — the eleven view ids from `overview` through `open-ended-mcp` `[validation/reconstructions/copilot/cognate/src/ui/App.tsx:ViewMode]`
- `JourneyHead`, `Disclosure`, `KeyValues`, `StateTag`, `Note` — shared presentational primitives `[validation/reconstructions/copilot/cognate/src/ui/primitives.tsx:JourneyHead]`
- `AgentContextSurface`, `ControlledRenderingSurface`, `ToolDecisionSurface`, `RuntimeInterruptSurface`, `DeclarativeUiSurface`, `RichThreadSurface` — the J-D..J-H surfaces `[validation/reconstructions/copilot/cognate/src/ui/RemainingSurfaces.tsx:AgentContextSurface]`
- `SurfaceProps` — the common `onRunStarted` callback contract `[validation/reconstructions/copilot/cognate/src/ui/RemainingSurfaces.tsx:SurfaceProps]`
- `McpOpenEndedSurface`, `MCP_FRAME_SANDBOX` — sandboxed MCP app frame and its sandbox policy `[validation/reconstructions/copilot/cognate/src/ui/McpOpenEndedSurface.tsx:McpOpenEndedSurface]`
- `RemoteCapabilitySurface`, `MountedCapability`, `RemoteCapabilityHistory`, `browserOffer` — J-B offer lifecycle UI `[validation/reconstructions/copilot/cognate/src/ui/RemoteCapabilitySurface.tsx:RemoteCapabilitySurface]`
- `RichThreadView` — thread list/new/switch presentation over durable thread rows `[validation/reconstructions/copilot/cognate/src/ui/RichThreadView.tsx:RichThreadView]`
- Not subdirectories: `tokens.css` is the single stylesheet the server serves at `/app.css` `[validation/reconstructions/copilot/cognate/src/server.ts:startServer]`

## Invariants

- Theme resolves from `localStorage["cognate-theme"]`, else the OS `prefers-color-scheme`, and is written to `data-theme` `[validation/reconstructions/copilot/cognate/src/ui/App.tsx:App]`
- The MCP frame is granted `allow-scripts` only; same-origin and forms are deliberately omitted `[validation/reconstructions/copilot/cognate/src/ui/McpOpenEndedSurface.tsx:MCP_FRAME_SANDBOX]`
- A past run can be replayed from durable state because every phase reads the projection, the artifact store, and the continuation list `[validation/reconstructions/copilot/cognate/src/ui/McpOpenEndedSurface.tsx:McpOpenEndedSurface]`
- A frame message settles the run only when its payload shape and `viewId` match the recorded render `[validation/reconstructions/copilot/cognate/src/ui/McpOpenEndedSurface.tsx:McpOpenEndedSurface]`
- `RemoteCapabilitySurface` draws its own `CognateProvider` when given a client, so hook order is identical on both paths `[validation/reconstructions/copilot/cognate/src/ui/RemoteCapabilitySurface.tsx:RemoteCapabilitySurface]`
- J-D passes the published application state as invocation input; nothing else stores it `[validation/reconstructions/copilot/cognate/src/ui/RemainingSurfaces.tsx:AgentContextSurface]`
- Readout rows expose the row name as `aria-label`, which is the assertion surface `[validation/reconstructions/copilot/cognate/src/ui/RemainingSurfaces.tsx:StateRow]`
- Thread rows merge both projections, keep the strongest status, and sort by id `[validation/reconstructions/copilot/cognate/src/ui/RichThreadView.tsx:knownThreads]`

## Side Effects

- Reads and writes browser `localStorage` for the theme key `[validation/reconstructions/copilot/cognate/src/ui/App.tsx:App]`
- Reads the OS color-scheme preference through `matchMedia` `[validation/reconstructions/copilot/cognate/src/ui/App.tsx:App]`
- Starts runs and resolves open continuations over the client connection `[validation/reconstructions/copilot/cognate/src/ui/RemainingSurfaces.tsx:AgentContextSurface]`
- Refreshes a projection through the client on continuation transitions `[validation/reconstructions/copilot/cognate/src/ui/McpOpenEndedSurface.tsx:McpOpenEndedSurface]`

## Verification

- Run: `cd validation/reconstructions/copilot/cognate && bun test test`
