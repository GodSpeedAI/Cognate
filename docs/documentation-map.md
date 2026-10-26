# Documentation map

Every canonical page, what it is for, who it is for, what it depends on, and which concepts it
owns. Use this to find the right page — and to avoid writing a second page about something that
already has a home.

`tests/architecture/docs.test.ts` walks `docs/` and requires every page it finds to be named here, so
adding, renaming, or removing a page means editing this list.

## How to read the columns

- **Reader need** — the question the page answers (Diátaxis: reference / how-to / explanation /
  tutorial).
- **Owns** — the concepts with this page as their canonical home. Another page should link, not
  restate.
- **Prerequisites** — read first.

## Orientation and model

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [README.md](README.md) | Orientation: what is this, what does it do, where do I go | the entry point, the eight core concepts, the representative journey | — |
| [explainers/README.md](explainers/README.md) | Interactive model: visual simulation of replay, architecture, and concurrency | execution replay stepper, 6-plane invariant explorer, multi-worker lease simulator, cognitive portal | README |
| [getting-started.md](getting-started.md) | How-to: get it running from a checkout | prerequisites, first commands, `cognate create`/`dev`, examples, the verification commands | README |
| [mental-model.md](mental-model.md) | Explanation: the system's conceptual structure | events-as-truth, declaration vs. live instance, eligibility vs. authority, durable unfinished work, the five planes, what is authoritative, the three kinds of change | README |
| [concepts.md](concepts.md) | Reference: the vocabulary | `Context`, `Scope`, `CapabilityContract`/`Requirement`, `Component`/fiber, the three kinds of change, events, projections, continuations, runs and `RunContext` replay | mental-model |
| [architecture.md](architecture.md) | Reference: the architecture | the six planes, authority vs. projection paths, package topology, the dependency rules, the package table | mental-model, concepts |

## Subsystems

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [subsystems/kernel.md](subsystems/kernel.md) | Explanation + reference: the composition kernel | `Context`/`Scope`/`Component`/`FiberContext`/`ComponentHandle`/`Effects`, the fiber state machine, `Kernel` events, the conformance suites | concepts, architecture |
| [subsystems/durable-state.md](subsystems/durable-state.md) | Explanation + reference: events, stores, projections, the outbox | `NewEvent`/`StoredEvent`, `CommitRequest`, `DurableStore`, `Projection`/`ProjectionRunner`, `OutboxDispatcher`, the SQLite migrations | concepts, architecture |
| [subsystems/runtime.md](subsystems/runtime.md) | Explanation + reference: the runtime | `AgentDefinition`, `RunContext`, `RuntimeService`, `Caller`, `ServiceError`, `RunView`, `RuntimeOptions`, `ActionPolicy` | kernel, durable-state |
| [subsystems/continuations-and-commitments.md](subsystems/continuations-and-commitments.md) | Explanation + reference: unfinished work and irreversible work | `ContinuationRecord`, `ContinuationStatus`, `ResumeHandler`, `TransitionOutcome`, `CommitmentRecord`/`CommitmentState`, `CommitmentTarget` | durable-state |
| [subsystems/capabilities-and-cognition.md](subsystems/capabilities-and-cognition.md) | Explanation + reference: selection, cognition, adapters | `Candidate`/`EligibilityRule`/`Ranker`/`SelectionDecision`/`Outcome`, `ModelProvider`, `CognitiveEntry`/`CognitiveIndex`/`Embedder`/`SourceResolver`, the adapter inventory | kernel, durable-state |
| [subsystems/wire-and-protocols.md](subsystems/wire-and-protocols.md) | Explanation + reference: the wire | the Connect mapping, `errorCodes`, the AG-UI matrix, MCP and A2A adapters, the caller-from-headers rule | runtime |
| [subsystems/presentation.md](subsystems/presentation.md) | Explanation + reference: the client, React, Astryx | `Readable<T>`, `RunState`, `CognateClient`, the hook surface, the Astryx surfaces | runtime, wire |
| [subsystems/application-composition.md](subsystems/application-composition.md) | Explanation + how-to: profiles, the CLI, the starter | `ProfileDefinition`, `ComponentEntry`, `ResolvedProfile`, `CopilotApp`, `Harness`, `CognateConfig`, `cognate create`/`dev` | runtime, presentation |

