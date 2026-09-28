# Subsystem: the Interaction Domain Model

`cognate/domain/index.ts` (126 lines) plus `cognate/.sea/interaction/`. This is the app's semantic
source: what it believes it is building, expressed in a machine-readable model, bound explicitly to
the capabilities it publishes.

## Purpose

Give the app a single authoritative statement of its domain — entities, resources, flows, journeys —
and connect exactly the capabilities that realize it to the concepts they realize, with no implicit
wiring.

## Responsibilities

- Parse `.sea/interaction/interaction-model.sea` at boot and fail fast if it does not parse.
- Log the object count and content digest, and expose the same facts on `/health`.
- Produce `CapabilityContract`s from an explicit list of `{semanticId, capability}` pairs.
- Assert that the number of produced contracts matches the number of declared bindings, so a
  half-edited binding list fails at boot rather than at first use.
- Expose `semanticId(name)` = `` `deepseek-harness.interaction::${name}` ``.

## Non-responsibilities

- It does not validate the model's *meaning*. `.sea` `Policy` declarations are a referenced
  constraint, not an enforcement mechanism; real authority lives in the kernel policy and the
  continuation machinery.
- It does not copy or symlink the model file. `domain/` reads the `.sea` file in place, by URL, from
  `new URL("../.sea/interaction/interaction-model.sea", import.meta.url)`.
- It does not register anything with the runtime. Bindings produce contracts; `server.ts` passes the
  resulting `semanticRef`s into component factories.

---

## The model

Namespace `deepseek-harness.interaction`, version 1.0.0, owner `cognate-reconstruction`. At boot
this run observed **51 semantic objects**, digest
`sha256:43e412c95eaed7a95d7e2e2522f404f44b59c16d7d633fae77fafdc96cff6864` — the same line the test
suite prints on every boot.

Vocabulary it uses:

| Construct | Count here | Meaning |
|---|---|---|
| `Entity` | 13 | a thing in the domain: `User`, `OperatorAgent`, `ApprovalAuthority`, `ChildAgent`, `WorkspaceRecord`, `Session`, `ModelProvider`, `Tool`, `ApprovalGate`, `PlanMode`, `Goal`, `Subagent`, `Composer`, `CanonicalJourney` |
| `Resource` | 12 | a named transformation with a `Flow` and `quantity 1`: `ModelConfig`, `WorkspaceSelection`, `ComposerAvailability`, `SessionEvent`, `ToolCallEvidence`, `WorkspaceMutation`, `ApprovalDecision`, `PlanArtifact`, `SubagentResult`, `DurableSnapshot`, `CancellationEvidence` |
| `Flow` | 11 | `from <Entity/Role> to <Entity> quantity 1` |
| `Role` / `Relation` | 2 / 1 | `Approver` authorises `Operator`, `via flow "ApprovalDecision"` |
| `Instance … of "CanonicalJourney"` | 10 | the canonical journeys, with `journey_id`, actor, purpose, precondition, steps, settlement, variants |
| `Policy` / `Metric` | 1 / 1 | `every_canonical_flow_recorded` (∀ flows, quantity > 0); `canonical_journey_count` |

**`quantity 1` means "one occurrence of this canonical transformation", not a measured count.** The
`.sea` README records this as a representation compromise, because `.sea` has no native Journey,
Affordance, or Actor primitive: journeys are `Instance` records whose string fields carry the
narrative, and one `Role`/`Relation` pair illustrates the approval-authorization interaction.

**Evidence class.** `j_h_cancellation` is `evidence_class: "inferred"`; the other nine are
`"declared"`. This distinction is carried deliberately from
`cognate/.sea/interaction/assumptions-and-unknowns.md`.

## The bindings

Twelve bindings, declared in four tranche functions and asserted in four `bindTranche*` functions.

| # | IDM entity | Capability | Tranche |
|---|---|---|---|
| 1 | `ModelProvider` | `model.generate` | 5 |
| 2 | `ModelProvider` | `secret.put` | 5 |
| 3 | `ModelProvider` | `model.configure` | 5 |
| 4 | `WorkspaceRecord` | `workspace.select` | 5 |
| 5 | `Session` | `session.history` | 5 |
| 6–9 | `Tool` | `tool.read`, `tool.edit`, `tool.bash`, `tool.run_code` | 7 |
| 10 | `WorkspaceRecord` | `workspace.path` | 7 |
| 11 | `PlanMode` | `plan.state` | 9 |
| 12 | `Subagent` | `subagent.start` | 10 |

`secret.put` is bound to `ModelProvider` because it has no entity of its own — the credential a
provider needs. That is a judgement call, and the reasoning is recorded in `cognate/BINDINGS.md`.

## What is deliberately *not* bound

