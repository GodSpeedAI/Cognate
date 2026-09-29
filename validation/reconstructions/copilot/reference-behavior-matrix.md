# CopilotKit reference behavior matrix

Pinned reference: `CopilotKit/CopilotKit@6e452e5342db53e9ab23d8b3c0a4592ec25ff554`.
Rows R-A04, R-A06, and R-A07 now have **OFFICIAL_FIXTURE_REFERENCE** evidence:
the pinned React-core frontend-tool and agent-context timing suites passed
21/21 tests on 2026-09-28. R-A02 has partial **OFFICIAL_FIXTURE_REFERENCE**
evidence for `setState` reaching a subsequent run (`use-agent.e2e.test.tsx`,
2/2 tests passed); agent-to-canvas writes remain documented. The other rows
remain **DOCUMENTED_REFERENCE**.
These fixtures prove their named hook behavior, not starter-application or
black-box parity.

Execution feasibility at this milestone: `examples/integrations/langgraph-js`
needs `OPENAI_API_KEY` for its documented normal launch, while the focused
React-core fixtures do not require a paid model. The focused package fixture
command was `pnpm exec vitest run src/v2/hooks/__tests__/use-frontend-tool.e2e.test.tsx src/v2/hooks/__tests__/use-agent-context-timing.e2e.test.tsx`
from `packages/react-core`; it passed 2 files and 21 tests. The Nx wrapper
encountered local plugin-worker startup failure, so the direct official Vitest
runner was used. The additional `use-agent.e2e.test.tsx` file passed 2/2 tests.