## Workflows (what actually happens)

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [workflows/startup-and-the-background-loop.md](workflows/startup-and-the-background-loop.md) | Explanation: process startup and the loop | the startup sequence, `tick`/`kick`/`quiescent`, crash recovery, shutdown | runtime |
| [workflows/run-execution.md](workflows/run-execution.md) | Explanation: the canonical trace | `startRun`'s single commit, the step-id contract, write races and retries, cancellation, the replay guarantees | runtime |
| [workflows/capability-invocation.md](workflows/capability-invocation.md) | Explanation: the invocation path | the five steps, the two decision points, `AsyncLocalStorage` decision capture, tenant propagation, the two-phase selection, the event that records it | kernel, capabilities-and-cognition |
| [workflows/continuation-and-resume.md](workflows/continuation-and-resume.md) | Explanation: suspension and resumption | the continuation lifecycle, the suspend/resume/cancel/expiry traces, `BLOCKED`, frontend capabilities | continuations-and-commitments |
| [workflows/shared-state.md](workflows/shared-state.md) | Explanation: bidirectional shared state | the two writers, the two streams and why, the fold semantics, `expectedVersion`, the client fold | runtime |
| [workflows/evidence-and-observation.md](workflows/evidence-and-observation.md) | Explanation: observations and evidence | `observationIntent`, `ObservationDelivery`, the SXR CLI workflow, per-observation idempotency, the correlation round-trip, normal vs. strict | durable-state |
| [workflows/client-and-ui-session.md](workflows/client-and-ui-session.md) | Explanation: a live client session | the reconnecting subscription, `RunStore`'s fold, frontend capabilities, React bindings, AG-UI as an alternative surface | presentation, wire |

## Explanation (why)

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [explanation/why-replay.md](explanation/why-replay.md) | Explanation: why runs replay | the decision, the three failures it avoids, its costs, the state-read special case | run-execution |
| [explanation/why-projection-not-storage.md](explanation/why-projection-not-storage.md) | Explanation: why everything is a fold | the invariant, erasure, rebuild, tenancy, multiple surfaces, the costs, the line it will not cross | mental-model, durable-state |
| [explanation/authority-and-learning.md](explanation/authority-and-learning.md) | Explanation: why learning cannot grant authority | the three "may I?" questions, what a ranker may do, durable feedback, UCB1, the cognitive analogue | capability-invocation, cognition |
| [explanation/why-adapters.md](explanation/why-adapters.md) | Explanation: why adapters, and their rules | the boundary list, the three properties, the cost of mitigation, the "is it a new primitive?" rule | architecture |
| [explanation/design-principles.md](explanation/design-principles.md) | Explanation: the design rules behind Cognate | semantics first, everything is a capability, live components, events as truth, cognition is not truth, the design rule (moved from the README) | mental-model |
| [explanation/under-the-hood.md](explanation/under-the-hood.md) | Explanation: the README's technical detail | semantic modelling, contracts and providers, durable events, continuations, authority, recoverability, evidence, protocols, profiles (moved from the README) | architecture |
| [explanation/what-you-can-build.md](explanation/what-you-can-build.md) | Explanation: application shapes | the kinds of application Cognate composes, one application with many representations (moved from the README) | README |
| [comparisons.md](comparisons.md) | Explanation: Cognate compared with agent frameworks, frontend agent SDKs, memory frameworks and workflow engines; architecture lineage | comparisons, lineage (moved from the README) | README |

## Tutorials

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [tutorials/run-your-first-agent.md](tutorials/run-your-first-agent.md) | Tutorial: agent + capability + runtime + client, then prove durability | the four-file walkthrough, the two determinism rules, reading the event log | getting-started |
| [tutorials/human-in-the-loop.md](tutorials/human-in-the-loop.md) | Tutorial: `ctx.waitFor`, approve, restart, resume | the wait, the durable record, resolution, the interesting failure cases, the two UI options | run-your-first-agent |
| [tutorials/start-an-app-from-a-checkout.md](tutorials/start-an-app-from-a-checkout.md) | Tutorial: `cognate create` → `bun dev` | the generate/install/run flow, the routes, proving durability, the harness profile | getting-started |

## How-to guides

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [how-to/add-a-capability.md](how-to/add-a-capability.md) | How-to: add a capability | the component, the mount, the policy, the call, verification, symptoms | extensions |
| [how-to/add-a-projection.md](how-to/add-a-projection.md) | How-to: add a read model | the projection contract, registration, reading, erasure, symptoms | durable-state |
| [how-to/add-a-protocol-adapter.md](how-to/add-a-protocol-adapter.md) | How-to: extend the wire | the five-package contract revision, schema + codegen, both mapping directions, non-Connect protocols | wire-and-protocols |
| [how-to/load-a-composed-semantic-world.md](how-to/load-a-composed-semantic-world.md) | How-to: resolve a root `.sea` model and imported modules | canonical DomainForge source-map loading, organizational `world_ref`, and native binding gate | semantics, application-composition |
| [how-to/verify-a-change.md](how-to/verify-a-change.md) | How-to: prove a change | the verification loop, the narrow gate, the suites, recording the result, environment caveats | getting-started |

