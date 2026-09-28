# CopilotKit Reconstruction — Canonical Journey Catalog

Pinned reference: `CopilotKit/CopilotKit@6e452e5342db53e9ab23d8b3c0a4592ec25ff554`.
All current-reference entries below are **DOCUMENTED_REFERENCE**: selected fixtures and surfaces
have not executed. `proposed_repair` describes a Cognate repair candidate, never a parity claim.

| Journey | Evidence | Transformation and settlement | Cognate interpretation |
| --- | --- | --- | --- |
| `J-A-chat-turn` | R-A03, documented | Send; show text before completion; retain terminal thread evidence. | Agent → events → thread projection → client projection. |
| `J-B-front-capability` | R-A04–R-A06, documented; C1 open | Mount offers browser capability; agent invokes partial args; unmount removes new-call availability while history remains renderable. | C1 general lease-bound remote capability offer. No static tool manifest or app registry. |
| `J-C-shared-state` | R-A01–R-A02, documented | Agent changes canvas state; user commits edit; next turn sees it. | Versioned `state.changed` and durable projection. |
| `J-D-agent-context` | R-A07, documented | Mounted UI supplies current context to next run; unmount removes it. | Immutable invocation input, separate from agent-writable state. |
| `J-E-controlled-rendering` | R-A08, documented | Backend/control renderer shows pending and terminal state without browser-handler execution for backend work. | Invocation evidence projected through renderer catalog. |
| `J-F-tool-human-decision` | R-A09, documented | Inline UI returns an answer to waiting tool and execution continues. | Continuation resolved as tool result. |
| `J-G-runtime-interrupt` | R-A10, documented | Runtime exposes interrupt; human resolves/cancels; suspended run resumes or ends. | Separate continuation condition and outcome. |
| `J-H-declarative-ui` | R-A11, documented | Catalog validates operation, renders data-bound UI, returns interaction. | Validated declarative projection and return event. |
| `J-J-rich-thread` | R-A05, R-A12–R-A13, documented | Thread replay retains chat/tools/UI but never reauthorizes stale offers. | Event replay plus renderer provenance. |
| `J-K-live-recovery` | R-A03, proposed repair | Deliver committed progress before terminalization; resume from cursor without loss/duplication. | General event subscription/AG-UI repair. |

## Canonicalization decisions

- Inline chat, popup, sidebar, responsive drawer, and chat/application mode are projections or
  state variants. They do not create distinct canonical interactions.
- Tool-based response (`J-F`) and runtime interruption (`J-G`) have different origin, result, and
  settlement, so they remain distinct.
- Rich restoration (`J-J`) is separate from a chat turn because replay must preserve renderer
  provenance while refusing a previously unmounted client capability.
- Managed hosted thread list mutations, Open-JSON-UI, MCP Apps/open-ended UI, attachments, and
  visual accessibility detail remain pending characterization/execution and are not settled.

Every journey needs a named test and capture before settlement. Documented recovery claims stop at
C1 lease revocation and ordered cursor resume; exact reference error/cancel/reconnect UI is still
unexecuted.

> The Interaction Domain Model should not yet be treated as canonical because the following unresolved semantic issues remain.

1. Every matrix row is DOCUMENTED_REFERENCE; no official fixture or black-box surface has run.
2. C1 remote capability offer is an open general Cognate gap, blocking natural J-B implementation.
3. Live AG-UI delivery and cursor recovery proof are not yet complete.
4. Open-ended UI and managed hosted thread-list behavior lack executable local reference evidence.
