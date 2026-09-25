# Mental model

This page explains what the system is *doing* and how its parts relate, without implementation
detail. For the package graph and dependency rules, read [architecture.md](architecture.md). For
vocabulary, read [concepts.md](concepts.md). For the code that establishes each claim, read the
*Source trail* at the bottom.

## The problem it solves

An agent application is usually assembled vertically: one framework owns the agent loop, another
owns the UI, state lives somewhere else, memory becomes a vector database, approval gets its own
abstraction, and each protocol adds another representation of the same business operation. The
glue becomes the architecture, and the glue is the part nobody can change safely.

Cognate inverts that. It starts from the application's **durable history** and derives everything
else. One business operation — say `ApproveRefund` — becomes a model tool call, an approval card,
an AG-UI state transition, a Connect RPC, an audit trail, and a retrievable prior episode. These
are not seven integrations; they are seven projections of the same semantic operation, all fed by
the same events.

## Four ideas carry the design

### 1. Events are truth; everything else is a fold

The store holds an append-only log of events. A run's status, the UI's view, an audit report, and
the cognitive index are all computed by reading that log. Deleting any of them loses nothing,
because they can be rebuilt by replaying from position 0.

This is why erasure works: the store keeps a deleted event's *envelope* (ids, timing, causation)
and removes only its *payload*. Every view derived from that event loses the content, because the
content only ever lived in the payload.

The consequence a newcomer must accept: **you cannot ask the database a question directly.** You
append an event, and you read a projection. State that feels like a cache is actually a
deliberate, rebuildable copy.

### 2. A component is a declaration; a fiber is the running thing

Code declares a `Component`: an id, what it `requires`, what it `provides`, and an `activate`
function. Mounting one creates a **fiber** — a live instance with its own context, dependencies,
and effects. Two mounts of the same component in two scopes are two fibers sharing no state
(requirement `CG-KRN-009`).

Effects registered during `activate` (a listener, a tool, a timer, a provider publication) are
*owned* by that fiber. Unloading it unwinds them in reverse order. Lifecycle ownership is part of
the runtime, not a cleanup convention you have to remember.

### 3. Capabilities are contracts; eligibility is separate from authority

A consumer declares a `Requirement`. A provider publishes a `CapabilityContract` (id, semver
version, attributes). `isCompatible` decides eligibility deterministically: same id, same major
version with minor/patch at least as high, and every required attribute equal.

Two things that are easy to conflate, and are deliberately not:

- **Eligibility** — deterministic compatibility. No learning involved.
- **Authorization** — the `Policy` consulted at *invocation* time, default-deny.

`kernel.resolve` performs eligibility and grants no authority. A learned ranker may reorder
candidates *within* the eligible set, and can never widen it. The runtime's own
`RuntimeService` adds a third, separate check (the `ActionPolicy` over `run.start`, `run.cancel`,
`continuation.resume`, `continuation.cancel`, `run.state.update`).

### 4. Unfinished work is a first-class, durable object

When an agent cannot proceed, it does not hold a promise in memory. It calls
`ctx.waitFor("approve", { type: "refund-approval", condition: { kind: "human_approval" }, … })`.
A **continuation** is persisted with its condition, its payload, and the id and version of the
handler that can resume it. The process can stop; the browser can close; the run resumes from
durable state when the condition is satisfied.

Human approval is a specialization of this, not a separate feature. So are tool results, OAuth
flows, scheduled events, and "wait until a capability exists".

## The five planes

Full table with package assignments in [architecture.md](architecture.md).

```text
  .sea  →  semantics            what the application means
            ↓
        execution              what is alive; what may act
            ↓
  events (SQLite)  →  durable  what happened
            ├──→ cognition      what is relevant now   (derived, rebuildable)
            ├──→ evidence       what an outside observer recorded (optional)
            └──→ projections    what each surface shows
```

(The plane table, the package assignments, and the dependency rules are in
[architecture.md](architecture.md); this is the conceptual reading of them.)

Each plane is replaceable from the one above it:

- Delete the cognitive index → the application is still correct; `rebuildCognition()` restores it.
- Delete the AG-UI adapter → native execution and the React UI still work.
- Replace Connect → the `RuntimeService` contract is unchanged (`CG-WIR-003`).
- Replace Cordis → implement `KernelFactory`; no application type changes.

## How a run actually behaves

A **run** is the durable execution of one agent. It is not a coroutine and not a request handler.

