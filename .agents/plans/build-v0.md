# Build plan — Cognate v0 (full build-out)

**Outcome (2026-09-25):** M0–M11 complete. See [current status](../CURRENT_STATUS.md). Deviations recorded in ADR-0011 (runtime-api package), ADR-0001/0002/0006 addenda, and DEBT-001..018.

Owner: acting agent (orchestrator) with delegated subagents. Branch: `build/cognate-v0`.
Normative source: [spec](../specs/software-design-spec-cognate.-frameworkmd). Sequencing parent: [implementation route](implementation.md). This plan is the execution route for building every spec phase (0–10); it does not restate requirements.

## Operating rules for this build

1. **Contracts before behavior.** Every package lands in two commits-worth of work: (a) public types + a conformance/acceptance test suite that fails (RED), (b) an implementation that makes it pass (GREEN). Conformance suites are exported test kits so every adapter (memory, SQLite, Cordis, RuVector…) is proven against the *same* contract.
2. **Ledger first.** `requirements/ledger.yaml` is expanded to project the whole spec before implementation. Every requirement has a `just gate-*` recipe. Unimplemented gates fail via `scripts/unmet-gate.ts`; they never skip.
3. **No silent gaps.** A requirement ends in exactly one state: `implemented` (gate passes, evidence recorded), `blocked` (gate fails for a recorded external reason, with an entry in [`DEBT.md`](../DEBT.md)), or `candidate` (not started). `scripts/check-substrate.ts` enforces that `blocked`/`partial` items cite a debt entry and that `just gates` reports every gate's real exit code.
4. **Phase 0 is real.** Each third-party boundary gets an isolated fixture under `compatibility/phase0/<name>/` with its own pinned `package.json`/lockfile, an evidence record, and a decision record (`docs/decisions/`). Adapters are built only on a passing fixture; failures block the adapter behind its framework-owned interface (spec §37).
5. **Dependency direction is enforced** by `scripts/check-deps.ts` (spec §28) and runs in `just verify`.
6. **Verification-driven.** Orchestrator re-runs every gate a subagent claims; subagent reports are unverified until re-run. Evidence records carry command, exit code, and scope.
7. **Commits** at each verified milestone below (orchestrator only; subagents never commit or run root `bun install`, to avoid lockfile races).

## Delegation model

| Work | Model | Why |
| --- | --- | --- |
| Phase 0 fixtures (one agent per boundary, parallel, isolated dirs) | Sonnet | Unknown third-party APIs; bounded scope |
| Package implementation against an existing contract suite | Sonnet | Multi-file, invariant-preserving |
| Mechanical: docs pages, examples scaffolding, ledger rows | Haiku | Tightly specified |
| Contracts, ledger design, kernel semantics, integration, final verification | Orchestrator (Opus) | Architecture + cross-system reasoning |
| Independent critic passes (ledger fidelity, final audit) | Sonnet, fresh context | Independence |

## Milestones

| # | Milestone | Output | Gate |
| --- | --- | --- | --- |
| M0 | Plan + full ledger + debt register + gate runner | this file, ledger v2, `DEBT.md`, `just gates` | `just verify` |
| M1 | Phase 0 characterization (parallel) | fixtures: cordis, domainforge, connect+codegen, ruvector, sona, rvf, realitytrace(sxr), ag-ui, astryx/react, playwright | `just gate-ak-00x`; evidence + decision records; dependency matrix `compatibility/phase0/MATRIX.md` |
| M2 | Kernel contract + implementations | `kernel-api` (types + conformance kit), `kernel-cordis` (if AK-002 passes) | kernel conformance + properties (fast-check) |
| M3 | Durable event system | `events` (envelope, ports, conformance kits), `store-memory`, `store-sqlite`, `projections` | store conformance on both stores; rebuild-from-SQLite test |
| M4 | Continuations + commitments + artifacts + capabilities selection | `continuations`, `artifacts`, `capabilities` | race/idempotency/restart tests; adaptive-containment property |
| M5 | Wire | `proto/`, `packages/proto`, `protocol-connect`, `protocol-connect-bun`, `runtime-bun` | second-process control test; byte-identical codegen |
| M6 | Semantic + evidence adapters | `domainforge`, `realitytrace` | DomainForge→SemanticRef→event→queued observation test |
| M7 | Cognition | `cognitive-api`, `cognitive-memory`, `cognitive-ruvector`, `cognitive-rvf` (gated) | delete/rebuild non-authority test; retrieval auth filtering |
| M8 | Client/UI | `client`, `react`, `ui-astryx` | headless tests; React hook tests; Astryx leak check |
| M9 | Interop | `ag-ui`, `mcp`, `a2a`, providers | AG-UI matrix suite; reconnect/resync tests |
| M10 | Profiles, CLI, starter, examples, docs, E2E | `profile`, `profiles/*`, `cli`, `templates/starter`, `examples/*`, `docs/*` | clean-dir `cognate create` → `bun test` fixture; Playwright journey (§36) |
| M11 | Independent audit | critic report under `.agents/reports/` | every §40 criterion mapped to a passing gate or a debt entry |

Each milestone ends with: gates re-run by orchestrator → evidence file → status snapshot (YAML append + MD view) → commit.

## Key design decisions made up front (revisit via decision records)

- **Kernel engine seam.** `kernel-api` owns all public types; `kernel-cordis` is the only package importing `cordis`. The conformance kit is the contract; if Cordis fails AK-002, the engine choice is revised behind the same kit (spec §37) and recorded.
- **Command atomicity.** `EventStore.execute(command)` commits event(s), idempotency result, continuation transition, and outbox intents in one SQLite transaction (spec §10, §13.1). Memory store mirrors the semantics.
- **Projection checkpoints** are stored with projection output in the same transaction when co-located; external projections use the outbox (spec §11).
- **Cognition** indexes only durable sources; `CognitiveIndex` is dependency-free; retrieval is always `index → auth filter → authoritative fetch` (spec §16, §32).
- **Streaming** uses `AsyncIterable`/`ReadableStream` only (spec §23).

## Out of scope / explicitly deferred (each must also appear in DEBT.md if it remains at the end)

- Multi-process SQLite writer concurrency beyond single-writer WAL.
- Bidirectional Connect streaming (requires HTTP/2 proof; spec §22).
- SemanticPack ingestion (later optional mode; spec §7.1).