| ID | Priority | Surface | User/action and required visible behavior | State, persistence, protocol behavior | Exact pinned evidence |
| --- | --- | --- | --- | --- | --- |
| R-A01 | P0 | LangGraph JS starter | Open the starter; use the Chat/App toggle or ask the agent to invoke `enableAppMode` / `enableChatMode`. The selected mode exposes chat, canvas, or split view according to responsive layout. | Browser tool changes local presentation state. | `examples/integrations/langgraph-js/src/components/example-layout/index.tsx:13-82` |
| R-A02 | P0 | LangGraph JS starter | Ask the agent to change todos, then edit a todo in the canvas. The canvas reflects agent writes and the next agent turn sees the user write. | `useAgent` reads `state`; `setState` writes shared agent/application state; `isRunning` controls canvas affordance. | `src/components/example-canvas/index.tsx:6-19`; `showcase/shell-docs/src/content/reference/hooks/useAgent.mdx:136-206` |
| R-A03 | P0 | Current v2 chat | Send a message and observe text appear before run completion; stop leaves no fictitious completed response. | `RUN_STARTED`, text chunks, tool chunks, state events, and `RUN_FINISHED` are meaningful ordered intermediate events. A buffering adapter cannot meet this checkpoint. | Official fixture machinery in `packages/react-core/src/v2/__tests__/utils/test-helpers.tsx`; partial-tool assertion in `hooks/__tests__/use-frontend-tool.e2e.test.tsx:200-276` |
| R-A04 | P0 | Current v2 frontend tool | Mount a component defining a frontend tool, request it, and observe browser handler execution plus chat rendering. Change dependencies and request it again. Unmount then request it: the handler is unavailable. | The tool is added in layout effect; dependencies/availability cause re-registration. The handler is removed on cleanup. | `packages/react-core/src/v2/hooks/use-frontend-tool.tsx:13-53`; `hooks/__tests__/use-frontend-tool.e2e.test.tsx:1-197` |
| R-A05 | P0 | Current v2 frontend tool / rich history | After a frontend-tool component unmounts, inspect an already recorded tool call. Its renderer remains available for historical display, even though its handler was removed. | Capability discovery lifecycle and projection-renderer lifetime are different. Restore/replay must preserve a renderable artifact without re-enabling the client capability. | `packages/react-core/src/v2/hooks/use-frontend-tool.tsx:38-41` |
| R-A06 | P0 | Current v2 frontend tool | Stream incomplete tool JSON arguments; the custom tool UI appears before JSON is complete and updates as chunks arrive, then renders result after the tool result event. | Partial args at `InProgress`; complete args at `Executing`/`Complete`; result is available only at `Complete`. | `showcase/shell-docs/src/content/reference/hooks/useFrontendTool.mdx:64-73`; fixture `hooks/__tests__/use-frontend-tool.e2e.test.tsx:200-280` |
| R-A07 | P1 | Agent-readable context | Mount a component publishing application state, alter the state, then start a turn. The agent receives the latest JSON-string context. Unmount removes it. | Context is browser-to-agent input, not agent-writable shared state. Values are JSON strings on the AG-UI boundary. | `packages/react-core/src/v2/hooks/use-agent-context.tsx:26-45`; fixture `hooks/__tests__/use-agent-context-timing.e2e.test.tsx:82-138` |
| R-A08 | P1 | Controlled Generative UI / backend rendering | Request a chart or a backend tool. It renders an in-progress card and then result/completion card; A2UI helper tools do not render a duplicate generic card. | Component renderer receives tool status and arguments; backend rendering is renderer-only and does not run a browser handler. | `examples/integrations/langgraph-js/src/hooks/use-generative-ui-examples.tsx:42-68` |
| R-A09 | P1 | Tool-based HITL | Ask to schedule time; inline meeting UI accepts a response and execution continues. | A waiting tool receives human response separately from runtime interrupt semantics. | `examples/integrations/langgraph-js/src/hooks/use-generative-ui-examples.tsx:25-40` |
| R-A10 | P1 | Runtime interrupt | Agent finishes a run with `outcome.type === "interrupt"`; inline or manually placed UI resolves/cancels all pending interrupts, then resume starts. | Standard interrupt discovery is `RUN_FINISHED` plus interrupt payload, not a tool result. | `showcase/shell-docs/src/content/reference/hooks/useInterrupt.mdx:6-10,36-43,145-151` |
| R-A11 | P1 | A2UI | Ask for fixed or dynamic declarative UI. The agent sends operations, catalog validates/resolves components, UI renders, and interaction returns to the agent. | This is a catalog-constrained projection, distinct from controlled renderer selection. | `examples/integrations/langgraph-js/README.md` section “A2UI”; `agent/src/a2ui*.ts`; `src/app/declarative-generative-ui/` |
| R-A12 | P1 | Rich Threads | Create/select a thread and reload. Replayed chat, tools, and generative UI remain associated with the active per-thread agent. | Starter connects/replays the per-thread agent clone. Managed list mutation/realtime is Intelligence-dependent. | `examples/integrations/langgraph-js/src/app/page.tsx:21-40`; `showcase/shell-docs/src/content/reference/hooks/useThreads.mdx:17-21` |
| R-A13 | P1 | Managed thread list | Rename, archive, delete, paginate, and receive external thread updates. | Cursor pagination; server-confirmed pessimistic updates; WebSocket realtime; default 2–5 word first-run title. | `showcase/shell-docs/src/content/reference/hooks/useThreads.mdx:44-97,134-142` |
| R-A14 | P1 | UI layouts | Operate current inline chat, drawer, popup, sidebar and responsive drawer state. | Mobile thread drawer is off-canvas; desktop behavior reserves drawer space. | Starter `page.tsx:21-40`; current v2 component source under `packages/react-core/src/v2/components/chat/` |

## Architecture-sensitive observations

1. **Progress is observable behavior.** R-A03 and R-A06 require events to
   reach the client before finalization. A server endpoint that aggregates an
   entire Cognate run and only then produces SSE fails the reference's text,
   partial-arguments, executing status, cancellation, and live-reconnect
   semantics. The minimal repair belongs at the general protocol/runtime event
   subscription boundary, with ordered incremental delivery and resumable
   position; it is not a CopilotKit feature.
2. **Availability is separate from renderability.** R-A04 and R-A05 require a
   scoped capability to disappear on unmount while an already materialized tool
   invocation remains renderable. This is a general distinction between current
   authority and durable projection/artifact provenance.
3. **Agent context is immutable per invocation input.** R-A07 is a
   mount-scoped browser-provided context contribution, serialized as a string
   for the agent. It must not be modeled as agent-writable shared state.

## Capture backlog

Black-box checkpoints still required: empty/streaming/completed/cancelled chat;
partial and completed tool call; agent and user state write; HITL and interrupt
pending/resolved; A2UI; MCP app; thread drawer/switch/restore; popup/sidebar;
dark and responsive states. No screenshot path is claimed before capture.
