# Concepts

The vocabulary below is framework-owned (spec §8–§12): no engine type (Cordis, RuVector, Astryx, ...) is exposed through it. All of it is implemented and proven by [`@godspeedai/cognate-kernel-api`](../packages/kernel-api/README.md)'s conformance kit unless noted otherwise.

This page is the canonical owner of the vocabulary. For the conceptual structure these terms
compose into, read [mental-model.md](mental-model.md); for the architecture they sit in, read
[architecture.md](architecture.md); for what happens when one of them is used at runtime, read the
matching page in [workflows/](workflows/).

## Contexts and scopes

A `Context` carries an authenticated principal and a tenant/workspace scope, kept separate from capability visibility (spec §32, [security.md](security.md)). A `Scope` is the unit of capability visibility and lifecycle: a provider is visible in its scope and descendants only, and closing a parent scope closes child scopes before parent effects (spec §8.5). Scope isolation and narrowing are proven properties — a child scope can restrict but never gain authority by inheriting or discovering a capability.

## Capabilities: eligibility vs. selection

A `CapabilityContract` is what a provider publishes: an id, a semver version, optional attributes, and an optional `SemanticRef`. A `Requirement` is what a consumer asks for. `isCompatible(requirement, contract)` decides deterministic **eligibility** — same capability id, same major version with minor/patch at least as high as required, and every required attribute equal ([`packages/kernel-api/src/compat.ts`](../packages/kernel-api/src/compat.ts)).

Eligibility is separate from **selection**. [`@godspeedai/cognate-capabilities`](../packages/capabilities/README.md) runs two phases (spec §3.6, §8.2, §17, §30): every `EligibilityRule` filters every candidate first, and every `(provider, rule)` result is recorded. Only the eligible set is exposed to an adaptive `Ranker`, which can narrow but never widen it. A ranker entry that is unknown, ineligible, duplicated, or non-finite is dropped; a missing or throwing ranker falls back to deterministic `providerId` order. This is the "adaptive containment" property (`CG-CAP-002`): cognition can rank among eligible options, never grant authority (see [cognition.md](cognition.md)).

Resolution (`kernel.resolve`) never consults policy and grants no authority by itself. Every invocation is checked against policy, and denial is the default (`denyAll`, spec §32).

## Components, fibers, and lifecycle

A `Component` declares a stable identity, requirements, provided capability contracts, and an `activate` function. `kernel.mount(component, scope)` returns a `ComponentHandle` whose state is one of `WAITING`, `ACTIVATING`, `ACTIVE`, `FAILED`, or `DISPOSED`. Missing dependencies keep it `WAITING`; only after activation and effect registration succeed does it expose an active **fiber**.

Activation is all-or-nothing: a failed attempt disposes that attempt's registered effects, in reverse order, and publishes nothing. Retries are bounded (`retry.maxAttempts`); an activation that never settles fails by `ActivationTimeoutError` instead of hanging. Dependency loss deactivates a component; a compatible replacement reactivates it. Disposal is idempotent, runs every disposer in reverse registration order, and reports aggregated cleanup errors as a `CleanupError`. A concurrent dispose wins over an unfinished activation. All of this is pinned by the kernel conformance suites (`CG-KRN-001..008`), run unchanged against [`@godspeedai/cognate-kernel-cordis`](../packages/kernel-cordis/README.md) (the reference engine; [ADR-0001](decisions/ADR-0001-kernel-engine-cordis.md)).

## Reversible effects, durable facts, external commitments

The framework distinguishes three kinds of change (spec §9):

- **Reversible effects** — in-memory or transient state a component owns; `effects.register(disposer)` returns a handle disposed on unload. Not authoritative history.
- **Durable facts** — recorded, replayable events on the append-only event log (spec §10). A durable fact never disappears by disposing a fiber.
- **External commitments** — irreversible side effects outside the framework's control (email sent, payment charged). These follow `INTENT → PREPARE → COMMIT → OBSERVE` and carry idempotency keys, attempt counts, and an explicit state including `UNKNOWN_RECONCILIATION_REQUIRED` for a timeout that is not proof of failure. A durable fact and an external commitment MUST NOT be registered as reversible effects (spec §8.5, §9.3).

## Events

