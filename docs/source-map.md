# Source map

Where each significant concept, capability, workflow, and subsystem lives. Conceptual pages carry
the explanation; this page is the index from concept to implementation.

Paths are repo-relative. Symbols are the ones that establish the behavior, not every export.

## Concepts

| Concept | Canonical page | Implementation |
|---|---|---|
| `Context` (principal + tenant) | [concepts.md](concepts.md) | `packages/kernel-api/src/types.ts:15` `Principal`; `packages/runtime-api/src/types.ts:132` `Caller` |
| `Scope` | [concepts.md](concepts.md) | `packages/kernel-api/src/types.ts:186` `Scope`; `packages/kernel-cordis/src/scope.ts` `ScopeImpl` |
| `CapabilityContract` / `Requirement` | [concepts.md](concepts.md) | `packages/kernel-api/src/types.ts:24,34` |
| Eligibility (`isCompatible`) | [concepts.md](concepts.md) | `packages/kernel-api/src/compat.ts:12` |
| Selection (two phases, ranker) | [cognition.md](cognition.md) | `packages/capabilities/src/selector.ts:22` `createSelector`, `:217` `createOutcomeRanker` |
| `Policy` (default deny) | [security.md](security.md) | `packages/kernel-api/src/policy.ts:4` `denyAll` |
| `ActionPolicy` (service level) | [security.md](security.md) | `packages/runtime-bun/src/index.ts:8`; enforced at `packages/runtime-bun/src/service.ts:14` |
| `Component` | [subsystems/kernel.md](subsystems/kernel.md) | `packages/kernel-api/src/types.ts:154`; `packages/kernel-cordis/src/fiber.ts:44` `FiberUnit` |
| Fiber lifecycle | [subsystems/kernel.md](subsystems/kernel.md) | `packages/kernel-cordis/src/fiber.ts` — `start`, `tryActivate`, `runAttempt`, `teardown` |
| Reversible effects | [subsystems/kernel.md](subsystems/kernel.md) | `packages/kernel-api/src/types.ts:116-128` `EffectHandle`, `Effects` |
| `SemanticRef` | [semantics.md](semantics.md) | `packages/kernel-api/src/types.ts:4`; produced by `packages/domainforge/src/index.ts` `loadSemanticProjection` |
| Event envelope | [reference/events-and-stores.md](reference/events-and-stores.md) | `packages/events/src/types.ts:5` `NewEvent`, `:24` `StoredEvent`, `:98` `CommitRequest` |
| `DurableStore` | [subsystems/durable-state.md](subsystems/durable-state.md) | `packages/events/src/types.ts:131`; `packages/store-sqlite/src/index.ts`; `packages/store-memory/src/index.ts` |
| Append-only enforcement | [subsystems/durable-state.md](subsystems/durable-state.md) | `packages/store-sqlite/src/schema.ts` migration 2 (triggers) |
| `Projection` / `ProjectionRunner` | [how-to/add-a-projection.md](how-to/add-a-projection.md) | `packages/projections/src/types.ts:18`; `packages/projections/src/runner.ts:27` |
| Outbox / `OutboxDispatcher` | [subsystems/durable-state.md](subsystems/durable-state.md) | `packages/events/src/dispatcher.ts:32` |
| `Continuation` | [subsystems/continuations-and-commitments.md](subsystems/continuations-and-commitments.md) | `packages/continuations/src/types.ts:7,30`; `src/continuations.ts:33` `ContinuationService` |
| External commitment | [subsystems/continuations-and-commitments.md](subsystems/continuations-and-commitments.md) | `packages/continuations/src/types.ts:76` `CommitmentState`; `src/commitments.ts:39` `CommitmentService` |
| `Artifact` | [subsystems/capabilities-and-cognition.md](subsystems/capabilities-and-cognition.md) | `packages/artifacts/src/index.ts:13,67` `ArtifactService` |
| `Run` / `RunView` | [reference/runtime-service-and-agents.md](reference/runtime-service-and-agents.md) | `packages/runtime-bun/src/fold.ts:33` `foldRun` |
| `RunContext` | [reference/runtime-service-and-agents.md](reference/runtime-service-and-agents.md) | `packages/runtime-api/src/types.ts:32`; implemented at `packages/runtime-bun/src/executor.ts:84` |
| `RuntimeService` | [reference/runtime-service-and-agents.md](reference/runtime-service-and-agents.md) | `packages/runtime-api/src/types.ts:137`; `packages/runtime-bun/src/service.ts:11` `createService` |
| `StateUpdate` / `foldState` | [workflows/shared-state.md](workflows/shared-state.md) | `packages/runtime-api/src/state.ts:16,97,139` |
| `CognitiveIndex` | [cognition.md](cognition.md) | `packages/cognitive-api/src/types.ts` |
| `createRecall` | [cognition.md](cognition.md) | `packages/cognitive-api/src/recall.ts:20` |
| `cognitiveIndexer` | [cognition.md](cognition.md) | `packages/cognitive-api/src/indexer.ts:21` |
| RVF manifest / attached-detached | [rvf.md](rvf.md) | `packages/cognitive-rvf/src/index.ts` `RvfManifest`, `createRvfIndex`, `importSnapshot` |
| `ObservationPort` | [evidence.md](evidence.md) | `packages/realitytrace/src/types.ts`; `src/index.ts:11` `observationIntent`, `:51` `ObservationDelivery` |
| `Readable<T>` / `RunState` | [subsystems/presentation.md](subsystems/presentation.md) | `packages/client/src/index.ts:8,16` |
| `ModelProvider` | [extensions.md](extensions.md) | `packages/capabilities/src/model.ts:69`, `:79` `modelContract` |
| `defineProfile` / `resolveProfile` | [extensions.md](extensions.md) | `packages/profile/src/index.ts:15,53` |

