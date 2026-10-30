# generative-ui — `ui.render` events rendered by a component registry

## Overview
An agent emits two `ui.render` events carrying `{ component, props }`. The script
subscribes to the run, collects those events, and resolves each component name
against an application-supplied registry before rendering to HTML with
`react-dom/server`. It shows the render payload stays data until the application
maps it to components.

## Interface
- `AgentDefinition` — `agent.card` emits `ui.render` for `RefundCard` and `StatusBadge`, then returns `{ rendered: true }` `[examples/generative-ui/index.ts:cardAgent]`
- `client.subscribe({ runId }, cb)` — receives events whose `eventType` and `payload` are inspected, returning an unsubscribe function `[examples/generative-ui/index.ts:client.subscribe]`
- `components` — the registry mapping component names to React element factories, analogous to what `GenerativeSurface` accepts `[examples/generative-ui/index.ts:components]`
- `createRuntime` / `createClient` — in-memory runtime and client with `caller: alice` `[examples/generative-ui/index.ts:createRuntime]`
- `Bun.resolveSync` — resolves `react` and `react-dom/server` relative to `packages/ui-astryx` because they are not hoisted to the repo root `[examples/generative-ui/index.ts:reactPath]`
- `renderToString` — converts the resolved element to HTML for assertion `[examples/generative-ui/index.ts:renderToString]`

## Invariants
- Exactly two `ui.render` events must be collected, so a dropped projection fails `[examples/generative-ui/index.ts:renders.length]`.
- The run must reach `status === "completed"` before subscribing and collecting; the subscription is opened after that wait `[examples/generative-ui/index.ts:waitUntil]`.
- The rendered HTML must contain `"refund-card"`, `"Refund: 42"`, and `"badge"` `[examples/generative-ui/index.ts:html]`.
- Unknown component names are tolerated by the registry lookup (`?.`) but would render nothing, so the HTML assertions are what catch a mismatch `[examples/generative-ui/index.ts:renderToString]`.

## Side Effects
- Dynamic `import()` of resolved React module paths at module load `[examples/generative-ui/index.ts:React]`.
- In-memory store only; `finally` closes the client and runtime `[examples/generative-ui/index.ts:finally]`.

## Verification
- Run: `bun run example:generative-ui`