The event stream is the durable backbone (spec §10). A canonical envelope carries `event_id`, `stream_id`, `stream_sequence`, `event_type`, `schema_version`, `occurred_at`, `recorded_at`, `correlation_id`, `causation_id`, `run_id`, `scope_id`, and optional `component_id`/`fiber_id`/`semantic_ref`. Stream appends use an expected-version compare-and-swap; the store assigns `stream_sequence` inside the same transaction. Command idempotency keys make repeating a committed request return its recorded result rather than a new fact. Implemented and proven by `CG-EVT-001..006`; see [`@godspeedai/cognate-events`](../packages/events/src/index.ts) and [`@godspeedai/cognate-store-sqlite`](../packages/store-sqlite/README.md).

## Observations (facts, not actions)

An **observation** is a fact noticed about reality; an **action/run** is something the system was asked to do. They are different semantic claims and enter the log through different doors. Use a run (`AgentDefinition`/`RunContext`) when a caller intends an execution; use `RuntimeService.observe` when a mechanism, provider, or observer is *reporting* something it saw — a file appeared, a port opened, a remote connection dropped — and no action was requested. `observe` appends a run-less `observation.recorded` event (`run_id: null`) with `metadata.source: "observation"`, so provenance says reality was observed, not that a caller edited state (contrast `updateSharedState`'s `source: "caller"`). You cannot fabricate an observation through a run's `emit` (the `observation.` prefix is reserved).

Observation is **not inference**. An observation establishes *that* a fact holds, not *what caused it*. `ObservationAttribution.kind` separates `unattributed` / `correlated` / `caused`; `causationId` is set **only** when the cause is established (`kind: "caused"`), otherwise it stays `null` — an observed fact with unknown causation is represented truthfully, never invented. Resource identity is the pair `(worldId, resource)`: equal resource strings in different execution worlds are distinct facts.

Recording is authorized as `observation.record` and idempotent by key (a replay returns the recorded observation without a second event). This is an in-process, mechanism-layer door — not exposed over the public Connect surface. Distinct from RealityTrace's `Observation` ([`evidence.md`](evidence.md)), which is the *outbound* evidence adapter delivering committed events to an external target; `observe` is the *inbound* door that introduces facts in the first place. Implementation: [`@godspeedai/cognate-runtime-bun`](../packages/runtime-bun/README.md); behavior proven by `packages/runtime-bun/test/observation.test.ts`.

## Projections

A `Projection` derives another representation from events (spec §11) — application state, a model conversation, an AG-UI stream, a cognitive index, and so on. `@godspeedai/cognate-projections`' `ProjectionRunner` applies batches in `position` order, commits derived writes with the checkpoint atomically, and on failure commits the successful prefix and records the error at the failing event rather than skipping it. `rebuild()` replays from position 0; a stored checkpoint version mismatch yields `rebuild_required`. See [`@godspeedai/cognate-projections`](../packages/projections/README.md).

## Continuations

A `Continuation` is valid but unfinished execution: waiting for human approval, a tool result, an external job, or an unavailable capability (spec §12). It persists a continuation ID, originating run/scope, type, satisfaction condition, resumable payload, expiration policy, and status, plus the resume handler/projection version needed to interpret it — never a serialized closure. Its lifecycle is `OPEN → RESUMED | CANCELLED | EXPIRED | FAILED | BLOCKED`. Human-in-the-loop approval is a specialization of this primitive, not a separate kernel concept. See [`@godspeedai/cognate-continuations`](../packages/continuations/README.md).

## Runs and `RunContext` replay

`AgentDefinition`/`RunContext` ([`@godspeedai/cognate-runtime-api`](../packages/runtime-api/README.md), [ADR-0011](decisions/ADR-0011-runtime-service-contract-package.md)) are the durable, replay-safe agent authoring surface. Runs are event-sourced on stream `run-<id>`. `RunContext.step`, `emit`, `invoke`, `artifact`, and `recall` record their results as events keyed by a deterministic step id; re-entry after suspension or a restart replays them instead of recomputing. `waitFor` opens a durable continuation and suspends — no closure or in-memory fiber survives a restart. Nondeterministic inputs (clock, randomness, model output) must be recorded as facts before a deterministic step consumes them (spec §11). Implementation: [`@godspeedai/cognate-runtime-bun`](../packages/runtime-bun/README.md); see [DEBT-011](../.agents/DEBT.md) (single writer process) and [DEBT-015](../.agents/DEBT.md) (serial run execution) for current limits.