## Capabilities (how they are provided)

| Capability | Provider | Location |
|---|---|---|
| `model.generate` (offline) | `localProvider` | `packages/provider-local/src/index.ts` |
| `model.generate` (OpenAI-compatible) | `openAICompatible` + `modelComponent` | `packages/provider-openai-compatible/src/index.ts` |
| `storage.kv` | harness storage component | `profiles/harness/src/index.ts` |
| `sandbox.exec` | harness sandbox component | `profiles/harness/src/index.ts` |
| `subagent.start` | `spawnSubagent` | `profiles/harness/src/index.ts` |
| `tool.<name>` | `toolComponent` | `profiles/harness/src/index.ts` |
| `billing.quote` | the E2E app | `tests/e2e/app.ts` |
| any frontend capability | `client.provideCapability` / `useCapability` | `packages/client/src/index.ts:416`; `packages/react/src/index.tsx` |

## Workflows

| Workflow | Page | Entry point | Core trace |
|---|---|---|---|
| startup + background loop | [workflows/startup-and-the-background-loop.md](workflows/startup-and-the-background-loop.md) | `packages/cli/src/index.ts:191` `dev`; `packages/runtime-bun/src/runtime.ts:21` `startRuntime` | `tick` at `runtime.ts:78`, `kick` at `:90` |
| run execution (replay) | [workflows/run-execution.md](workflows/run-execution.md) | `packages/runtime-bun/src/service.ts:33` `startRun` | `packages/runtime-bun/src/executor.ts:17` `executeOnce` |
| capability invocation | [workflows/capability-invocation.md](workflows/capability-invocation.md) | `executor.ts:111` `ctx.invoke`; `service.ts:186` `invoke` | `packages/runtime-bun/src/invoker.ts:55`; `packages/kernel-cordis/src/kernel.ts:33` `resolve` |
| suspension and resume | [workflows/continuation-and-resume.md](workflows/continuation-and-resume.md) | `executor.ts:172` `ctx.waitFor` | `packages/continuations/src/continuations.ts:54,123,251,299` |
| shared state | [workflows/shared-state.md](workflows/shared-state.md) | `service.ts:245` `updateState`; `executor.ts:227` `ctx.state` | `packages/runtime-api/src/state.ts:139` `foldState`; `fold.ts:13` `runStateStream` |
| observations and evidence | [workflows/evidence-and-observation.md](workflows/evidence-and-observation.md) | `packages/realitytrace/src/index.ts:11` `observationIntent` | `src/index.ts:51` `ObservationDelivery`; `src/sxr-cli.ts` `createSxrCliPort` |
| client session and reconnect | [workflows/client-and-ui-session.md](workflows/client-and-ui-session.md) | `packages/client/src/index.ts:472` `createClient` | `Engine.loop` at `:335`; `RunStore.apply` at `:174` |

