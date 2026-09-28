# Assumptions and Unknowns

## Declared

- The reconstruction must cover agent chat and streaming.
- The suite must eventually expose inline chat, popup, and sidebar layouts.
- The implementation must be expressed through normal Cognate primitives and must not depend on
  CopilotKit at runtime.

## Proposed

- `ConversationThread` is modeled as durable application state and the stable correlation identity
  for `J-A-chat-turn`.
- Incremental assistant display is projected from durable stream events rather than held only in a
  React component.
- `conversation.start`, `conversation.send`, `conversation.stream`, and `conversation.observe`
  are appropriate capability names after explicit semantic binding.

## Unknown

- Pin SHA, package versions, selected current consolidated starter, and current v2 component API.
- Exact initial content, Markdown, code, scroll, send/stop, retry, attachment, accessibility, and
  error behavior.
- Whether the reference persists each streaming delta, reconstructs it from terminal content, or
  uses another observable persistence model.
- Current behavior for tool lifecycles, state synchronization, A2UI/Open-JSON-UI, MCP Apps,
  HITL, graph interrupts, thread restoration, and reconnect/resume.

## Architectural-gap status

No kernel gap is claimed from this tranche. The thin chat journey can be composed naturally from
Cognate Context/Capability/Effect/Event/Projection and durable thread state. Any claim about
stream resume or interruption semantics awaits reference characterization and a real attempted
projection; it must not be hidden in reconstruction-specific client state.
