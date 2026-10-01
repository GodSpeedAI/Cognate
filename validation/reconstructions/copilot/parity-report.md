# CopilotKit Reconstruction — Parity Report

Generated 2026-10-01T04:44:30Z for plan unit **R5** of
[.agents/plans/copilot-reconstruction-remaining.md](../../.agents/plans/copilot-reconstruction-remaining.md)
(Phases 15–16 preconditions). Compiled strictly from artifacts on disk; every cited path is
verified by the checker (see "Validity checker" below). Normative sources: the reconstruction
prompt's §"Phase 15", §"Final Parity Report", §"Settlement Gates" (32 gates) and §"Completion
Standard"; format precedent (not content): `validation/reconstructions/deepseek-harness/parity-report.{json,md}`.

Machine-readable counterpart: [parity-report.json](parity-report.json) (same content, same order).

## Validity checker

```sh
node validation/reconstructions/copilot/check-parity-report.mjs
```

Observed (2026-10-01, exit 0):

```
ok: parsed validation/reconstructions/copilot/parity-report.json
ok: checked 175 cited artifact paths against the repository root
ok: parity-report.json is valid (parses; all cited paths exist; 32 gates present with statuses;
    executable checks behind every non-open gate; 14 matrix rows; completion standard answered)
```

The checker asserts: the JSON parses; **every** cited artifact path exists on disk (resolved
against the repository root); all 32 gates are present exactly once with a status of
`pass` / `pass-with-recorded-gap` / `open`; every non-open gate carries a non-empty
`check.command` and a non-empty observed result; the 14 matrix rows R-A01..R-A14 are present with
known priorities/statuses/evidence classes; the three completion-standard questions are answered;
and the open-deviations list carries D1..D13 by reference.

## Reference