## Subsystems

| Subsystem | Page | Packages |
|---|---|---|
| kernel | [subsystems/kernel.md](subsystems/kernel.md) | `kernel-api`, `kernel-cordis` |
| durable state | [subsystems/durable-state.md](subsystems/durable-state.md) | `events`, `store-sqlite`, `store-memory`, `projections` |
| runtime | [subsystems/runtime.md](subsystems/runtime.md) | `runtime-api`, `runtime-bun` |
| continuations and commitments | [subsystems/continuations-and-commitments.md](subsystems/continuations-and-commitments.md) | `continuations` |
| capabilities, cognition, adapters | [subsystems/capabilities-and-cognition.md](subsystems/capabilities-and-cognition.md) | `capabilities`, `cognitive-api`, `cognitive-memory`, `cognitive-ruvector`, `cognitive-rvf`, `artifacts`, `provider-local`, `provider-openai-compatible`, `domainforge`, `realitytrace` |
| wire and protocols | [subsystems/wire-and-protocols.md](subsystems/wire-and-protocols.md) | `proto`, `protocol-connect`, `protocol-connect-bun`, `ag-ui`, `mcp`, `a2a` |
| presentation | [subsystems/presentation.md](subsystems/presentation.md) | `client`, `react`, `ui-astryx` |
| application composition | [subsystems/application-composition.md](subsystems/application-composition.md) | `profile`, `profiles/copilot`, `profiles/harness`, `cli`, `templates/starter` |

## Plane pages (cross-cutting concerns)

| Page | Covers | Owned by |
|---|---|---|
| [concepts.md](concepts.md) | vocabulary: contexts, scopes, capabilities, components, effects, events, projections, continuations, runs | this page |
| [semantics.md](semantics.md) | `.sea` + DomainForge, `SemanticRef`, the mapping table, DEBT-001..003 | `packages/domainforge` |
| [cognition.md](cognition.md) | `CognitiveIndex`, the recall pipeline, implementations, adaptive ranking, why not SONA | `packages/cognitive-*`, `packages/capabilities` |
| [rvf.md](rvf.md) | snapshots, branching, attached/detached, the DEBT-006 mitigations | `packages/cognitive-rvf` |
| [evidence.md](evidence.md) | `ObservationPort`, normal vs strict mode, the SXR CLI workflow, correlation round-trip | `packages/realitytrace` |
| [ui.md](ui.md) | client, React, Astryx, the E2E note | `packages/client`, `react`, `ui-astryx` |
| [protocols.md](protocols.md) | protobuf, Connect, AG-UI, MCP, A2A | the wire packages |
| [security.md](security.md) | default deny, invocation-time authorization, tenant isolation, retrieval authorization, secrets, erasure, protocol limits, known gaps | the whole system |
| [extensions.md](extensions.md) | capabilities, model providers, adapters, profiles, the copilot and harness contracts | `packages/profile`, the providers |
| [architecture.md](architecture.md) | planes, package topology, dependency rules, the package table | the workspace |

## The full internal dependency graph

Computed from every `package.json`; acyclic; no forbidden edge present. This is the complete
version of the "by example" table in [architecture.md](architecture.md).

