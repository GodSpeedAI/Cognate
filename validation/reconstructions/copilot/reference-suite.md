# CopilotKit reference suite

Pinned reference: [`CopilotKit/CopilotKit` at `6e452e5342db53e9ab23d8b3c0a4592ec25ff554`](reference-manifest.json).

The repository's current `examples/README.md` calls top-level `examples/v1` and
`examples/v2` legacy workspaces. This suite therefore uses the consolidated
examples and the current v2 package surface.

| Surface | Pinned source | Why selected | Evidence state |
| --- | --- | --- | --- |
| Canonical agent application | `examples/integrations/langgraph-js/` | The current starter combines chat, the SDK thread drawer, attachments, a chat/application mode switch, browser tools, an agent-backed todo canvas, controlled UI, HITL, A2UI, and backend-tool rendering. | Documented/source characterized; no live run yet. |
| Generative UI | `examples/showcases/generative-ui/`, plus the LangGraph starter's A2UI integration | The pinned educational showcase is the current consolidated Generative UI source; the starter has executable controlled and declarative registrations. | Documented/source characterized; no live run yet. |
| UI components | `packages/react-core/src/v2/` and `showcase/shell-docs/src/content/reference/` | Current `CopilotChat`, `CopilotThreadsDrawer`, hook contracts, and the related popup/sidebar public surface. | Official source and fixture tests located; fixtures not run yet. |

## Current canonical starter facts

`src/app/page.tsx:21-31` says one uncontrolled
`CopilotChatConfigurationProvider` owns the active thread. The
`CopilotThreadsDrawer` selects a row or creates a fresh chat while chat and
canvas share the provider's per-thread agent clone. On mobile the drawer is an
off-canvas modal. `page.tsx:33-53` mounts that provider, drawer, `CopilotChat`
with attachments, and the app canvas together.

`src/components/example-layout/index.tsx:13-31` registers `enableAppMode` and
`enableChatMode` browser tools. `src/components/example-canvas/index.tsx:6-19`
reads `agent.state.todos`, writes with `agent.setState`, and uses
`agent.isRunning`. This is the selected bidirectional shared-state reference.

`src/hooks/use-generative-ui-examples.tsx:25-82` registers a tool-based HITL
meeting picker, controlled `pieChart` and `barChart` components, a renderer for
backend tools, and a browser-side theme tool.

## Evidence discipline

Until a reference run completes, source and test inspection is
`DOCUMENTED_REFERENCE`, even when a pinned official test describes the
behavior. It becomes `OFFICIAL_FIXTURE_REFERENCE` only after the selected test
executes, and `BLACK_BOX_REFERENCE` only after a pinned running surface is
driven and captured.

## First-run feasibility

The primary starter is locally runnable in principle: its README requires Node
20+, a package manager, an `OPENAI_API_KEY`, and launches UI plus LangGraph
agent with `npm run dev`. That is insufficient for deterministic parity and is
therefore not the first automated capture target. The pinned root workspace
contains official React-core fixture tests for progressive tool arguments and
context timing, which can run without a paid model once the locked workspace
install finishes linking. At this milestone the two `pnpm install
--frozen-lockfile --ignore-scripts` attempts populated the store but did not
finish linking `node_modules/.bin/nx`; neither test nor live UI was run.

The next reference execution should run the two focused official fixtures first
and classify their results `OFFICIAL_FIXTURE_REFERENCE`. A deterministic
AG-UI fixture can then drive the starter for `BLACK_BOX_REFERENCE` screenshots
and wire traces without exposing an API key.