## Reference

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [reference/commands-and-configuration.md](reference/commands-and-configuration.md) | Reference: everything invocable | `just` recipes, `package.json` scripts, the `cognate` CLI and its flags, the routes, env vars, `RuntimeOptions`, tool versions | — |
| [reference/runtime-service-and-agents.md](reference/runtime-service-and-agents.md) | Reference: the service and agent contract | `Caller`, `ServiceError` codes, every `RuntimeService` method with parameters and errors, `AgentDefinition`, every `RunContext` member, conformance | runtime |
| [reference/events-and-stores.md](reference/events-and-stores.md) | Reference: the data model | `NewEvent`/`StoredEvent` fields, every event type, streams, record collections, outbox topics, projections, blobs, the SQLite migrations, store errors | durable-state |
| [reference/capability-and-architecture-contracts.md](reference/capability-and-architecture-contracts.md) | Reference: capabilities, the kernel contract, the guards | published capability ids, the kernel types, policies, invocation results, the architecture tests, the forbidden edges, acceptance criteria A–M | kernel |
| [reference/verification.md](reference/verification.md) | Reference: the ledger and evidence model | the ledger shape, what `check` enforces, what `gate.ts` does, evidence, compatibility fixtures, the current limits, what "implemented" does not mean | — |
| [troubleshooting.md](troubleshooting.md) | Reference: diagnose a symptom | symptom → cause → recovery tables per subsystem, plus the environment caveats | — |
| [package-naming.md](package-naming.md) | Reference: what each npm package is called and why | the `@godspeedai/cognate-<module>` convention, the 0.1.0 old→new name mapping, the umbrella package, Release Please handling of the rename | — |
| [package-readme-standard.md](package-readme-standard.md) | Reference: what every published package README must contain | the consumer-README convention, the hard rules `scripts/check-readmes.mjs` enforces, and how README examples are verified | — |

## Plane pages (cross-cutting concerns)

| Page | Reader need | Owns | Prerequisites |
|---|---|---|---|
| [semantics.md](semantics.md) | Explanation + reference: `.sea` and DomainForge | `SemanticRef` identity rules, the kind mapping table, DEBT-001..003 | concepts |
| [cognition.md](cognition.md) | Explanation + reference: recall, ranking, safety | the `CognitiveIndex` contract, the retrieval pipeline, the three implementations, adaptive ranking, why not SONA | concepts, architecture |
| [rvf.md](rvf.md) | Explanation + reference: portable cognition | branching, attached/detached/rejected, the DEBT-006 mitigations, what remains unproven | cognition |
| [evidence.md](evidence.md) | Explanation + reference: RealityTrace | `ObservationPort`, receipts vs. evidence vs. settlement, normal vs. strict, the SXR CLI workflow, the correlation round-trip | durable-state |
| [ui.md](ui.md) | Reference: client, React, Astryx | the client surface, the hook list, the Astryx contract, the E2E note | presentation |
| [protocols.md](protocols.md) | Reference: each protocol | protobuf, Connect, AG-UI, MCP, A2A — surface by surface | wire-and-protocols |
| [security.md](security.md) | Reference: the trust boundaries | default deny, invocation-time authorization, tenant isolation, retrieval authorization, secrets, erasure, protocol limits, known gaps | concepts, kernel |
| [extensions.md](extensions.md) | How-to: the whole extension surface | capabilities, model providers, the adapter table, `defineProfile`, the copilot and harness contracts | concepts |

## Architecture decisions

[decisions/README.md](decisions/README.md) and the twelve records it indexes:
[ADR-0001](decisions/ADR-0001-kernel-engine-cordis.md) ·
[ADR-0002](decisions/ADR-0002-semantic-binding-domainforge.md) ·
[ADR-0003](decisions/ADR-0003-wire-connect-protobuf.md) ·
[ADR-0004](decisions/ADR-0004-cognition-ruvector.md) ·
[ADR-0005](decisions/ADR-0005-adaptive-ranking-sona.md) ·
[ADR-0006](decisions/ADR-0006-portable-cognition-rvf.md) ·
[ADR-0007](decisions/ADR-0007-observations-realitytrace.md) ·
[ADR-0008](decisions/ADR-0008-ag-ui.md) ·
[ADR-0009](decisions/ADR-0009-ui-react-astryx.md) ·
[ADR-0010](decisions/ADR-0010-mcp.md) ·
[ADR-0011](decisions/ADR-0011-runtime-service-contract-package.md) ·
[ADR-0012](decisions/ADR-0012-cognate-package-naming.md) ·
[ADR-0013](decisions/ADR-0013-postgresql-authoritative-store.md) — each states a decision, its
context, its consequences, and what it rejected. They are the canonical record of *why*; the explanation pages
above are the canonical record of *what the code does today*. Where an ADR's status line predates
the implementation, the decision still stands and the current status is in the ledger.