Every execution re-reads the run's event stream and re-enters the agent from the top. Each call
the agent makes through `RunContext` is keyed by a deterministic step id (`invoke:1`, `wait:approve`,
`state:cart`); if a recorded result already exists, the runtime returns it instead of repeating
the work. If the agent suspends, restarts, or is retried, it re-runs the same code path over the
same recorded facts.

The practical rule for agent authors: **be deterministic given the recorded results.** Anything
nondeterministic (a clock, a random number, a model response) must go through `ctx.step` or
`ctx.invoke`, which record it. A bare `Date.now()` inside a run breaks replay.

## What is authoritative, and what is not

[subsystems/durable-state.md](subsystems/durable-state.md) is where this is implemented; the point
of the split is erasure, which becomes a single payload delete instead of a search for every copy.

| Authoritative | Derived, rebuildable |
|---|---|
| `events` (envelope + payload, until erasure) | `RunView` / `RunState` (folds over the run stream) |
| `records` (`runs`, `continuations`, `artifacts`, `commitments`, `rvf_snapshots`, `observations`) | `projection_checkpoints` / `projection_state` |
| `blobs` (content-addressed artifact bytes) | the cognitive index (RuVector / in-memory / RVF) |
| `.sea` source digests, via `SemanticRef` | every UI surface, AG-UI stream, and audit view |
| | `runs` ordering (`listRuns` reads the `run.started` position) |

## Where authority can be *created*

Only one path can make something true or permitted:

```text
Caller (authenticated at the transport)
  → RuntimeService (ActionPolicy)
    → RunContext.invoke / service.invoke
      → kernel.resolve (deterministic eligibility)
        → Policy.authorize (default deny)  ← the authority decision
          → provider handler
            → durable event, or an external commitment
```

Everything off that path is a read, a projection, or a ranking decision that is already inside an
eligible and authorized set.

## Three kinds of change

[concepts.md](concepts.md#reversible-effects-durable-facts-external-commitments) is the canonical
definition; in brief, the framework refuses to blur these three (spec §9):

- **Reversible effects** — registrations and local resources a fiber owns; undone on unload.
- **Durable facts** — events. Appended, never silently removed.
- **External commitments** — irreversible work outside the framework
  (`INTENT → PREPARE → COMMIT → OBSERVE`, with idempotency keys, attempt counts, and an explicit
  `UNKNOWN_RECONCILIATION_REQUIRED` state for a timeout that is not proof of failure).

An external action is never disguised as a local disposer, and a durable fact is never registered
as a reversible effect.

## Where this could go wrong

- **Forgetting that a run replays.** The single most common surprise. See
  [workflows/run-execution.md](workflows/run-execution.md).
- **Treating a `ContinuationService` used directly as authorized.** The service enforces
  `ActionPolicy`; the continuation layer inside a runtime is constructed with an always-allow
  policy because it is only reachable through that service. Standalone use bypasses the check.
- **Assuming resolution authorizes.** It only finds an eligible provider. See
  [security.md](security.md).
- **Expecting a transactional model.** There is no rollback of committed events. Corrections are
  later events (`CG-EVT-007`); the store's triggers reject `UPDATE`/`DELETE` on the events table
  so even raw SQL cannot bypass that.

## Source trail

- [spec §2, §3, §7, §8, §9, §10, §11, §12, §32](../.agents/specs/software-design-spec-cognate.-frameworkmd)
  — the normative statement of every claim above.
- [architecture.md](architecture.md) — plane table, package topology, dependency rules.
- [concepts.md](concepts.md) — the vocabulary in full.
- `packages/kernel-api/src/types.ts` — `Component`, `Scope`, `FiberContext`, `Policy`,
  `SemanticRef`.
- `packages/kernel-api/src/compat.ts` — `isCompatible`, the eligibility rule.
- `packages/kernel-api/src/policy.ts` — `denyAll` as the default.
- `packages/runtime-api/src/types.ts` — `RunContext`, `AgentDefinition`, `RuntimeService`.
- `packages/runtime-bun/src/executor.ts` — replay-based execution.
- `packages/runtime-bun/src/fold.ts` — `RunView` as a fold; the two state streams.
- `packages/store-sqlite/src/schema.ts` — append-only triggers, the runs indexes.
- `packages/continuations/src/types.ts` — continuation lifecycle and commitment states.
- `tests/properties/` — reversibility, dependency closure, scope isolation, replay determinism,
  cognitive non-authority, adaptive containment.
