# Documentation map

Every page in this documentation system: its purpose, its primary reader need, its Diátaxis
classification, its prerequisites, its related pages, and the concepts it owns.

This file is the mechanism that prevents duplicate or competing explanations. If two pages claim the
same concept, that is a bug in this file. If you add, rename, split, merge, or remove a page, update
this table in the same change.

## Conventions

**Class** uses Diátaxis plus two labels this repository needs:

| Label | Meaning |
|---|---|
| Tutorial | A guided experience with a successful outcome |
| How-to | A goal-oriented procedure for a real task |
| Explanation | Why the system is the way it is |
| Reference | Precise contracts, no narrative |
| Description | What a subsystem is and how it fits — the layer Diátaxis does not name |
| Trace | Execution order end to end |

**Owns** lists the concepts a page is the canonical home for. Other pages link rather than restate.

---

## Layer 0 — Orientation

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [README.md](README.md) | The entry point: what this is, what it is for, one picture, the first concepts, one journey, and navigation by intent | Description | — | everything | The two-subject framing (app + harness); the intent-based navigation |
| [documentation-map.md](documentation-map.md) | This file | Reference | — | all | Page inventory and concept ownership |
| [source-map.md](source-map.md) | Concepts → implementation locations | Reference | [architecture.md](architecture.md) | all subsystem and workflow pages | The concept-to-code index |
| [architecture.md](architecture.md) | The canonical high-level model: organising idea, logical/runtime/dependency/data/control architecture, trust boundaries, extension points | Description | [mental-model.md](concepts/mental-model.md) | all | The architectural model; §1 the organising idea; §4 dependency rules; §7 boundary table |

## Layer 0.5 — Getting started

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [getting-started.md](getting-started.md) | Requirements, how to run it, how to verify, what to read next | How-to | — | [first-session.md](tutorials/first-session.md), [testing.md](operations/testing.md) | The run-and-verify loop; prerequisites |

## Layer 1 — Mental model and vocabulary

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [concepts/mental-model.md](concepts/mental-model.md) | The conceptual structure, the one idea, the product loop, what happens in a turn, the three kinds of state, the extension seams | Description | [README.md](README.md) | [architecture.md](architecture.md), [durability-model.md](explanation/durability-model.md) | The conceptual model a newcomer needs and an expert can skip |
| [concepts/glossary.md](concepts/glossary.md) | Every repository term, what it does *not* mean, and a table of identifiers that mislead | Reference | — | all | The vocabulary; the "terms the code uses that you will misread" table |

## Layer 2 — Subsystems

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [subsystems/server-runtime.md](subsystems/server-runtime.md) | The composition root: boot order, policy, the HTTP surface, the live event follower, lifecycle, failure modes | Description | [architecture.md](architecture.md) | [runtime-composition.md](explanation/runtime-composition.md), [server-startup.md](workflows/server-startup.md) | `startServer`, `GRANTED_CAPABILITIES`, the policy builders, the route table |
| [subsystems/agent-coding.md](subsystems/agent-coding.md) | One run per turn: the loop, the dispatch order, the read-before-edit guard, retry and classification | Description | [mental-model.md](concepts/mental-model.md) | [run-a-turn.md](workflows/run-a-turn.md), [tool-loop.md](workflows/tool-loop.md) | `agentCodingAgent`, `TOOL_DEFS`, `invokeModelGenerate`, `classifyModelFailure`, `MAX_TOOL_STEPS` |
| [subsystems/capabilities.md](subsystems/capabilities.md) | The shared component shape, the two invocation paths and why they differ, and each capability's behaviour | Description | [glossary.md](concepts/glossary.md) | [../reference/capabilities.md](reference/capabilities.md) | The component pattern; `resolveInWorkspace`; `fileExists`; the three-step `model.configure` order |
| [subsystems/projections.md](subsystems/projections.md) | The seven folds, the keying and tenant-stripping conventions, absence-as-default, failure modes | Description | [glossary.md](concepts/glossary.md) | [../reference/projections.md](reference/projections.md) | The fold mechanics; the `session:` correlation guard; lifecycle-event id recovery |
| [subsystems/model-provider-and-secrets.md](subsystems/model-provider-and-secrets.md) | Streaming `model.generate`, the hot-swap ordering, the credential path, and why the key never reaches the log | Description | [capabilities.md](subsystems/capabilities.md) | [security-and-trust.md](explanation/security-and-trust.md) | `ProviderRegistry.swap` ordering; the three independent mechanisms keeping secrets out of the log |
| [subsystems/domain-model.md](subsystems/domain-model.md) | The IDM, the 12 bindings, what is deliberately unbound, and how a binding becomes traceability | Description | [glossary.md](concepts/glossary.md) | [../reference/journeys.md](reference/journeys.md) | The binding table; the deliberate omissions; the `.sea` representation compromise |
| [subsystems/web-ui.md](subsystems/web-ui.md) | The projection hooks, the run-state hooks, `App`'s four flows, the composition decisions, the accessibility contracts, the known structural debt | Description | [mental-model.md](concepts/mental-model.md) | [../workflows/run-a-turn.md](workflows/run-a-turn.md) | The UI's derivation strategy; the three-way composer replacement; the attempt-aware delta rule |
| [subsystems/validation-harness.md](subsystems/validation-harness.md) | The second subject: the pin, the mock model, the Driver interface, the journeys, the capture and compare, the nine criteria, the critic rounds | Description | [parity-method.md](explanation/parity-method.md) | [testing.md](operations/testing.md) | The harness machinery; the `Expectations` discipline |

