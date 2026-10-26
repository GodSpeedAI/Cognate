# What you can build with Cognate

This page holds the use-case survey that used to sit in the root README. The root README now starts with the agent-built loop; this page explains the shapes an application can take.



### Agent-native applications

Agents can read application state, invoke capabilities, produce artifacts, suspend for input, resume later, collaborate with other agents, and participate in the same lifecycle as every other component.

### Generative interfaces

Project agent and application behavior into interactive UI rather than reducing every interaction to text.

The design targets:

* streamed responses;
* tool rendering;
* shared application state;
* interactive artifacts;
* human approval;
* forms and structured input;
* agent-generated surfaces;
* long-running work;
* resumable sessions.

### Autonomous agent harnesses

Models, tools, skills, storage, sandboxes, schedulers, agent loops, subagents, and other services can be composed as capabilities.

Providers can appear, disappear, or be replaced at runtime.

Consumers depend on capabilities, not implementations.

### Stateful workflows and cases

Cognate continuations make unfinished work explicit.

An execution can pause because it is waiting for:

* a human;
* a tool;
* another agent;
* an OAuth flow;
* an external job;
* a capability;
* a scheduled event;
* additional information.

When the condition is satisfied, execution resumes from durable state.

### Cognitive applications

Cognate applications can recall relevant:

* domain objects;
* previous cases;
* artifacts;
* agent runs;
* decisions;
* tool outcomes;
* framework run records and accepted RealityTrace observation references;
* related capabilities;
* prior solutions.

RuVector provides the reference cognitive implementation.

RVF provides portable and branchable cognition through the `@godspeedai/cognate-cognitive-rvf` adapter, with Cognate-owned integrity manifests because RVF 0.3.4 does not verify files on open ([ADR-0006](../decisions/ADR-0006-portable-cognition-rvf.md)).

### Governed systems

Cognate preserves the semantic identity and causal provenance needed for external governance.

Because Cognate applications are grounded in `.sea`, existing SEA-Forge governance can operate over their semantics without becoming a Cognate dependency.

The RealityTrace adapter submits observations through RealityTrace's CLI and leaves evidence derivation and settlement to RealityTrace. Each observation carries Cognate's correlation ids in the committed record's CEP `extensions.cognate` field, and the adapter reads them back by ledger position (`AK-006`).

---