```text
@cognate/kernel-api                     → (none)
@cognate/proto                           → (none)
@cognate/events                          → kernel-api
@cognate/domainforge                     → kernel-api
@cognate/profile                         → kernel-api
@cognate/store-memory                    → events
@cognate/store-sqlite                    → events
@cognate/projections                     → events
@cognate/continuations                   → events, kernel-api
@cognate/artifacts                       → events, kernel-api
@cognate/capabilities                    → events, kernel-api, projections
@cognate/cognitive-api                   → events, kernel-api, projections
@cognate/realitytrace                    → events, kernel-api
@cognate/runtime-api                     → events, kernel-api
@cognate/cognitive-memory                → cognitive-api
@cognate/cognitive-ruvector              → cognitive-api
@cognate/cognitive-rvf                   → cognitive-api, events
@cognate/kernel-cordis                   → kernel-api
@cognate/provider-local                  → capabilities, events, kernel-api
@cognate/provider-openai-compatible      → capabilities, events, kernel-api
@cognate/client                          → events, runtime-api
@cognate/ag-ui                           → client, events, runtime-api
@cognate/mcp                             → events, runtime-api
@cognate/a2a                             → events, runtime-api
@cognate/react                           → client, events, runtime-api
@cognate/ui-astryx                       → client, events, react, runtime-api
@cognate/protocol-connect                → events, kernel-api, proto, runtime-api
@cognate/protocol-connect-bun            → protocol-connect, runtime-api
@cognate/runtime-bun                     → artifacts, capabilities, cognitive-api, continuations,
                                          events, kernel-api, kernel-cordis, projections,
                                          runtime-api, store-memory, store-sqlite
@cognate/profile-copilot                 → ag-ui, capabilities, client, events, kernel-api, profile,
                                          protocol-connect-bun, provider-openai-compatible,
                                          react, runtime-api, runtime-bun, ui-astryx
@cognate/profile-harness                 → capabilities, events, kernel-api, profile,
                                          provider-openai-compatible, runtime-api, runtime-bun
@cognate/cli                             → client, domainforge, profile-copilot, profile-harness,
                                          protocol-connect, protocol-connect-bun, provider-local,
                                          react, runtime-api, ui-astryx
```

Enforced by `tests/architecture/dependencies.test.ts`; the acyclicity and forbidden-edge checks run
against the manifests *and* the actual imports (`tests/architecture/graph.ts`).

## Tests that establish contracts

| Area | Test |
|---|---|
| kernel contract (six suites) | `packages/kernel-cordis/test/{contract,lifecycle,effects,dependencies,scopes,authority}.test.ts` |
| store conformance | `packages/store-sqlite/test/conformance.test.ts`, `packages/store-memory/test/conformance.test.ts` |
| runs index | `packages/store-sqlite/test/runs-index.test.ts` (`EXPLAIN QUERY PLAN`) |
| projections | `packages/projections/test/projections.test.ts` |
| continuations, commitments | `packages/continuations/test/{lifecycle,commitments}.test.ts` |
| selection, feedback, ranker | `packages/capabilities/test/{selection,feedback,adaptive-ranker}.test.ts` |
| cognition (retrieval, indexer, fallback, conformance, reopen, rvf) | `packages/cognitive-*/test/*.ts` |
| service, events, artifacts | `packages/runtime-bun/test/service.ts`, `packages/events/test/*.ts`, `packages/artifacts/test/artifacts.test.ts` |
| client, React, Astryx | `packages/{client,react,ui-astryx}/test/*` |
| protocols | `packages/protocol-connect/test/service.test.ts`, `protocol-connect-bun/test/limits.test.ts`, `ag-ui/test/{outbound,inbound,reconnect}.test.ts`, `mcp/test/mcp.test.ts`, `a2a/test/a2a.test.ts` |
| semantics | `packages/domainforge/test/{adapter,identity,diagnostics}.test.ts` |
| evidence | `packages/realitytrace/test/{port,sxr-cli}.test.ts` |
| profiles | `profiles/copilot/test/copilot.test.tsx`, `profiles/harness/test/harness.test.ts` |
| CLI | `tests/integration/cli-create.test.ts` |
| architecture | `tests/architecture/*.test.ts` |
| properties | `tests/properties/{kernel,replay,containment}.property.test.ts` |
| integration | `tests/integration/{append-only,causality,cognitive-rebuild,continuation-restart,crash,erasure,failure-isolation,rebuild,second-process,secrets,semantic-to-observation,shared-state}.test.ts` |
| E2E | `tests/e2e/journey.e2e.ts` + `verify.ts` |
| examples | `tests/examples.test.ts` |
| documentation | `tests/architecture/docs.test.ts` |

## Upstream dependency fixtures

`compatibility/phase0/{cordis,domainforge,ruvector,rvf,sona,ag-ui,connect,mcp,realitytrace,ui}/`
plus `compatibility/phase0/sqlite.test.ts` — each characterizes one named dependency behavior
under Bun before the framework relies on it.

## Related

- [documentation-map.md](documentation-map.md) — which page owns which concept.
- [architecture.md](architecture.md) — the plane model and the rules.
- [reference/capability-and-architecture-contracts.md](reference/capability-and-architecture-contracts.md)
  — the guards.
