# CopilotKit reconstruction — open-ended/MCP surface (settlement gate 13, cognate side)

Date: 2026-10-01. Scope: the reconstruction's open-ended Generative UI over MCP — the consume
direction (an agent using an external MCP server's tools and UI resources), composed from general
primitives. The builder unit was interrupted by a quota limit mid-flight; the orchestrator
completed and verified the remaining work directly.

## Reference side (unchanged, recorded gap)

The pinned starter's MCP middleware requires `https://mcp.excalidraw.com`
(`examples/integrations/langgraph-js/src/app/api/copilotkit/[[...slug]]/route.ts`, `MCP_SERVER_URL`
override) and the pin ships no local MCP mock (showcase compose files define only `aimock`;
`showcase/harness/src/probes/scripts/d5-mcp-apps.ts` states the probe "depends on
mcp.excalidraw.com"). The reference MCP-app surface therefore stays `DOCUMENTED_REFERENCE` with
the missing mechanism named; it was never executed and never simulated.

## What was built (cognate side)

- `cognate/src/mcp-fixture-server.ts` — deterministic local MCP server fixture (official
  `@modelcontextprotocol/sdk` 1.30.1, protocol-only): one `create_view` tool with a JSON schema, a
  deterministic HTML UI resource with a single control that postMessages its result; stateless
  Streamable HTTP on an ephemeral loopback port, served by raw `node:http`.
- `cognate/src/mcp-bridge.ts` — the consume bridge: `tools/list` → one lease-bound remote
  capability offer per tool via `CognateClient.offerCapability` (the existing offer/lease
  mechanism: TTL + renewal, revoke on disposal, durable committed continuations);
  `invokeRemoteOffer` continuations are executed by the client engine's own scan, the handler
  performs `tools/call` + `resources/read`, and the UI document is returned inside the durable
  continuation result (recorded as artifact + event by the run). Disposal revokes the offers. No
  new kernel primitive.
- `cognate/src/remaining-journeys.ts` — `journeyMcpAgent` (offers → invoke → ui.render with
  artifact → open `mcp:approve-view` interaction wait → settle citing the posted result) and the
  public `mcp-open-ended` projection; display constants live in `src/constants.ts` so browser
  surfaces never import the server module.
- `cognate/src/ui/McpOpenEndedSurface.tsx` — sandboxed iframe (`sandbox="allow-scripts"` only; an
  opaque origin needs no same-origin authority for postMessage), every phase read from durable
  state (projection, artifact store, continuation list); the frame's postMessage resolves the
  durable interaction only when the payload shape and viewId match the recorded render.
- `cognate/test/J-H-open-ended-mcp.test.tsx` — settlement evidence: the tool invocation is a
  durable `remote:` continuation (RESUMED), the UI document is a durable artifact byte-equal to
  the fixture document, the interaction is a durable `mcp:` continuation (OPEN → RESUMED by the
  posted result), the run settles completed citing it, replay through a fresh client rebuilds the
  same card from the projection + artifact with no live MCP server, and bridge disposal revokes
  the offers (a later run sees `offers: []`).

## General repair (packages/client), per the primitive-repair rules

`ProjectionStore` re-read only on delivered stream events; a fold can complete just after the
event-triggered read and a waiting run commits no further events, so a live surface could never
see the row. Added the public `refresh()` on the client's projection store (domain-independent;
useful generally) with a regression test in `packages/client/test/client.test.ts`
("projection store refresh() re-reads without a new event"). Gate CG-CLT-001 stays green (10/10).

## Observed-class findings (documented, then designed around)

With a DOM global registrator active (happy-dom), `Bun.fetch` fails after a successful wire
exchange (it validates its result against the replaced global Response class), and `Bun.serve`
rejects the SDK server transport's DOM-class Responses ("Expected a Response object"). The
fixture server therefore uses raw `node:http` (buffered text; duck-typed SDK on both sides) and
the bridge's fetch is a bounded `node:http` exchange returning the caller's global Response —
both work identically under pristine or DOM-replaced globals. No ambient abort signal propagates
into the HTTP layer (bounded request/response exchanges only).

## Commands and observed results (2026-10-01, serial runs)

- `cd validation/reconstructions/copilot/cognate && bun run typecheck` → exit 0.
- `bun test test` → 12 pass / 0 fail / 239 expect() across 11 files (J-H-open-ended-mcp
  included, ~0.6 s).
- `bun test ./packages/client/test/client.test.ts` (CG-CLT-001 gate) → 10 pass / 0 fail.
- `bun test tests/protocol/` → 11 pass / 0 fail; `bun test tests/persistence/` → 5 pass / 0 fail;
  `bun test tests/architecture/` → 45 pass / 0 fail (includes the reference-removed cycle).

## Deviations

- No capture/diff round for this surface: no reference counterpart exists to compare against
  (the reference checkpoints list has no MCP row); the surface is proven by the settlement suite.
- The manifest's journeyCoverage J-H entry gains `openEndedUncovered` recording the reference gap.