## Layer 3 — Workflows

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [workflows/server-startup.md](workflows/server-startup.md) | Boot, step by step, with what is written and what can fail | Trace | [server-runtime.md](subsystems/server-runtime.md) | [getting-started.md](getting-started.md) | The boot sequence and the `/health` check |
| [workflows/first-use.md](workflows/first-use.md) | Cold launch to an enabled composer | Trace | [server-startup.md](workflows/server-startup.md) | [tutorials/first-session.md](tutorials/first-session.md) | The onboarding, model-configuration, and workspace-selection effects |
| [workflows/run-a-turn.md](workflows/run-a-turn.md) | One message to a durable, rendered turn | Trace | [agent-coding.md](subsystems/agent-coding.md) | [tool-loop.md](workflows/tool-loop.md) | The turn's ordered steps and its state transitions |
| [workflows/tool-loop.md](workflows/tool-loop.md) | A model request becoming real filesystem and subprocess effects | Trace | [run-a-turn.md](workflows/run-a-turn.md) | [../reference/tools.md](reference/tools.md) | The per-call dispatch order; the read-before-edit guard; subprocess bounds |
| [workflows/approval-gate.md](workflows/approval-gate.md) | Escalation, blocking, and the human decision | Trace | [tool-loop.md](workflows/tool-loop.md) | [gates-and-continuations.md](explanation/gates-and-continuations.md) | The allow and deny branches; the deliberate restart divergence |
| [workflows/plan-mode.md](workflows/plan-mode.md) | Plan mode, to-dos, and the plan review | Trace | [run-a-turn.md](workflows/run-a-turn.md) | [gates-and-continuations.md](explanation/gates-and-continuations.md) | The `/plan ` and `/plan off` controls; the three exact plan strings |
| [workflows/delegation.md](workflows/delegation.md) | Starting a child run and returning its result a turn later | Trace | [run-a-turn.md](workflows/run-a-turn.md) | [../reference/deviations.md](reference/deviations.md) | Fire-and-forget delegation; how a child is excluded from `sessions` |
| [workflows/cancellation-and-failure.md](workflows/cancellation-and-failure.md) | Stop mid-stream, and the provider retry ladder | Trace | [run-a-turn.md](workflows/run-a-turn.md) | [troubleshooting.md](operations/troubleshooting.md) | The abort chain; the retry contract; the classification table; what a cancelled turn keeps |
| [workflows/persistence-and-restart.md](workflows/persistence-and-restart.md) | What survives a kill, what resumes, what is lost | Trace | [server-startup.md](workflows/server-startup.md) | [durability-model.md](explanation/durability-model.md) | The durable-state table; the five restart proofs |

## Layer 4 — Explanation

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [explanation/durability-model.md](explanation/durability-model.md) | Why the event log is the state, and what that costs | Explanation | [mental-model.md](concepts/mental-model.md) | [persistence-and-restart.md](workflows/persistence-and-restart.md) | The durability rationale and its trade-offs |
| [explanation/gates-and-continuations.md](explanation/gates-and-continuations.md) | Why the gates are pure functions and the blocks are distinct continuation types | Explanation | [approval-gate.md](workflows/approval-gate.md) | [plan-mode.md](workflows/plan-mode.md) | The shape rationale; the `tool-approval` vs `plan-review` distinction; the known weakness |
| [explanation/runtime-composition.md](explanation/runtime-composition.md) | Why `createRuntime` rather than `createHarness`, and why one process | Explanation | [architecture.md](architecture.md) | [server-runtime.md](subsystems/server-runtime.md) | The three composition conflicts; the in-process Connect decision |
| [explanation/determinism-and-replay.md](explanation/determinism-and-replay.md) | How a killed run resumes without repeating work | Explanation | [agent-coding.md](subsystems/agent-coding.md) | [persistence-and-restart.md](workflows/persistence-and-restart.md) | The three mechanisms; the five invariants to preserve |
| [explanation/parity-method.md](explanation/parity-method.md) | Why there is a harness, what parity meant, and what changed on 2026-09-27 | Explanation | [validation-harness.md](subsystems/validation-harness.md) | [../reference/deviations.md](reference/deviations.md) | The method's rationale; the retired visual target; confirmed vs inferred |
| [explanation/security-and-trust.md](explanation/security-and-trust.md) | The enforced boundaries and, just as importantly, where they stop | Explanation | [capabilities.md](subsystems/capabilities.md) | [approval-gate.md](workflows/approval-gate.md) | The boundary table; the "not enforced" list; a hardening order |

