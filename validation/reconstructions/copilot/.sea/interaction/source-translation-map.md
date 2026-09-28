# Source Translation Map

| Source statement | Disposition | Model destination | Evidence class | Notes |
| --- | --- | --- | --- | --- |
| Reconstruction objective: agent chat | Canonicalized | `J-A-chat-turn` | declared | One user message receives an assistant response. |
| Reconstruction objective: streaming | Canonicalized | `J-A-chat-turn`, `StreamEvidence` | declared | Exact framing and lifecycle remain pending. |
| Surface C: inline chat, popup, sidebar | Variant/projection | `J-A-chat-turn` variants | declared | Their semantic identity is one chat journey; exact UI behavior requires capture. |
| Phase 4: deterministic text-streaming scenario | Supports test fixture | `J-A-chat-turn` precondition/evidence | declared | Fixture implementation is downstream work. |
| Threads, tools, state, UI generation, HITL, interrupts, reconnect, AG-UI | Unresolved | Pending canonicalization | declared | The prompt names scope but does not establish exact current behavior. |

No CopilotKit source, test, DOM, or pinned manifest was available in this tranche directory when
this map was produced. This is an explicit evidence boundary, not a negative claim about the
reference product.