## This map itself

| Page | Purpose |
|---|---|
| [documentation-map.md](documentation-map.md) | this file: page purpose, reader need, canonical concepts, prerequisites |
| [source-map.md](source-map.md) | concept, capability, workflow, and subsystem → implementation |
| [releases.md](releases.md) | Release engineering: one SDK GitHub release per version, component tags, npm publication and recovery |
| [release-unregistered-packages.md](release-unregistered-packages.md) | Release engineering: bootstrap and verify newly registered npm SDK modules |

## Pages outside `docs/`

| Path | Owner | Role |
|---|---|---|
| [../README.md](../README.md) | the repository | the target-state overview and the entry point to this tree |
| [../AGENTS.md](../AGENTS.md) | the repository | the agent operating surface: development loop, conventions, boundaries, change policy |
| [../.agents/AGENTS.md](../.agents/AGENTS.md) | the workbench | the status-snapshot protocol |
| [../.agents/CURRENT_STATUS.yaml](../.agents/CURRENT_STATUS.yaml) | the workbench | the authoritative current state; `just status` |
| [../.agents/DEBT.md](../.agents/DEBT.md) | the workbench | the debt register; `troubleshooting.md` links, never copies |
| [../.agents/OPEN_QUESTIONS.md](../.agents/OPEN_QUESTIONS.md) | the workbench | unresolved decisions |
| [../requirements/ledger.yaml](../requirements/ledger.yaml) | the workbench | the requirement/proof map; the authority on status |
| [../.agents/specs/…](../.agents/specs/software-design-spec-cognate.-frameworkmd) | the workbench | the normative design; cited by section, never copied |
| [../examples/README.md](../examples/README.md) | the examples | the runnable example index |
| [../templates/starter/README.md](../templates/starter/README.md) | the template | the generated-app layout |
| `packages/*/README.md`, `profiles/*/README.md` | each package | the per-package contract; required by `docs.test.ts` |
| `packages/*/AGENTS.md`, `profiles/*/AGENTS.md` | each package | per-package guardrails for agents; required by `docs.test.ts` |

## Canonical ownership rules

1. One concept, one home. Link from elsewhere; do not restate.
2. A claim about *what the code does today* belongs in a subsystem or workflow page, backed by a
   source trail.
3. A claim about *why it is built that way* belongs in `explanation/` or an ADR. Mark inferred
   rationale as inferred.
4. A claim about *status* belongs to the ledger or the status snapshot, not to prose.
   `docs.test.ts` fails a page that calls an `implemented` requirement candidate.
5. A procedure belongs in a tutorial (learn) or a how-to (do), never in a reference page.
6. Per-package details live in the package's own `README.md`; the pages here link to it and own
   the cross-cutting story.

## Related

- [contracts/fenced-outbox-leases.md](contracts/fenced-outbox-leases.md) — additive native delivery lease and compatibility contract.
- [contracts/run-write-ownership.md](contracts/run-write-ownership.md) — authoritative store-time run ownership, fenced run-scoped writes and crash-recovery contract.
- [evidence/run-write-ownership.md](evidence/run-write-ownership.md) — store and two-process runtime stale-writer, fencing and ambiguous-reconciliation regression evidence.
- [evidence/fenced-outbox-leases.md](evidence/fenced-outbox-leases.md) — store conformance and stale-owner regression evidence.
- [evidence/postgres-idempotency-pool.md](evidence/postgres-idempotency-pool.md) — saturated connection-pool replay deadlock and transaction-local fix.
- [evidence/pr42-release-readiness.md](evidence/pr42-release-readiness.md) — actionable review fixes, release audit and remaining operator authorization gates.
- [evidence/sdk-publication-receipts.md](evidence/sdk-publication-receipts.md) — exact-version public registry metadata and commit-association receipt verification.
- [runtime-concurrency.md](runtime-concurrency.md) — bounded run admission, resource contention and limits.
- [evidence/async-run-admission.md](evidence/async-run-admission.md) — awaited trusted resource-key lookup, shutdown abort, and focused regression evidence.
- [contracts/linux-bubblewrap-world.md](contracts/linux-bubblewrap-world.md) — opt-in Linux child-process containment and explicitly unclosed production requirements.
- [source-map.md](source-map.md) — concept to implementation.
- [README.md](README.md) — intent-based navigation.
