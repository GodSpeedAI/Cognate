# Comparisons and lineage

How Cognate relates to other kinds of software that people sometimes compare it with, and the open-source work it builds on. Other frameworks also support agent-built applications; the question is which layer each one owns.

## Cognate vs. an Agent Framework

Cognate can run agents, but **the agent is not the architecture**.

Agents are components operating inside a larger semantic application.

That distinction becomes important as soon as software contains:

* people;
* agents;
* deterministic services;
* persistent state;
* UI;
* policy;
* external systems;
* long-running work;
* multiple representations of the same business object.

Cognate gives all of them somewhere coherent to live.

---

## Cognate vs. a Frontend Agent SDK

The target architecture includes a frontend stack, but **the UI is not the architecture**.

React, Astryx, AG-UI, Slack, a mobile application, and a CLI can all be different surfaces over the same running application.

The application survives the surface.

---

## Cognate vs. a Memory Framework

The target architecture includes cognitive memory, but **memory is not truth**.

RuVector makes prior experience discoverable.

SQLite preserves durable framework history.

RealityTrace preserves execution evidence.

DomainForge preserves connection to semantics.

Each has a different job.

---

## Cognate vs. a Workflow Engine

Cognate can model long-running, interruptible workflows, but **workflow is only one form of execution**.

A deterministic service, an agent, a UI component, a human decision, and a scheduled process all participate in the same capability and event model.

---


## Architecture Lineage

Cognate stands on ideas developed across several open-source systems.

**Cordis and DeepSeek Harness** demonstrate runtime composition based on scoped capabilities, reactive dependencies, lifecycle-owned effects, and replaceable services.

**CopilotKit and AG-UI** demonstrate rich agent/user interaction through shared state, frontend capabilities, generative UI, human interaction, and protocol-level interoperability.

**DomainForge and `.sea`** provide Cognate's semantic grounding and projection model.

**RealityTrace** provides the execution-evidence boundary.

**RuVector** provides the reference cognitive implementation.

**RVF** provides portable and branchable cognitive state.

Cognate brings those concerns into one architecture without collapsing them into one implementation.

---