| Thing | Why not |
|---|---|
| `agent.coding`, `agent.config` | An agent id is not a `CapabilityContract`; `bindCapabilities` does not apply. Their runs still carry `semanticRef` transitively, because the capabilities they invoke record theirs. |
| `ApprovalGate` | Realized as a **pure decision function** plus a `ctx.waitFor` continuation inside the agent, not as something a `Component` can `provide`. The model's flow `ApprovalDecision from ApprovalAuthority to ApprovalGate` is realized as the `tool-approval` continuation's resume input. |
| `PlanMode`'s mode/todo/review state | Same shape as `ApprovalGate`: four events emitted by the agent, folded by the `plans` projection. Only the read side, `plan.state`, is a capability. |
| The `subagent` tool | Orchestration, not I/O. Only the leaf capability the child needs, `subagent.start`, is bound. |
| `onboarding.dismiss`, `settings.changeWorkDetails` | Published capabilities with **no** `semanticRef` passed. They are newer than the last tranche and have no obvious entity: the onboarding notice and the work-details preference are not in the model. Worth a decision rather than a silent gap. |
| `Goal`, `ChildAgent`, `ApprovalAuthority`, `Composer`, `OperatorAgent`, `User` | Real entities with nothing published for them. Binding speculatively is explicitly forbidden by `handoff.md` and `BINDINGS.md`. |

## How a binding becomes traceability

```
interaction-model.sea  →  loadSemanticProjection  →  SemanticProjection
        →  bindCapabilities(projection, pairs)  →  CapabilityContract {id, version, semanticRef}
        →  component factory (semanticRef)      →  run.invocation event records the semanticRef
```

So an invocation of `tool.edit` in the event log carries the pointer back to the `Tool` entity. That
is the whole point of doing the binding explicitly rather than inferring it.

## The `.sea` sidecar documents

| File | Contents |
|---|---|
| `interaction-model.sea` | the model itself — the only canonical source |
| `README.md` | file inventory, the stable journey id list, the representation compromise |
| `canonical-journey-catalog.md` | full definitions of all ten journeys: purpose, actor, precondition, steps, settlement, variants |
| `handoff.md` | how a downstream agent should project the model into Cognate constructs, plus "What downstream agents should NOT do" |
| `source-translation-map.md` | traces each material source statement to a modeled concept |
| `assumptions-and-unknowns.md` | classified conclusions and unresolved questions |
| `validation/` | DomainForge CLI and Cognate-adapter validation output, `limitations.md`, and `check-cognate-adapter.ts` |

These remain the canonical semantic documentation. The docs in this folder describe how they are
*used*; they do not restate the journey definitions (see [../reference/journeys.md](../reference/journeys.md)
for the journey-to-test mapping instead).

## State

None. `loadDomain` reads one file and returns an in-memory projection used during boot. The digest
is also served from `/health`, so a deployment can assert which model it booted.

## Failure modes

| Symptom | Cause |
|---|---|
| Boot throws `domain: failed to parse interaction-model.sea: …` | a `.sea` syntax error; fail-fast is intended |
| Boot throws `domain: expected N bound contracts, got M` | the binding list and the destructuring tuple disagree — they are edited separately and must be edited together |
| Boot logs a different digest than expected | the `.sea` file changed; every boot prints it, and `/health` exposes it |
| A capability has no `semanticRef` in `run.invocation` | it was mounted without one, or it is deliberately unbound |
| A binding resolves to the wrong entity name | `semanticId` builds `namespace::name`; a typo produces a lookup failure at boot, not at use |

## Extension points

- **Add a binding**: add the pair to the relevant `tranche*Bindings`, add the corresponding element to
  the destructuring in `bindTranche*`, and update the expected count. → [../how-to/add-a-capability.md](../how-to/add-a-capability.md)
- **Add an entity to the model**: edit the `.sea` file. The digest changes; the boot log and
  `/health` reflect it. Existing bindings are unaffected.
- **Add a journey**: add an `Instance … of "CanonicalJourney"` record, then a `J-<id>.test.ts` and a
  journey spec. → [../how-to/add-a-journey-test.md](../how-to/add-a-journey-test.md)

There is no automatic discovery: a new `Entity` does not create a capability, and a new capability
does not get a binding.

## Source trail

- `cognate/domain/index.ts:13` — `INTERACTION_MODEL_URL`, reading the `.sea` in place
- `cognate/domain/index.ts:22-34` — `loadDomain`, fail-fast parse, digest log
- `cognate/domain/index.ts:41-49` — `tranche5Bindings`
- `cognate/domain/index.ts:51-62` — `bindTranche5` and its count assertion
- `cognate/domain/index.ts:70-78` — `tranche7Bindings`
- `cognate/domain/index.ts:80-91` — `bindTranche7`
- `cognate/domain/index.ts:101-103` — `tranche9Bindings`
- `cognate/domain/index.ts:117-119` — `tranche10Bindings`
- `cognate/.sea/interaction/interaction-model.sea:1-4` — namespace, version, owner
- `cognate/.sea/interaction/interaction-model.sea:6-32` — the 13 entities
- `cognate/.sea/interaction/interaction-model.sea:34-54` — the 12 resources
- `cognate/.sea/interaction/interaction-model.sea:60-86` — the relation and flows
- `cognate/.sea/interaction/interaction-model.sea:88-216` — the ten journey instances
- `cognate/.sea/interaction/README.md:32-40` — the representation compromise
- `cognate/.sea/interaction/handoff.md:138-153` — "What downstream agents should NOT do"
- `cognate/BINDINGS.md` — the narrative of the bindings and the deliberate omissions
- `cognate/src/server.ts:141-146` — `loadDomain` and the four `bindTranche*` calls
- `cognate/src/server.ts:264-266` — `/health` exposing objects and digest
- `tests/architecture/domainforge-realitytrace-unchanged.test.ts` — the `.sea` grammar is not modified