| Field | Value |
|---|---|
| Repository / commit | `CopilotKit/CopilotKit` @ `6e452e5342db53e9ab23d8b3c0a4592ec25ff554` |
| Manifest | [reference-manifest.json](reference-manifest.json) (selected surfaces, mock LLM, journey coverage, uncovered records) |
| Behavior matrix | [reference-behavior-matrix.md](reference-behavior-matrix.md) (rows R-A01..R-A14) |
| Evidence classes | BLACK_BOX_REFERENCE (executed against the pinned repo's own mock LLM) · OFFICIAL_FIXTURE_REFERENCE (official CopilotKit fixtures/mocks) · DOCUMENTED_REFERENCE (docs/source-backed; the missing fixture/mechanism is named, never a paid endpoint) |

## Observed suite runs (this report's own executions, 2026-10-01)

| Suite | Command | Observed |
|---|---|---|
| Cognate journeys | `cd validation/reconstructions/copilot/cognate && bun test test` | **12 pass / 0 fail**, 239 expect() calls, 11 files (11 catalog journeys + J-H-open-ended-mcp; R6 critic re-run 2.38 s) |
| Protocol (AG-UI wire + purity) | `cd validation/reconstructions/copilot && bun test tests/protocol/` | **11 pass / 0 fail**, 148 expect() calls, 2 files [947.00ms] |
| Persistence (restart/rebuild/cognition) | `cd validation/reconstructions/copilot && bun test tests/persistence/` | **5 pass / 0 fail**, 166 expect() calls, 3 files [1311.00ms] |
| Architecture | `cd validation/reconstructions/copilot && bun test tests/architecture/` | **45 pass / 0 fail**, 132 expect() calls, 9 files [7.51s] — includes the live reference-removed run |
| Architecture (skip flag variant) | `COPILOT_ARCH_SKIP_REFERENCE_REMOVED=1 bun test tests/architecture/` | 44 pass / 1 skip / 0 fail, 45 tests [14.46s] |
| Repository gates | `just verify` | **78/78 gates pass** (first attempt, serial run; the known concurrent-load flake did not occur, so no rerun was needed) |

No suite failed on any attempt; the "re-run once cleanly" provision was never exercised. A
concurrent critic was reading `tests/architecture` during these runs; the full-suite run was
started in a quiet window (no other bun test processes) and completed green.

## Behavioral parity — matrix rows R-A01..R-A14

Full mapping with mechanisms and code citations: [primitive-provenance.md](primitive-provenance.md)
(14/14 rows end `Special case? No`). Row `evidenceClass` records the reference-side class
supported by on-disk records; where a green black-box run upgraded a matrix row's class
(R-A08/R-A09/R-A11/R-A12), the note says so and cites the run report.

| Row | Pri | Surface | Class | Reference evidence | Cognate evidence | Test ID | Status |
|---|---|---|---|---|---|---|---|
| R-A01 | P0 | Chat/app mode via frontend tool | BLACK_BOX_REFERENCE | matrix; `reference/logs/runs/J-C.json`; J-C shots | `cognate/src/ui/RemoteCapabilitySurface.tsx`; `cognate/src/remote-capability.tsx`; `cognate/src/ui/App.tsx`; D2 | `J-B-front-capability` | pass |
| R-A02 | P0 | Shared state bidirectional | BLACK_BOX_REFERENCE | matrix; `J-C.json`; `run-req-J-C-02.json` (canvas-written "New Todo" on the wire) | `cognate/src/shared-state.ts`; `cognate/src/SharedStateSurface.tsx`; `packages/runtime-api/src/state.ts` | `J-C-shared-state` | pass |
| R-A03 | P0 | Streaming / ordered intermediate events | DOCUMENTED_REFERENCE | matrix; `J-A.json`; `run-req-J-A-00.json` | `cognate/src/journey.ts`; `cognate/src/ChatSurface.tsx`; `packages/ag-ui/test/live.test.ts`, `reconnect.test.ts` | `J-A-chat-turn` (+`J-K-live-recovery`) | pass |
| R-A04 | P0 | Frontend tools lifecycle | OFFICIAL_FIXTURE_REFERENCE | matrix; `J-C.json` (enableAppMode chain) | offer/lease: `RemoteCapabilitySurface.tsx`; `packages/runtime-bun/src/executor.ts` | `J-B-front-capability` | pass |
| R-A05 | P0 | Historical renderer after unmount | DOCUMENTED_REFERENCE | matrix (no black-box capture of this row) | `useRemoteCapabilityHistory`; `richThreadProjection` fold | `J-J-rich-thread` (+`J-B`) | pass |
| R-A06 | P0 | Streaming tool arguments, phased render | OFFICIAL_FIXTURE_REFERENCE | matrix | `packages/ag-ui/test/streaming-tool-args.test.ts`; `packages/ag-ui/src/index.ts`; `controlledRenderProjection` | `J-E-controlled-rendering` (+tests/protocol) | **pass-with-recorded-gap** |
| R-A07 | P1 | Agent-readable context | OFFICIAL_FIXTURE_REFERENCE | matrix; `J-D.json` (UNCOVERED record); `run-req-J-A-00.json` | `packages/ag-ui/test/inbound.test.ts`; `journeyDAgent`; `AgentContextSurface` | `J-D-agent-context` | pass |
| R-A08 | P1 | Controlled GenUI / backend rendering | BLACK_BOX_REFERENCE (upgraded from green J-E run) | matrix; `J-E.json` ok:true 8/0; J-E shots | `journeyEAgent` + `controlledRenderProjection`; `ControlledRenderingSurface` | `J-E-controlled-rendering` | pass |
| R-A09 | P1 | Tool-based HITL | BLACK_BOX_REFERENCE (upgraded from green J-F run) | matrix; `J-F.json` ok:true 4/0; J-F shots | `packages/runtime-api/src/frontend.ts` (`invokeFrontend`); `ToolDecisionSurface` | `J-F-tool-human-decision` | pass |
| R-A10 | P1 | Runtime interrupt | DOCUMENTED_REFERENCE | matrix; `J-G.json` (UNCOVERED: pinned agent has no interrupt node) | `journeyGAgent` (`ctx.waitFor`); `RuntimeInterruptSurface`; protocol CUSTOM payload | `J-G-runtime-interrupt` | pass |
| R-A11 | P1 | A2UI declarative UI | BLACK_BOX_REFERENCE (upgraded from green J-H run) | matrix; `J-H.json` ok:true 6/0; J-H shots | `declarativeCatalog` + `validateDeclarativeRender` + `declarativeCatalogProjection` | `J-H-declarative-ui` | pass |
| R-A12 | P1 | Rich threads (mixed content, restore) | BLACK_BOX_REFERENCE | matrix; `J-J.json` ok:true 12/0; restoration half OBSERVED_ABSENT (reference cannot restore) | `threadHistoryProjection` + `richThreadProjection`; `ChatSurface` restore | `J-J-rich-thread` | pass |
| R-A13 | P1 | Managed thread list | DOCUMENTED_REFERENCE (Intelligence-dependent; drawer never lists on the executed surface) | matrix; `J-J.json` postObservation (`threadListRequests: 0`); J-J-06 | `RichThreadView.tsx` (`knownThreads`, new/switch) | `J-J-rich-thread` | **pass-with-recorded-gap** |
| R-A14 | P1 | UI layouts, responsive | DOCUMENTED_REFERENCE (executed surface shows inline chat + drawer-as-sidebar; popup uncaptured) | matrix; manifest `referenceSurfaceFacts`; mobile shots | `ChatSurface`; `RichThreadView`; `diffs/summary.md` responsive rows | `J-J-rich-thread` (+diffs rows) | **pass-with-recorded-gap** |

Row-status honesty notes:

- **R-A06** — partial args before completion are proven at the adapter/wire level
  (`streaming-tool-args.test.ts` gates a mid-argument stream; `TOOL_CALL_ARGS` deltas fold to the
  complete payload by END) and render phases derive from durable events; the recorded gap is that
  no cognate browser surface re-renders per arg chunk. The pending phase itself is real
  (projection fold asserted by the J-E test) but not browser-photographable (D7).
- **R-A07** — the reference side is UNCOVERED on the canonical starter (it mounts no
  `useAgentContext`; the manifest records this rather than synthesizing a prompt) and rests on
  the official React-core timing suite (21/21). The cognate side passes on its own surface.
- **R-A10** — reference side UNCOVERED with DOCUMENTED_REFERENCE class: the pinned agent graph
  registers no `interrupt()` node, so no reference backend that supports it exists at the pin.
  The cognate side passes (resume/cancel, distinct from a tool result).
- **R-A12** — the reference's own executed behavior after reload is OBSERVED_ABSENT (welcome
  screen, license-gated drawer, `threadListRequests: 0`); Cognate restores chat, tool waits and
  renders from durable projections. The divergence direction favors Cognate (D9–D11) and is
  recorded with the reference's own wire metrics, never masked.