## Layer 5 — Tutorials

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [tutorials/first-session.md](tutorials/first-session.md) | A verified ten-step walkthrough: workspace, mock model, app, dialogs, configuration, a real tool turn, a restart, an approval, plan mode, delegation, cancellation | Tutorial | [getting-started.md](getting-started.md) | [first-use.md](workflows/first-use.md) | The end-to-end operator experience, with expected output per step |

## Layer 6 — How-to

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [how-to/add-a-capability.md](how-to/add-a-capability.md) | The full vertical slice for a durable feature: event, component, projection, mount, policy, binding, vocabulary, UI | How-to | [capabilities.md](subsystems/capabilities.md) | [add-a-projection.md](how-to/add-a-projection.md) | The eight-step procedure and its validation |
| [how-to/add-a-tool.md](how-to/add-a-tool.md) | Adding a model-callable tool, and deciding capability vs inline handler | How-to | [add-a-capability.md](how-to/add-a-capability.md) | [../reference/tools.md](reference/tools.md) | The decision table; containment and bounds obligations; the mock scenario |
| [how-to/add-a-projection.md](how-to/add-a-projection.md) | Adding a fold, and when not to | How-to | [projections.md](subsystems/projections.md) | [add-a-capability.md](how-to/add-a-capability.md) | The six fold rules; the rebuild-not-just-now test |
| [how-to/add-a-journey-test.md](how-to/add-a-journey-test.md) | Both kinds: the Bun integration test and the Playwright spec | How-to | [../reference/journeys.md](./reference/journeys.md) | [testing.md](operations/testing.md) | The harness helpers; what to assert; the divergence rule |
| [how-to/run-parity-capture.md](how-to/run-parity-capture.md) | Capturing checkpoints and diffing them, and when not to | How-to | [validation-harness.md](subsystems/validation-harness.md) | [testing.md](operations/testing.md) | The capture commands; reading a triptych; the hardcoded-path defect |

## Layer 7 — Reference

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [reference/capabilities.md](reference/capabilities.md) | All 14 capability contracts: input, output, side effects, errors, constraints | Reference | [glossary.md](concepts/glossary.md) | [subsystems/capabilities.md](subsystems/capabilities.md) | The capability contract set; the "not a capability" table |
| [reference/events.md](reference/events.md) | Every event type and both continuation types | Reference | [glossary.md](concepts/glossary.md) | [reference/projections.md](reference/projections.md) | The event catalogue; the two envelope conventions |
| [reference/projections.md](reference/projections.md) | The seven projections: keys, values, folds, readers, invariants | Reference | [glossary.md](concepts/glossary.md) | [reference/events.md](reference/events.md) | Row shapes; the tenant-stripping rule |
| [reference/tools.md](reference/tools.md) | The seven tools: arguments, results, exact model-facing text, guards | Reference | [glossary.md](concepts/glossary.md) | [workflows/tool-loop.md](workflows/tool-loop.md) | The tool contracts; the mock markers that drive each |
| [reference/runtime-service.md](reference/runtime-service.md) | The RPC and client surface, and the React hooks | Reference | [glossary.md](concepts/glossary.md) | [reference/capabilities.md](reference/capabilities.md) | `invoke`/`startRun`/`getRun`/`cancelRun`/`readProjection`/`events`/`subscribe`/continuations; `invoke` not being recorded |
| [reference/configuration.md](reference/configuration.md) | Environment variables, scripts, routes, fixed identifiers, limits, and what looks configurable but is not | Reference | — | [troubleshooting.md](operations/troubleshooting.md) | The configuration surface; the limits table |
| [reference/journeys.md](reference/journeys.md) | The ten journeys: settlement conditions, tests, and which is a divergence | Reference | [glossary.md](concepts/glossary.md) | [how-to/add-a-journey-test.md](how-to/add-a-journey-test.md) | The journey→test mapping |
| [reference/deviations.md](reference/deviations.md) | An index and classification of every deliberate difference from the reference | Reference | — | [parity-method.md](explanation/parity-method.md) | The classification table; the stub catalogue; where the full record lives |

## Layer 8 — Operations

