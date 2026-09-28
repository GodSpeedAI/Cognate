# CopilotKit Reconstruction — Canonical Journey Catalog

Evidence classes follow the IDM workflow. This is deliberately a thin first tranche, not a claim
that the full CopilotKit reference has been characterized.

## J-A-chat-turn (`j_a_chat_turn`)

- **Purpose**: exchange one user message for a visible streamed agent response in a conversation.
- **Actor / role**: application user / conversation participant.
- **Initiating condition**: the user has a reachable agent-chat affordance and supplies a message.
- **Current → desired state**: no active response → a terminal assistant response visible in the
  selected chat projection, with thread evidence available for later observation.
- **Preconditions**: a deterministic reference scenario is selected; a conversation identity is
  supplied or created. Authentication and hosted infrastructure are outside this tranche.
- **Material payment**: user attention and a submitted message; runtime execution capacity.
- **Steps**: open or create thread → submit user message → execution starts → assistant text is
  projected incrementally → terminal response is visible → thread evidence can be observed.
- **Capabilities / actions (proposed)**: `conversation.start`, `conversation.send`,
  `conversation.stream`, `conversation.observe`.
- **Authority**: default Cognate invocation authority applies; no external commitment is implied.
- **Artifacts / resources**: `UserMessage`, `AssistantMessage`, `StreamEvidence`, `ThreadHistory`.
- **Outcome and evidence**: a visible terminal assistant message and durable event/projection
  evidence keyed by conversation identity.
- **Settlement**: terminal response is rendered and the same identity can retrieve the resulting
  thread evidence. A completed network response without visible or durable evidence does not settle.
- **Failure / recovery**: pending pinned-reference characterization. The model does not yet assert
  retry, cancellation, reconnect, or error rendering behavior.
- **Next affordances**: send another message; later tranches may add thread restoration,
  interruption, tools, shared state, and generative UI as independently settled journeys.
- **Variants**: inline chat, popup, and sidebar are interface projections, not different canonical
  interactions. Their exact current-v2 behavior remains `UNKNOWN` until reference capture.
- **Evidence class**: `declared` for the prompt's required agent chat and streaming scope;
  `proposed` for names and Cognate bindings.

## Pending canonicalization

The following prompt-required candidates cannot be admitted to the catalog until the pinned
reference provides observed or declared detail: frontend and backend tools; bidirectional and
streaming state; agent-readable frontend context; controlled, declarative, and open-ended
generative UI; tool-based HITL; interrupt-based HITL; durable/resumable conversations; thread
management; reconnect; outside-chat agent access; AG-UI projection; component-gallery controls.

> The Interaction Domain Model should not yet be treated as canonical because the following unresolved semantic issues remain.

1. The exact pinned CopilotKit revision and selected current surfaces have not been recorded.
2. The reference-visible lifecycle, failure, reconnect, and persistence behavior has not yet been observed.
3. The remaining required prompt behaviors have not yet been canonicalized into independently settleable journeys.
