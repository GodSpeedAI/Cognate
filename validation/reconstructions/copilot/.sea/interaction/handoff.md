# IDM-to-Cognate Handoff — T0

This handoff authorizes only `J-A-chat-turn` implementation after its pin and behavior matrix row
are present. Do not implement pending candidates from the prompt without first adding them to the
catalog and revalidating the model.

| IDM element | Cognate realization | Traceability requirement |
| --- | --- | --- |
| `ConversationThread` | durable event-backed projection keyed by stable correlation/thread id | events retain the semantic reference for the model digest that justified them |
| `J-A-chat-turn` | deterministic `AgentDefinition.run` | one journey test named `J-A-chat-turn.test.ts` |
| proposed capabilities | explicit `bindCapabilities` entries and Components | no implicit capability publication from `.sea` |
| `StreamEvidence` | `ctx.emit` events and client projection | test observes incremental text and terminal settlement |
| chat layouts | Astryx/client projections over the same journey | UI identity does not redefine the journey |

The expected path is `Context → deterministic agent run → Capability/Effect → Event → durable
Projection → client surface`. The event log remains authoritative. A client must not keep a second
authoritative message or run state machine merely to imitate chat behavior.

**No gap found in T0.** If later reference characterization shows a lifecycle that cannot be
expressed by the constructs above, stop the local implementation and write the required
domain-independent counterexample before adding application glue.
