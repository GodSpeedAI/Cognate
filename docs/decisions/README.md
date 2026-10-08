# Architecture decision records

Eleven records, each stating a context, a decision, its consequences, and what it rejected. They
are the canonical answer to "why is it built this way" for the choices they cover.

## How to read them

An ADR is a record of a decision at a point in time, so its **status line is historical**. Several
were accepted during Phase 0 dependency characterization, before the adapter code existed, and say
so. The decision still stands; the *current* implementation status is in
[`requirements/ledger.yaml`](../../requirements/ledger.yaml) and, in prose, on the plane page for
that concern.

| ADR | Decision | Status as written | Current |
|---|---|---|---|
| [ADR-0001](ADR-0001-kernel-engine-cordis.md) | Cordis as the reference composition engine, behind `kernel-api` | Accepted-with-mitigations | `kernel-cordis` implements the contract; [DEBT-005](../../.agents/DEBT.md) tracks the mitigated gaps |
| [ADR-0002](ADR-0002-semantic-binding-domainforge.md) | Bind semantics through a version-pinned DomainForge adapter | Proposed (Phase 0 characterization complete) | `@godspeedai/domainforge` is implemented; `CG-SEM-001`/`002` pass |
| [ADR-0003](ADR-0003-wire-connect-protobuf.md) | Protobuf schema + Connect as the RPC pair | Accepted for Phase 0 | `proto`, `protocol-connect`, `protocol-connect-bun` are implemented; [DEBT-004](../../.agents/DEBT.md) on streaming |
| [ADR-0004](ADR-0004-cognition-ruvector.md) | RuVector as the reference `CognitiveIndex`, scoped to `vector_search` | Accepted (partial capability) | `cognitive-ruvector` is implemented with that scope; [DEBT-007](../../.agents/DEBT.md) |
| [ADR-0005](ADR-0005-adaptive-ranking-sona.md) | **Reject** SONA as the adaptive ranker | Accepted — SONA rejected | The ranker is Cognate-owned UCB1; [DEBT-008](../../.agents/DEBT.md) closed, `AK-008` implemented |
| [ADR-0006](ADR-0006-portable-cognition-rvf.md) | RVF as an *optional* portable cognitive container | Blocked / unsupported (Phase 0) | `cognitive-rvf` is implemented behind adapter-side mitigations; [DEBT-006](../../.agents/DEBT.md) remains open against upstream. See [rvf.md](../rvf.md) |
| [ADR-0007](ADR-0007-observations-realitytrace.md) | Observations through RealityTrace's own CLI and CEP workflow | Accepted (Phase 0 characterization complete) | `realitytrace` is implemented; `CG-RT-001..003` and `AK-006` pass |
| [ADR-0008](ADR-0008-ag-ui.md) | AG-UI as a projection/interop layer, never the internal ontology | Accepted (Phase 0 characterization complete) | `ag-ui` is implemented with a 31-row compatibility matrix; `CG-AGUI-001..003` pass |
| [ADR-0009](ADR-0009-ui-react-astryx.md) | Headless client → React → Astryx, each replaceable | Accepted (Phase 0 characterization complete) | `client`, `react`, `ui-astryx` are implemented; `CG-UI-001..003` and `CG-CLT-001` pass |
| [ADR-0010](ADR-0010-mcp.md) | MCP tools as an authorized adapter over capabilities | Accepted (Phase 0 characterization complete) | `mcp` is implemented, proven over stdio; `CG-MCP-001` passes, [DEBT-013](../../.agents/DEBT.md) closed |
| [ADR-0011](ADR-0011-runtime-service-contract-package.md) | A transport-independent `runtime-api` package owning `RuntimeService` and the agent surface | Accepted | Implemented; it is what makes Connect replaceable (`CG-WIR-003`) |

## What the records share

Three patterns run through all eleven, and they are worth reading across rather than one at a time:

1. **A pinned upstream, consumed as a release.** Exact versions, never ranges or path
   dependencies; the framework adapts rather than forks.
2. **The contract stays framework-owned.** Engine types never appear in a public interface, and the
   conformance kit — not a bespoke test — is what proves an implementation interchangeable.
3. **A gap in an upstream is mitigated in the adapter and recorded as debt**, not designed around by
   changing the contract. The RVF integrity manifest and the RuVector tenant pre-filter are the
   clearest cases.

## Related

- [../explanation/why-adapters.md](../explanation/why-adapters.md) — the rules these records
  instantiate, with the current inventory.
- [../reference/verification.md](../reference/verification.md) — the ledger, gates, and evidence
  that say what is implemented today.
- [../../.agents/DEBT.md](../../.agents/DEBT.md) — the debt register the statuses above refer to.
- [../documentation-map.md](../documentation-map.md) — which page owns which concept.
