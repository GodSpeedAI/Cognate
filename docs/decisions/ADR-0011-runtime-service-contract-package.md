# ADR-0011 — `@godspeedai/runtime-api`: a transport-independent runtime service contract

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
**Status:** Accepted (2026-09-24)

## Context
Spec §22 requires a framework service interface isolated from the RPC adapter so Connect can be replaced (§40.G), and §37 Phase 4 requires a second process to observe and control a runtime. The §27 package layout names `runtime-bun`, `protocol-connect`, `protocol-connect-bun`, and `client`, but no package owns the service interface that all of them share. Putting it in `runtime-bun` would force the client and protocol adapters to depend on the Bun runtime; putting it in `proto` would make wire schema define semantics (§3.7).

## Decision
Add `packages/runtime-api` with no runtime dependencies beyond framework contracts (`kernel-api`, `events`). It owns: `RuntimeService` (operations, request/response shapes, typed `ServiceError` codes), the agent authoring surface (`AgentDefinition`, `RunContext`), and a service conformance kit. `runtime-bun` implements it in-process; `protocol-connect` maps it to generated protobuf; `client` consumes it through any transport.

Durable run semantics: runs are event-sourced on stream `run-<id>`. `RunContext.step/emit/invoke/artifact` record results as events keyed by a deterministic step id, and re-entry replays them. `waitFor` opens a durable continuation and suspends; resolution re-enters the agent. No closure or in-memory fiber survives a restart (§12).

## Consequences
- One extra package beyond §27's initial layout; dependency rules: `runtime-api → kernel-api, events` only.
- Agent code must be deterministic given recorded step results (§11 nondeterministic inputs recorded as facts).
- The same conformance kit runs in-process and over Connect, which is how CG-WIR-003 is proven.
