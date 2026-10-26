# Design principles

The principles behind Cognate's structure. Each one is a constraint the code enforces or a test checks. The root README links here for the reasoning; the mechanisms are on [under the hood](under-the-hood.md).

## Why Cognate starts one level lower

Most agent applications are assembled vertically.

An agent framework owns one part. A frontend SDK owns another. State lives somewhere else. Memory becomes a vector database. Human approval gets its own abstraction. Observability is added after the fact. Each protocol introduces another representation of the same application.

Eventually the glue becomes the architecture.

Cognate starts one level lower.

The application has **semantics**. Everything else is a representation of those semantics.

Cognate provides the execution substrate that lets those representations live together without collapsing them into one framework.

**Semantics constrain execution.
Events preserve truth.
Cognition discovers relevance.
Observations record execution.
Representations remain replaceable.**

---


## One Application, Many Representations

Consider a business operation called `ApproveRefund`.

It may appear to a model as a tool.

It may appear to a user as an approval card.

It may appear over AG-UI as a tool call and state transition.

It may appear over Connect as a protobuf RPC.

It may appear in an audit system as a sequence of events.

It may appear in RuVector as a retrievable prior episode.

It may be correlated with a RealityTrace observation that later participates in evidence derivation.

These are not seven unrelated integrations.

They are projections of one semantic operation.

```text
                    ApproveRefund
                         │
            ┌────────────┼─────────────┐
            │            │             │
            ▼            ▼             ▼
          Agent          UI          Connect
           Tool       Projection       RPC
            │            │             │
            └────────────┼─────────────┘
                         │
                         ▼
                      Events
                    /        \
                   ▼          ▼
             RealityTrace   RuVector
             Observation   Cognition
```

That is the central idea behind Cognate.

---


## Semantics First

Cognate is grounded in `.sea`.

`.sea` describes domain semantics. DomainForge projects those semantics into representations Cognate can consume.

Cognate does **not** extend `.sea` with framework-specific syntax.

There is no:

```text
react_component
grpc_service
copilot_tool
ruvector_memory
```

in the language simply because a framework integration needs it.

Integrations are projections.

```text
                    .sea
                     │
                DomainForge
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Cognate      Tests       Other
       Runtime    Projection  Projections
```

New integrations should require new adapters, not new semantics.

The `.sea` grammar changes only when the domain itself gains a genuinely new semantic concept.

---

## Everything Is a Capability

Models are capabilities.

Tools are capabilities.

Storage is a capability.

A browser is a capability.

A renderer is a capability.

An agent loop is a capability.

A human can provide a capability.

A remote service can provide a capability.

Components declare what they **require** and what they **provide**.

Cognate resolves the rest.

```text
Component A
    provides: customer.read

Component B
    requires: customer.read
    provides: case.resolve
```

When `customer.read` becomes available, B can activate.

If its provider disappears, B deactivates.

If a compatible replacement appears, B can activate against the new provider.

Consumers depend on capability contracts rather than concrete implementations.

---

## Components Are Alive

A component definition is not the running component.

Each live instance is represented by a **fiber** with its own:

* context;
* scope;
* dependencies;
* effects;
* lifecycle;
* identity.

```text
DECLARED
   │
   ▼
WAITING
   │ dependencies satisfied
   ▼
ACTIVATING
   │
   ▼
ACTIVE
   │ dependency lost / unload
   ▼
DEACTIVATING
   │
   ▼
DISPOSED
```

Cognate's reference composition engine is Cordis, hidden behind Cognate's own kernel contracts.

Applications never need to depend on Cordis directly.

---

## Effects Undo Themselves

Runtime changes belong to their component.

Register an event listener, tool, capability, timer, renderer, subscription, or hook and the registration is owned by the fiber that created it.

When that fiber unloads, its reversible effects unwind automatically.

```text
mount component
     │
     ├── register tool
     ├── register listener
     ├── register renderer
     └── start timer

unmount component
     │
     ├── stop timer
     ├── remove renderer
     ├── remove listener
     └── remove tool
```

Lifecycle ownership is part of the runtime rather than cleanup convention.

---

## Not Everything Is Reversible

Cognate distinguishes three kinds of change.

### Reversible effects

Runtime registrations and local resources that can be cleanly removed.

### Durable facts

Things that happened and belong in history.

A user approved a request.

A tool returned a result.

A case changed state.

An agent completed a run.

These become append-only events.

### External commitments

Actions that cross a system boundary.

An email was sent.

A payment was charged.

A remote record changed.

Cognate treats these as explicit commitments with support for idempotency, durable intent, result recording, and compensation where available.

An external action is never disguised as a local disposer.

---

## Events Are Truth

Cognate's durable application history is an append-only event log.

The default implementation uses `bun:sqlite`.

Events preserve causal identity:

```text
correlation
    │
    ▼
   run
    │
    ▼
  event
    │
    ▼
causation
    │
    ├── component
    ├── fiber
    ├── capability
    ├── provider
    ├── semantic reference
    └── artifact
```

Current state is a projection.

Agent history is a projection.

UI state is a projection.

Analytics are a projection.

Cognitive indexes are projections.

If derived state disappears, Cognate can rebuild it from authoritative history.

---

## Cognition Is Not Truth

Cognate's design includes a first-class cognitive layer because agent-native applications need to answer a different question from ordinary storage:

> Given what is happening now, what prior knowledge, relationships, experiences, artifacts, and capabilities are relevant?

The public abstraction is `CognitiveIndex`.

RuVector is the reference implementation.

Cognate uses it for:

* semantic retrieval;
* vector similarity;
* graph relationships;
* temporal retrieval;
* causal retrieval;
* episodic memory;
* relevant artifact discovery;
* prior-run retrieval;
* provider ranking;
* learned routing.

But cognition is derived.

```text
AUTHORITATIVE

.sea / DomainForge
       +
Event Store
       +
Artifacts
       +
RealityTrace refs
       │
       ▼
    Indexers
       │
       ▼
    RuVector

DERIVED
```

Delete the cognitive index and the application remains correct.

Rebuild it and cognition returns.

That is an intentional invariant.

---

## Learning Cannot Grant Authority

Cognate can learn which eligible option tends to work best.

It cannot learn that an ineligible option is suddenly allowed.

```text
all providers
      │
      ▼
semantic constraints
      │
      ▼
security + policy
      │
      ▼
compatible candidates
      │
      ▼
RuVector / adaptive ranking
      │
      ▼
selection
```

Adaptive ranking happens **after** deterministic eligibility.

Use learning to optimize execution.

Never use it to manufacture authority.

---


## The Design Rule

When adding a feature to Cognate, ask:

> Does this require a genuinely new semantic/runtime primitive, or is it another projection or composition of primitives we already have?

If it is another representation, build an adapter.

If it is another bundle of capabilities, build a profile.

If it is another provider, implement the existing capability.

Only enlarge the kernel when the existing model cannot express the new behavior without violating its invariants.

That rule keeps Cognate small even as the ecosystem around it grows.

---


## Philosophy

Software increasingly contains actors that do more than execute predefined procedures.

Agents interpret.

People intervene.

Providers change.

Context evolves.

Work pauses and resumes.

Interfaces are generated dynamically.

Prior experience affects future behavior.

External actions have consequences.

The architecture has to remain understandable while all of that is happening.

Cognate's answer is to keep the layers distinct and connect them through semantics.

```text
SEMANTICS
   │
   ▼
EXECUTION
   │
   ▼
EVENTS
   │
   ├────────► EVIDENCE
   │
   ▼
COGNITION
   │
   ▼
PROJECTIONS
```

**Define meaning once. Project it everywhere.**

---

