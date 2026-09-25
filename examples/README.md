# Cognate examples

Fifteen runnable examples, one per topic named in the root `README.md` "Examples" section. Each is a
single, self-contained `index.ts` (or `.tsx`) using only real exported package APIs, with in-memory or
temp-dir state -- no network, no external services. Run any of them with:

```bash
bun run example:<name>
```

Each prints a line starting `ok: ` describing the outcome it verified, and exits non-zero if its own
assertions fail.

| Example | Demonstrates | Docs |
| --- | --- | --- |
| [`copilot`](./copilot/index.ts) | The Copilot reference profile: model + backend tool loop over the runtime | `docs/ui.md`, spec §29.1 |
| [`autonomous-harness`](./autonomous-harness/index.ts) | The Harness reference profile: model providers + tool registry + agent loop | `docs/architecture.md`, spec §29.2 |
| [`human-approval`](./human-approval/index.ts) | An agent suspending on a durable continuation until a human resolves it | `docs/concepts.md`, spec §12 |
| [`generative-ui`](./generative-ui/index.ts) | `ui.render` events rendered to HTML via a component registry | `docs/ui.md`, ADR-0009, spec §12 |
| [`shared-state`](./shared-state/index.ts) | Application state derived from `state.changed` snapshots and JSON Patch deltas | `docs/concepts.md`, spec §12 |
| [`artifact-workbench`](./artifact-workbench/index.ts) | A durable, content-addressed artifact produced and read back | `docs/architecture.md`, spec §13.1 |
| [`multi-agent`](./multi-agent/index.ts) | A parent agent durably spawning and awaiting a child run | `docs/architecture.md`, spec §29.2 |
| [`cognitive-memory`](./cognitive-memory/index.ts) | Indexing and semantic recall with authorization | `docs/cognition.md`, ADR-0004, spec §16 |
| [`rvf-branching`](./rvf-branching/index.ts) | A branched RVF cognition file diverging from its parent | `docs/rvf.md`, ADR-0006, spec §18 |
| [`capability-hot-swap`](./capability-hot-swap/index.ts) | Live replacement of a capability provider with no downtime | `docs/concepts.md`, spec §8.3, §35 |
| [`domainforge`](./domainforge/index.ts) | A DomainForge model to read-only semantic objects plus explicit capability binding | `docs/semantics.md`, ADR-0002, spec §19 |
| [`realitytrace`](./realitytrace/index.ts) | Committed-outbox observation delivery to an in-memory ObservationPort | `docs/evidence.md`, ADR-0007, spec §20 |
| [`ag-ui`](./ag-ui/index.ts) | A run projected as an AG-UI-shaped SSE event stream | `docs/protocols.md`, ADR-0008, spec §24 |
| [`mcp`](./mcp/index.ts) | Runtime capabilities exposed as authorized MCP tools | `docs/protocols.md`, ADR-0010, spec §6, §32 |
| [`connect`](./connect/index.ts) | The same RuntimeService served and consumed over Connect RPC | `docs/protocols.md`, ADR-0003, spec §22 |

## Notes

- `generative-ui` and `mcp` resolve `react`/`react-dom` and `@modelcontextprotocol/sdk` relative to the
  workspace package that declares them (`Bun.resolveSync`), the same pattern `packages/mcp`'s own stdio
  test uses, since those dependencies aren't hoisted to the repo root.
- `realitytrace` always exercises an in-memory `ObservationPort`; the `ok:` line reports whether `SXR_BIN`
  was configured, since the CLI port talks to an external binary that the no-external-services contract
  for these examples excludes.