| Page | Purpose | Class | Prereqs | Related | Owns |
|---|---|---|---|---|---|
| [operations/testing.md](operations/testing.md) | The four suites, what each proves, which to run when, and what nothing checks | How-to | [getting-started.md](getting-started.md) | [add-a-journey-test.md](how-to/add-a-journey-test.md) | The suite-by-suite contracts; the "what no suite checks" list |
| [operations/troubleshooting.md](operations/troubleshooting.md) | Symptoms by area, the durable-log recipe, and the known documentation drift | How-to | — | [testing.md](operations/testing.md) | The symptom tables; the drift register |

## External sources of truth

Not duplicated here; linked from the pages that depend on them. Where this tree and one of these
disagree, the file wins for its subject.

| File | Owns | Consulted by |
|---|---|---|
| `cognate/DESIGN.md` | The visual system | [web-ui.md](subsystems/web-ui.md), [parity-method.md](explanation/parity-method.md) |
| `cognate/PRODUCT.md` | Product framing, principles, accessibility baseline | [mental-model.md](concepts/mental-model.md), [parity-method.md](explanation/parity-method.md) |
| `cognate/DEVIATIONS.md` | The full deviation narrative | [reference/deviations.md](reference/deviations.md) |
| `cognate/BINDINGS.md` | The binding narrative and deliberate omissions | [subsystems/domain-model.md](subsystems/domain-model.md) |
| `cognate/README.md` | The tranche-by-tranche build narrative (partly stale) | [troubleshooting.md](operations/troubleshooting.md) |
| `cognate/.sea/interaction/` | The IDM and its sidecars | [subsystems/domain-model.md](subsystems/domain-model.md), [reference/journeys.md](reference/journeys.md) |
| `reference-behavior-matrix.md` | What the reference does, section by section | [validation-harness.md](subsystems/validation-harness.md) |
| `reference-manifest.json` | The pin, the launch, the auth handoff, the environment notes | [validation-harness.md](subsystems/validation-harness.md) |
| `architecture-evidence.md` | The nine criteria and their results | [testing.md](operations/testing.md) |
| `primitive-provenance.md` | The feature→primitive mapping and the four framework findings | [parity-method.md](explanation/parity-method.md) |
| `parity-report.md` | The settlement gate and the classified deviations | [parity-method.md](explanation/parity-method.md) |
| `critic/` | Review findings and dispositions | [reference/deviations.md](reference/deviations.md) |
| `diffs/summary.md`, `tests/journeys/results/summary.md` | The last recorded results | [testing.md](operations/testing.md) |

## Canonical ownership at a glance

Some concepts are the classic ones that acquire three competing explanations. This is the ruling.

| Concept | Canonical home | Linked from |
|---|---|---|
| The architectural model | [architecture.md](architecture.md) | every other page |
| Every term's meaning | [concepts/glossary.md](concepts/glossary.md) | every page |
| The capability contracts | [reference/capabilities.md](reference/capabilities.md) | [subsystems/capabilities.md](subsystems/capabilities.md) narrates; the reference states |
| The event catalogue | [reference/events.md](reference/events.md) | workflow and subsystem pages |
| The projection row shapes | [reference/projections.md](reference/projections.md) | [subsystems/projections.md](subsystems/projections.md) narrates |
| The tool contracts | [reference/tools.md](reference/tools.md) | [workflows/tool-loop.md](workflows/tool-loop.md) traces |
| The journey→test mapping | [reference/journeys.md](reference/journeys.md) | [testing.md](operations/testing.md), [how-to/add-a-journey-test.md](how-to/add-a-journey-test.md) |
| The deviation catalogue | `cognate/DEVIATIONS.md`, indexed by [reference/deviations.md](reference/deviations.md) | [parity-method.md](explanation/parity-method.md) |
| The visual system | `cognate/DESIGN.md` + `src/ui/app.css` | [subsystems/web-ui.md](subsystems/web-ui.md) |
| The IDM journey definitions | `cognate/.sea/interaction/canonical-journey-catalog.md` | [reference/journeys.md](reference/journeys.md) summarises |
| How to run and verify | [operations/testing.md](operations/testing.md) | [getting-started.md](getting-started.md) |
| Known documentation drift | [operations/troubleshooting.md](operations/troubleshooting.md#known-documentation-drift) | [reference/deviations.md](reference/deviations.md) |

## Adding a page

1. Decide which reader need it serves and which layer that is. If two pages would serve the same
   need, extend one instead.
2. Check the ownership tables above: does an existing page already own the concepts?
3. Write it with a *Source trail* section naming the files and symbols that establish its claims.
4. Add a row here, and add inbound links from the pages that should reach it.
5. If it introduces a new concept, add it to [concepts/glossary.md](concepts/glossary.md).
6. Add its concepts to [source-map.md](source-map.md) if they have an implementation location.