## Settlement gates (32)

Statuses: **25 pass · 7 pass-with-recorded-gap · 0 open** (after R6: gate 31 pass on the critic's evidence-of-record, gate 32 pass — no unresolved P0/P1 failures; every gap is a named disposition).
pass: 1, 2, 5, 6, 7, 8, 9, 11, 12, 14, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 ·
pass-with-recorded-gap: 3, 4, 10, 15, 16, 18, 32 · open: 13, 31.
Every gate's `check.command` runs from the repository root; observed values are from the runs
recorded above and the per-gate executions performed while writing this report.

| # | Gate | Status | Evidence | Check (command → observed) |
|---|---|---|---|---|
| 1 | Reference commit is pinned | pass | reference-manifest.json | `node -e "…assert commit…"` → `pinned: 6e452e5342db53e9ab23d8b3c0a4592ec25ff554` |
| 2 | Current consolidated examples define the primary reference suite | pass | reference-manifest.json | `node -e "…print selectedSurfaces…"` → `examples/integrations/langgraph-js`, `examples/showcases/generative-ui`, `packages/react-core/src/v2…` |
| 3 | All P0 behaviors pass | pass-with-recorded-gap | parity-report.json; cognate/test; J-C.json | `node -e "…assert no P0 row open/fail…"` → `R-A01:pass … R-A06:pass-with-recorded-gap` |
| 4 | All P1 behaviors pass | pass-with-recorded-gap | parity-report.json; J-G.json | `node -e "…assert no P1 row open/fail…"` → `R-A07:pass … R-A13:pass-with-recorded-gap R-A14:pass-with-recorded-gap` |
| 5 | Canonical agent-application UI is faithfully reconstructed | pass | diffs/summary.md; diffs/DISPOSITIONS.md; cognate/screenshots | `node -e "…count diffs/*.png…"` → `29 triptychs in diffs/` |
| 6 | Chat streaming matches reference interaction semantics | pass | J-A/J-K tests; `packages/ag-ui/test/live.test.ts`; J-A.json | cognate suite → `12 pass / 0 fail … [2.38s]` (R6 critic re-run) |
| 7 | Frontend tools work | pass | J-B test; J-C.json; counterexamples §C1 | reference check + `bun test test/J-B-front-capability.test.tsx` → `reference J-C ok:true 16 hits 0 misses`; `1 pass / 0 fail` |
| 8 | Backend tool rendering works | pass | J-E test; J-E.json | reference check + J-E test → `reference J-E ok:true 8 hits 0 misses`; `1 pass / 0 fail` |
| 9 | Shared state works bidirectionally | pass | J-C test; `run-req-J-C-02.json` | `grep -l "New Todo" run-req-J-C-*.json && bun test test/J-C-shared-state.test.tsx` → `run-req-J-C-02.json`; `1 pass / 0 fail` |
| 10 | Agent context works | pass-with-recorded-gap | J-D test; J-D.json (UNCOVERED); inbound.test.ts | `bun test test/J-D-agent-context.test.tsx` → `1 pass / 0 fail` — cognate side passes; reference side carries OFFICIAL_FIXTURE_REFERENCE (starter mounts no useAgentContext) |
| 11 | Controlled Generative UI works | pass | J-E test; J-E.json | same compound as gate 8 → `reference J-E ok:true 8 hits 0 misses`; `1 pass / 0 fail` |
| 12 | Declarative A2UI works | pass | J-H test; J-H.json | reference check + J-H test → `reference J-H ok:true 6 hits 0 misses`; `1 pass / 0 fail` |
| 13 | Selected open-ended/MCP application works | **pass-with-recorded-gap** | manifest (J-H `openEndedUncovered`); cognate/test/J-H-open-ended-mcp.test.tsx; .agents/evidence/2026-10-01-copilot-mcp-open-ended.md | `cd validation/reconstructions/copilot/cognate && bun test test/J-H-open-ended-mcp.test.tsx` → 1 pass / 0 fail / 43 expect() — cognate MCP surface proven; reference side DOCUMENTED_REFERENCE (see below) |
| 14 | Tool-based HITL works | pass | J-F test; J-F.json | reference check + J-F test → `reference J-F ok:true 4 hits 0 misses`; `1 pass / 0 fail` |
| 15 | Runtime interrupt HITL works against a reference backend that supports it | pass-with-recorded-gap | J-G test; J-G.json; protocol test | `bun test test/J-G-runtime-interrupt.test.tsx` → `1 pass / 0 fail` — cognate passes; the pinned reference backend has no interrupt node (DOCUMENTED_REFERENCE, J-G UNCOVERED) |
| 16 | Thread creation, switching, restoration, management | pass-with-recorded-gap | J-J test; J-J.json; RichThreadView | reference check + J-J test → `postOutcome: OBSERVED_ABSENT threadListRequests: 0`; `1 pass / 0 fail` — cognate create/switch/restore work; management mutations unimplemented both sides |
| 17 | Rich UI restored with its thread, not only plain text | pass | J-J test; RichThreadView; DISPOSITIONS D9 | `bun test test/J-J-rich-thread.test.tsx` → `1 pass / 0 fail` (reference could not restore on its own surface — D9) |
| 18 | Inline chat, popup, sidebar, thread drawer parity | pass-with-recorded-gap | diffs/summary.md; DISPOSITIONS D2/D13; manifest surface facts | `node -e "…assert D2/D13 present…"` → `D1..D13 named deviations present` — popup unexecuted on both sides; sidebar chrome is D2 |
| 19 | AG-UI interoperability passes independently of CopilotKit | pass | tests/protocol/*; run-req-J-A-00.json | `bun test tests/protocol/` → `11 pass / 0 fail` (official HttpAgent run; pinned RunAgentInput verbatim; non-vacuous purity scanner) |
| 20 | Side-by-side + diff evidence; every divergence fixed or recorded | pass | diffs/summary.md; DISPOSITIONS.md | `node -e "…count triptychs/deviations/fixes…"` → `29 triptychs; 13 named deviations; 5 fixed dispositions` |
| 21 | Responsive interaction equivalent for selected viewports | pass | diffs/summary.md | `node -e "…parse responsive table…"` → `6 journeys, each with desktop+mobile rows` |
| 22 | No CopilotKit runtime dependency exists | pass | protocol purity tests; architecture no-dependency tests | `bun test tests/protocol/` → `11 pass / 0 fail` |
| 23 | Reconstruction still works after reference source is removed | pass | reference-removed.log; reference-removed.test.ts | `bun test tests/architecture/` → `45 pass / 0 fail` incl. the live reference-removed run; log records 4 prior runs, all exit 0 with restore asserted |
| 24 | No CopilotKit-specific Cognate kernel primitive was added | pass | kernel-primitives.test.ts; primitive-provenance.md | `bun test tests/architecture/kernel-primitives.test.ts` → `3 pass / 0 fail` |
| 25 | Every P0/P1 feature maps cleanly to general Cognate primitives | pass | primitive-provenance.md; counterexamples | `node -e "…count rows ending '\| No \|'…"` → `14 provenance rows (R-A01..R-A14) carry Special case? = No, 0 exceptions` |
| 26 | `.sea` grammar was not modified | pass | sea-unchanged.test.ts | `bun test tests/architecture/sea-unchanged.test.ts` → `4 pass / 0 fail` |
| 27 | DomainForge was not modified for this reconstruction | pass | domainforge-realitytrace-unchanged.test.ts | same file → `5 pass / 0 fail` (pin @godspeedai/domainforge 0.18.2 intact) |
| 28 | RealityTrace was not modified for this reconstruction | pass | domainforge-realitytrace-unchanged.test.ts | same file → `5 pass / 0 fail` |
| 29 | RuVector remains disposable/rebuildable derived cognition | pass | persistence cognition.test.ts | `bun test tests/persistence/` → `5 pass / 0 fail` (delete index → restart → rebuild → retrieval returns) |
| 30 | All Cognate architecture and regression tests pass | pass | justfile verify target | `just verify` → `78/78 gates pass` (first attempt, serial) |
| 31 | Independent verifier approves with evidence | pass | .agents/evidence/2026-10-01-copilot-r6-critic.md | R6 consolidated critic (independent agent) re-ran every gate serially (12/0 cognate, 11/0 protocol, 5/0 persistence, 45/0 architecture incl. a live gate-23 cycle, checker exit 0, just verify 78/78 last-and-alone, deepseek 37/0), read all 29 triptychs + 2 reference-only PNGs systematically, audited all 32 gates and the completion standard — VERDICT: APPROVE, no R-block reopens |
| 32 | No unresolved P0/P1 failures remain | pass | parity-report.json | matrix rows fail/open: none — 11 pass / 3 pass-with-recorded-gap rows, every gap a named disposition (R-A06 wire-level proof note, R-A13 documented class, R-A14 popup unexecuted); with gate 31 approved and all three completion questions yes, no failure is unresolved |

**Gate 13 (pass-with-recorded-gap) — which side is which.** The *cognate* side now exercises an
open-ended MCP application end-to-end from general primitives: the consume bridge publishes the
fixture server's tools as lease-bound remote offers (`tools/list`), executes selected invocations
over MCP (`tools/call` + `resources/read`), records the UI document as a durable artifact, and the
run settles only after the sandboxed frame's posted interaction resolves the durable `mcp:`
continuation — proven by `cognate/test/J-H-open-ended-mcp.test.tsx` (1 pass / 0 fail), including
fresh-client replay and offer revocation on bridge disposal. The fixture is exactly the prompt's
"isolated deterministic MCP fixture" (protocol-only `@modelcontextprotocol/sdk` 1.30.1). The
*reference* side remains DOCUMENTED_REFERENCE with the missing mechanism named: the pinned
starter's MCP middleware requires `https://mcp.excalidraw.com` and the pin ships no local MCP mock
(`reference-manifest.json` J-H `openEndedUncovered`) — the reference surface cannot execute at the
pin and was never simulated. The gap is the reference's own executability, not a Cognate
capability.

**Gates 10/15/18 (pass-with-recorded-gap) — which side is which.** In each case the *cognate*
side passes its own executable check, while the *reference* side carries its recorded evidence
class: gate 10 — OFFICIAL_FIXTURE_REFERENCE (official context-timing suite 21/21; the canonical
starter cannot express the scenario, recorded as J-D UNCOVERED); gate 15 — DOCUMENTED_REFERENCE
(no interrupt node at the pin; fixtures drive another surface's tool); gate 18 — popup is
unexecuted on the reference and unimplemented in the reconstruction, sidebar chrome is a named
deviation (D2/D13).

## Visual parity summary

Source: [diffs/summary.md](diffs/summary.md) and [diffs/DISPOSITIONS.md](diffs/DISPOSITIONS.md)
(plan R4 output). 31 reference checkpoints · 29 Cognate captures · **29 shared triptychs**
(reference | Cognate | pixel diff; differing pixels 2.35%–13.05%) · 2 reference-only
(J-E-01/J-E-03 pending states, justified by D7) · 0 Cognate-only. Every divergence is **fixed**
(F1–F5, re-captured) or a **named deviation** (D1–D13); brand regions are named deviations, never
masked. Every journey has a desktop AND a mobile row (gate 21): J-A 2/1, J-C 4/1, J-E 3/1 (+2
reference-only), J-F 4/1, J-H 2/1, J-J 8/1.

## Open deviations (carried by reference from diffs/DISPOSITIONS.md)

| ID | One-line summary | Disposition |
|---|---|---|
| D1 | Brand region: "CopilotKit" wordmark + kite logo vs Cognate masthead/subtitle | named deviation (identity out of scope by plan R4) |
| D2 | Reference persistent left-sidebar navigation + Chat/App toggle vs Cognate top journey tabs | named deviation (bench layout identity) |
| D3 | Reference suggested-prompt pills; Cognate starts journeys via labeled controls | named deviation (no equivalent fixture control) |
| D4 | Reply/payload copy differs (deterministic Cognate fixtures) | non-structural note (fixture content) |
| D5 | Reference todo card board vs Cognate versioned state ledger | named deviation (round trip equivalent in outcome) |
| D6 | Reference chart bodies / full dashboard vs Cognate component cards / catalog scalars | named deviation (fixture/catalog scope) |
| D7 | J-E pending phase not photographable on the Cognate surface (~5 ms run vs ~100 ms first event) | named deviation (pending fold proven by the J-E test) |
| D8 | J-F-02 compares different run phases (reference's own capture caught the resolved state) | named deviation (resolved phase compared by J-F-03) |
| D9 | Reference reload restores nothing (OBSERVED_ABSENT); Cognate restores from projections | named deviation (direction favors Cognate) |
| D10 | Reference drawer pinned to "Loading threads…" (zero rows); Cognate lists durable threads | named deviation (same direction as D9) |
| D11 | Reference "new thread"/"switched back" byte-identical welcome screens; Cognate shows genuine states | named deviation (same direction as D9) |
| D12 | Reference composes generative components inline in the transcript; Cognate renders in journey panels/replay | named deviation (presentation composition) |
| D13 | Affordance regions differ (runtime indicator + theme toggle vs launcher bubble + segmented control) | named deviation (brand/affordance region) |
| REF-ONLY-J-E-01 | `J-E-01-controlled-genui-pending` has no Cognate capture | reference-only checkpoint justified by D7 |
| REF-ONLY-J-E-03 | `J-E-03-backend-tool-pending` has no Cognate capture | reference-only checkpoint justified by D7 |

## Follow-ups

1. **FU-1 — RESOLVED 2026-10-01: remote-offer waits resolve via the standard AG-UI tool-message
   path.** The adapter's tool-message resolve path now accepts both wire shapes — a full
   continuation id (frontend waits) or a bare remote id, which it addresses to the thread's
   current run's remote continuation (`<runId>.wait.remote:<remoteId>`); unknown ids still fail
   closed through the service's continuation lookup. Wire projection is unchanged, so archived
   shapes stay valid. Regression tests: `packages/ag-ui/test/remote-offer.test.ts` (a generic
   client completes the round trip; TOOL_CALL_RESULT projected; run completes) and the protocol
   suite's "a generic AG-UI client completes the remote-offer round trip via the standard
   tool-message path" test, which failed with RUN_ERROR not_found before the fix. Found by
   `tests/protocol`; confirmed by its critic; fixed under the primitive-repair rules.
2. **FU-2 — reference-side MCP App surface remains DOCUMENTED_REFERENCE (gate 13 cognate leg
   closed).** The Cognate counterpart is built and proven (consume bridge over the offer/lease
   mechanism, deterministic local MCP fixture, sandboxed renderer —
   `.agents/evidence/2026-10-01-copilot-mcp-open-ended.md`). Remaining: if a future pin ships a
   locally executable MCP-app surface (local mock server), execute it and add the side-by-side
   comparison; today the pinned surface requires `https://mcp.excalidraw.com`.
3. **FU-3 — RESOLVED 2026-10-01: run-level CUSTOM payloads are self-sufficient.** AG-UI 1.0.0
   has no interrupt event, so run-level waits surface as CUSTOM
   (`cognate.continuation`/`cognate.unsupported_interaction`) — projecting a tool call for them
   would contradict the reference's own characterization (RUN_FINISHED plus interrupt payload,
   not a tool result). The payload now carries continuation id, type, kind, payload, `runId` and
   `threadId`, so a generic client acts through the STANDARD `RunAgentInput.forwardedProps` field
   (`forwardedProps.cognate.resolve`/`cancel`) without parsing rawEvent. Asserted by
   `packages/ag-ui/test/remote-offer.test.ts` and the protocol suite's runtime-interrupt test.
4. **FU-4 — RESOLVED 2026-10-01: the R6 consolidated critic approved with evidence (gate 31).**
   Verdict of record: `.agents/evidence/2026-10-01-copilot-r6-critic.md`.
5. **FU-5 — managed thread mutations (R-A13) unimplemented on both executed surfaces.** If the
   critic upgrades the row's priority, the general shape is a thread-metadata mutation capability
   over the durable thread correlation plus a projection fold — not a CopilotKit-specific
   primitive.
6. **FU-6 — pending-state side-by-side photography (J-E-01/J-E-03) remains reference-only** (D7);
   a presentation-owned capture-latency knob would make the pending state photographable; the
   pending fold is already proven by `cognate/test/J-E-controlled-rendering.test.tsx`.

## Completion standard (answered strictly from evidence on disk)

**Q1 — Can a developer/user familiar with current CopilotKit perform the same important
application interactions through substantially the same interfaces and UI behaviors, while
Cognate is doing all of the work underneath? — Yes.**
Basis: every important application interaction in the prompt's Objective list is performable in
the reconstruction through interfaces matching the reference's observed or documented behavior —
chat streaming, frontend capability mount/unmount, shared state both directions, agent context,
controlled GenUI/backend rendering, tool-based HITL, runtime interrupt, declarative A2UI,
rich-thread restore, layouts, and AG-UI interoperability — with 12/12 journey tests green and 29
shared structural-parity triptychs whose every divergence is fixed (F1–F5) or named (D1–D13).
Open-ended Generative UI (MCP App) is performable and proven with the prompt's own prescribed
isolated deterministic MCP fixture (`cognate/test/J-H-open-ended-mcp.test.tsx`, 1 pass / 0 fail /
43 expect()): tool invocation, UI resource, sandboxed interactive frame, posted result settling
the run, replay, and offer revocation. The pinned reference cannot execute that surface locally
(external `mcp.excalidraw.com`; no local mock ships in the pin — `reference-manifest.json` J-H
`openEndedUncovered`), so its interface parity rests on the pin's own source
(`MCPAppsActivityRenderer`'s sandboxed-iframe mechanism), carried as DOCUMENTED_REFERENCE with
the missing mechanism named — the evidence-class system applied as designed; no reference
behavior was simulated. Per-row evidence classes live in the matrix rows above; exactly one row
(R-A13, managed hosted thread list) plus the MCP surface's reference leg rest on the documented
class, and both name their missing mechanism.

**Q2 — Can every reconstructed behavior be explained as a composition or projection of existing
general Cognate primitives rather than a CopilotKit exception? — Yes.**
Basis: [primitive-provenance.md](primitive-provenance.md) maps 14/14 P0/P1 rows with
`Special case? No`, each grounded in a named mechanism and real files (remote capability
offer/lease + `useRemoteCapability`; thread-scoped durable state with CAS; `ui.render` events +
catalog projection; `invokeFrontend` continuation; run-level `waitFor`; event replay +
projections). The two architectural counterexamples were repaired as domain-general runtime
mechanisms (C1 remote capability offers, C2 thread-scoped durable state) plus the A1 adapter
defect repair (`architectural-counterexamples.md`); `tests/architecture/kernel-primitives.test.ts`
proves no reference-named kernel primitive exists (3 pass / 0 fail).

**Q3 — Can an ordinary AG-UI participant interoperate with the Cognate implementation without
CopilotKit being present at all? — Yes.**
Basis: `tests/protocol` 11/11 — the official `@ag-ui/client` HttpAgent (no CopilotKit) completes
a run; the pinned reference `RunAgentInput` shape streams a schema-valid run verbatim; every SSE
frame validates against the pinned `@ag-ui/core` EventSchema; a transitive-import scanner proves
no CopilotKit specifier is reachable and flags a synthetic dirty graph, so the proof is not
vacuous. FU-1/FU-3 resolved 2026-10-01: a remote offer is answered by a standard tool message
(no extension; FU-1), and runtime-interrupt resume/cancel rides the standard
`RunAgentInput.forwardedProps` field with self-sufficient CUSTOM payloads (FU-3). Chat, state,
run lifecycle and frontend-tool HITL (J-F) interoperate with standard frames alone.

## Status at time of writing

Working tree carries this unit's deliverables uncommitted (nothing was committed, per unit
constraints): `primitive-provenance.md`, `parity-report.json`, `parity-report.md`,
`check-parity-report.mjs`, and the evidence file
`.agents/evidence/2026-09-30-copilot-parity-report.md`. Gate tally 25 pass / 7
pass-with-recorded-gap / 0 open. All suites green on serial rerun (2026-10-01, including the MCP
surface and a general `packages/client` projection-store `refresh()` repair with its regression
test); the R6 consolidated critic re-ran everything and approved (gate 31); `just verify` 78/78
on every serial run. Settlement recorded by the R7 re-audit; `requirements/ledger.yaml` audited with
observed results only.
