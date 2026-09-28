# CopilotKit Reconstruction Plan

The reconstruction is an architectural adversarial test. A CopilotKit-visible behavior is only
implemented after a canonical journey and settlement evidence exist. The source model is
`validation/reconstructions/copilot/.sea/interaction/`.

## T0 — Thin chat settlement

Model, pin, and implement `J-A-chat-turn`: send one message, visibly stream deterministic
assistant output, reach a terminal response, and retain observable durable thread evidence.
Characterize the selected current reference surface before claiming parity. Bind only explicit
Cognate capabilities and prove settlement with durable events/projection plus UI evidence.

## T1 — Conversation lifecycle and layouts

After pinned observation, add independently settled journeys for current-v2 initial content,
message rendering, stop/cancel, error/retry, threads/restoration, and inline/popup/sidebar
projections. Test restart and reconnect separately; a reload is not evidence of durable resume.

## T2 — Capability and shared-state boundary

Model and prove frontend-tool registration/invocation/result/unregistration, backend-tool
rendering, UI-to-agent context, bidirectional shared state, and partial state streaming. Test the
scope/disposal boundary and state versioning rather than substituting React-local state.

## T3 — Generative UI and human decisions

Model controlled, declarative, and open-ended UI separately. Add tool-based HITL and backend
interrupts as distinct journeys with explicit settlement/recovery. If Catalog/schema validation,
sandbox interaction return, or durable suspended execution cannot project from current Cognate
primitives, record the required domain-independent counterexample and repair the kernel first.

## T4 — Protocol and parity closure

Model and prove agent access outside chat, AG-UI projection, active-run reconnect/resume, and the
current component gallery. Run each journey test, visual/reference capture, full reconstruction
suite, the existing DeepSeek Harness reconstruction, then `just verify`; update workbench status
only with observed results.

## Gate discipline

- The pinned SHA and behavior-matrix row precede each implementation tranche.
- Every journey test is named after its catalog ID and asserts settlement evidence.
- An observed behavior that needs CopilotKit-specific glue is a failed architectural settlement,
  not a reconstruction success.
- A general repair requires its own conformance/property tests and regression runs for both
  reconstructions before the affected journey can settle.
