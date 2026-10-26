# Cognitive representations & interactive explainers

Cognate provides interactive, visual, and executable models of its runtime architecture and mechanisms.
These explainers are self-contained, offline-capable single-page applications located in this directory.

## Interactive HTML explainers

| Explainer | Core question answered | Media & Affordances | Implementation Evidence |
|---|---|---|---|
| [index.html](index.html) | How do all Cognate concepts, journeys, and explainers fit together? | Central portal with cognitive matrix and direct journey routing | All packages |
| [run-execution-replay.html](run-execution-replay.html) | How does a run re-enter from line 1, memoize step IDs, and recover from crashes without duplicating external side effects? | Synchronized step-by-step simulator, code pointer, memoization cache (`recorded: Map<stepId, StoredEvent[]>`), event stream, continuation approval, and CAS write collision simulation | `packages/runtime-bun/src/executor.ts` |
| [architecture-and-invariants.html](architecture-and-invariants.html) | How do the 6 planes and 45 packages strictly separate the Authority Path from the Projection Path? | Interactive 6-plane topology, package dependency inspector with forbidden edge enforcement, and interactive Invariant Lab (ranker authorization test, disaster rebuild test, store engine swap) | `packages/kernel-api`, `packages/events` |
| [concurrency-and-leases.html](concurrency-and-leases.html) | How does Cognate enforce bounded concurrency (`maxConcurrentRuns`), resource keys serialization, and PostgreSQL multi-worker write fencing? | Concurrency sandbox with disjoint resource key scheduling, outbox `FOR UPDATE SKIP LOCKED` lease table, and two-worker split-brain fencing simulator | `packages/runtime-bun`, `packages/store-postgres` |

## Governing cognitive principles

1. **Representation is an engineering discipline (Bret Victor):** Good representations make previously difficult thinking easier. The form in which an idea is represented determines which cognitive capabilities can be brought to bear on understanding it.
2. **Recognition over recall:** Essential system invariants, stream versions, and step caches are visible on-screen simultaneously rather than reconstructed from memory.
3. **Visible causality over unexplained sequence:** When a continuation suspends, the simulator visibly shows the `Halt` sentinel escaping `agent.run`, the in-memory process terminating, and the later replay satisfying prior steps from cache.
4. **Idempotence and zero external runtime dependencies:** Every HTML explainer in this directory is 100% self-contained and offline-capable, requiring no CDN, no local web server, and no build pipeline.

## Related canonical documentation

- [../README.md](../README.md) — Intent-based documentation entry point.
- [../mental-model.md](../mental-model.md) — Conceptual structure and four core ideas.
- [../architecture.md](../architecture.md) — Six planes, dependency rules, and package topology.
- [../workflows/run-execution.md](../workflows/run-execution.md) — Canonical trace of run execution.
- [../runtime-concurrency.md](../runtime-concurrency.md) — Bounded native execution and resource key semantics.
- [../contracts/fenced-outbox-leases.md](../contracts/fenced-outbox-leases.md) — Native outbox delivery lease specification.
- [../contracts/run-write-ownership.md](../contracts/run-write-ownership.md) — Multi-process store ownership and write fencing contract.
