# CopilotKit reconstruction — R6 independent critic verdict (settlement gate 31)

- **Date:** 2026-10-01
- **Critic:** independent (not involved in building any R-block; the five per-unit critics' approvals are separate, earlier records)
- **Scope:** the single consolidated pass demanded by plan §R6 of
  [.agents/plans/copilot-reconstruction-remaining.md](../plans/copilot-reconstruction-remaining.md),
  against the 32 Settlement Gates, evidence classes and Completion Standard of
  [.agents/prompts/copilotkit-reconstruction-test.md](../prompts/copilotkit-reconstruction-test.md).
- **Method:** re-ran every documented gate command from the artifacts alone (serially), verified
  cited paths (checker + independent sample), performed the systematic visual pass over **all**
  triptychs (no spot-checking), audited all 32 gates and the three completion-standard answers,
  and audited working-tree scope. Read-only except this file. The reference stack was never
  booted; no screenshots were re-captured; no existing file was modified.

## 1. Programme results (command → observed tail)

| # | Command | Observed (this critic's run) | Report's recorded value |
|---|---|---|---|
| 1 | `cd validation/reconstructions/copilot/cognate && bun test test` | **12 pass / 0 fail**, 239 expect() calls, 11 files [2.38s] | "11 pass / 0 fail … 10 files" (stale row; the report's own Q1 text says 12/12 — the J-H-open-ended-mcp test postdates the table) |
| 2 | `cd …/cognate && bun run typecheck` | exit 0 (`tsc -p tsconfig.json`) | exit 0 |
| 3 | `cd validation/reconstructions/copilot && bun test tests/protocol/` | **11 pass / 0 fail**, 148 expect() calls, 2 files [1323ms] | 11/0 ✓ |
| 4 | `cd … && bun test tests/persistence/` | **5 pass / 0 fail**, 166 expect() calls, 3 files [1333ms] | 5/0 ✓ |
| 5 | `cd … && bun test tests/architecture/` | **45 pass / 0 fail**, 134 expect() calls, 9 files [31.17s], incl. the live gate-23 reference-removed rename/restore cycle | 45/0 ✓ |
| 6 | post-architecture on-disk check | `.tmp/ref/copilotkit` exists; **no** `.tmp/ref/.copilotkit-ref-stash` remains | ✓ (log tail also records "reference restored: … exists=true" and an inner run 41 pass / 2 skip / 0 fail) |
| 7 | `node validation/reconstructions/copilot/check-parity-report.mjs` | exit 0 — "checked **175** cited artifact paths … 32 gates present with statuses; executable checks behind every non-open gate; 14 matrix rows; completion standard answered" | "174 cited paths" (stale count; the plan's 175 figure matches today's tree) |
| 8 | `cd validation/reconstructions/deepseek-harness && bun test cognate/test` | **37 pass / 0 fail**, 253 expect() calls, 17 files [18.35s] | plan heading says 37 (the older "21 tests" figure in R7's DoD predates that suite's growth — 37 is observed reality) |
| 9 | `just verify` (run LAST, alone) | **78/78 gates pass**, first attempt, serial — the known concurrent-load flake did not occur; no rerun needed | 78/78 ✓ |

No suite failed on any attempt; the "re-run once cleanly" provision was never exercised.

## 2. Cited-path verification

- Checker: 175/175 cited paths exist (reference.manifest, matrixRows evidence, gates evidence,
  followUps evidence).
- Independent sample (11 paths, deterministic-random across kinds, checked on disk by this
  critic): screenshot (`reference/screenshots/J-C-04-…png`, 231452B), run report
  (`reference/logs/runs/J-C.json`), test file (`packages/ag-ui/test/reconnect.test.ts`), evidence
  file (`.agents/evidence/2026-10-01-copilot-mcp-open-ended.md`), docs
  (`primitive-provenance.md`, `architectural-counterexamples.md`), JSON
  (`reference/logs/runs/run-req-J-C-02.json`), source
  (`cognate/test/J-B-front-capability.test.tsx`, `packages/runtime-bun/src/executor.ts`), diff
  (`diffs/DISPOSITIONS.md`), reference-side (`reference/logs/runs/J-D.json`). **11/11 exist.**
- Gate-check commands re-executed for the reference-side observations: `J-C ok:true 16 hits 0
  misses`, `J-E ok:true 8/0`, `J-H ok:true 6/0`, `J-F ok:true 4/0`, `J-J ok:true 12/0` with
  `postMetrics.threadListRequests: 0` (gate 16's OBSERVED_ABSENT basis) — all match the report.

## 3. Systematic visual pass (29 triptychs + 2 reference-only; all read, no spot checks)

Every PNG in `diffs/*.png` (29) plus `reference/screenshots/J-E-01-controlled-genui-pending-…png`
and `J-E-03-backend-tool-pending-…png` was read. Structural correspondence holds in every
triptych: the same affordances exist on both sides (composer+send/stop, message turns, HITL
pending/resolved cards, thread list, restore, layouts, desktop+mobile).

Dispositions confirmed against what is actually visible:

- **Fixed F1–F5 confirmed in the re-captures:** J-J-05/06/07/08 heads span the grid (F1); the
  threads disclosure sits below the actions row (F2); restored threads show no spurious
  empty-state box (F3); J-E-02/J-E-04/J-J-02 render the run's answer with the card (F4); J-F-03
  renders "Meeting scheduled — slot 10:30 accepted…" (F5).
- **Named deviations D1–D13 confirmed:** D1 brand, D2 sidebar vs journey tabs, D3 pills vs
  labeled controls (including the persisted-pill checkpoints J-A-02, J-C-01/04/05, J-E-02/05,
  J-F-03/04, J-H-01/02), D4 fixture copy, D5 ledger vs card board, D6 chart bodies vs
  catalog scalars, D8 (J-F-02 compares different run phases exactly as described), D9/D10/D11
  (J-J-05/06/07/08: reference welcome/loading-threads/byte-identical welcome screens vs Cognate's
  genuine restored/listed states), D12 composition placement, D13 affordance regions. D7's
  reference-only J-E-01/J-E-03 are the only uncaptured checkpoints and their reason is recorded.
- **Un-dispositioned divergence found (1, minor):** the reference's per-message copy/tool action
  icons (visible beneath assistant messages on mobile checkpoints J-A-02, J-C-05, J-E-05, J-F-04,
  J-H-02, J-J-04) have no Cognate counterpart and are not named in `DISPOSITIONS.md`. Peripheral
  (mobile-only, P2-class affordance; no P0/P1 behavior depends on it), and within the spirit of
  D13 ("affordance regions differ") but not its letter. Recommendation: record a D14 line during
  R7. Not a gate-20 blocker under the P0/P1-settle rule.

## 4. Gate-by-gate verdict (32)

1 pass — pin verified: manifest commit `6e452e5…` matches the check; integrity rests on the
  recorded GitHub-commit-tarball `checkout.archiveCommit` (immutable by construction) [note 4].
2 pass — selectedSurfaces are current consolidated examples (langgraph-js integration, generative-ui
  showcase, react-core v2), not legacy v1/v2.
3 pwr-g — honest: no P0 row fails/opens; R-A06 carries its recorded gap (adapter-level arg
  streaming proven; browser per-chunk re-render absent, D7).
4 pwr-g — honest: no P1 row fails/opens; R-A13/R-A14 gaps named.
5 pass — 29 triptychs on disk (recounted).
6 pass — re-ran: 12/0 (recorded "11 pass" predates the 12th test [minor 2]).
7 pass — J-C ok:true 16/0 re-verified; J-B test green.
8 pass — J-E ok:true 8/0 re-verified; J-E test green.
9 pass — `run-req-J-C-02.json` carries the canvas-written "New Todo" on the wire; J-C test green.
10 pwr-g — honest side-attribution: cognate J-D test green; reference OFFICIAL_FIXTURE_REFERENCE
  (starter mounts no useAgentContext; UNCOVERED recorded, not synthesized).
11 pass — same compound as gate 8, re-verified.
12 pass — J-H ok:true 6/0 re-verified; J-H declarative test green.
13 pwr-g (JSON/table/closing tally; the MD prose line saying "open" is stale [minor 1]) — honest:
  cognate MCP surface proven end-to-end (J-H-open-ended-mcp 1 pass/0 fail/43 expect, re-run in
  suite); reference leg DOCUMENTED_REFERENCE with the missing mechanism named
  (`mcp.excalidraw.com`, no local mock in the pin — manifest `openEndedUncovered`); never simulated.
14 pass — J-F ok:true 4/0 re-verified; J-F test green.
15 pwr-g — honest: cognate interrupt test green (distinct from tool-result); the pinned reference
  graph registers no interrupt node (J-G UNCOVERED, DOCUMENTED_REFERENCE named).
16 pwr-g — honest: cognate create/switch/restore green; `postMetrics.threadListRequests: 0`
  re-verified; management mutations unimplemented both sides (FU-5).
17 pass — J-J test green (replay without reauthorizing the offer); reference side honestly
  recorded as unable to restore (D9).
18 pwr-g — honest: popup unexecuted on both sides; sidebar chrome is D2/D13; D1..D13 present.
19 pass — protocol suite re-ran 11/0; non-vacuous (synthetic dirty graph flagged by the scanner).
20 pass — 29 triptychs; 13 named + 5 fixed dispositions verified in the image pass; one
  peripheral micro-gap noted [minor 3].
21 pass — 6 journeys each with desktop+mobile rows (summary table re-read).
22 pass — no-copilotkit-dependency + no-reference-imports green in the architecture run.
23 pass — 45/45 incl. the live rename/restore; post-run `.tmp/ref/copilotkit` present, no stash;
  log records prior green runs with restore asserted.
24 pass — kernel-primitives 3/0 in the architecture run; no reference-named primitive.
25 pass — 14/14 provenance rows "Special case? No"; 3 cited code paths spot-opened and confirmed
  (§5).
26 pass — sea-unchanged 4/0 in the architecture run (porcelain/diff empty for .sea,
  domainforge, realitytrace).
27 pass — domainforge-realitytrace-unchanged 5/0; 0.18.2 pin intact.
28 pass — same file, realitytrace leg.
29 pass — persistence suite re-ran 5/0 (delete index → restart → rebuild → retrieval returns;
  as-built no-index case).
30 pass — `just verify` re-ran alone: 78/78, first attempt.
31 open — correct; this file is the gate-31 evidence of record.
32 pwr-g — honest: no matrix row fails/opens; settlement still awaits gate 31 (this verdict) and
  the R7 re-audit.

No gate claims a bare pass where its cited evidence shows a gap. The two side-attribution
families (10/13/15/16/18) consistently attribute the passing executable check to the cognate side
and carry the reference side's recorded class with the missing mechanism named.

## 5. Completion-standard audit

- **Q1 (yes) — concurred.** The prompt's own rules decide this: Journey I prescribes "an isolated
  deterministic MCP fixture rather than an external service for automated tests", and
  DOCUMENTED_REFERENCE is the mandated class for behavior not executable without unavailable
  external infrastructure, with the missing mechanism named. The reconstruction proves the
  open-ended MCP surface end-to-end on that prescribed fixture; the pinned reference cannot
  execute its own MCP surface locally (external `mcp.excalidraw.com`, no local mock — manifest
  `openEndedUncovered`), so interface parity for that one surface rests on the pin's own source
  (`MCPAppsActivityRenderer` sandboxed iframe), carried as DOCUMENTED_REFERENCE, never simulated.
  That is the evidence-class system applied as designed, and the caveat is recorded (gate 13
  pass-with-recorded-gap, FU-2). Every other Objective-list interaction has executed evidence on
  both sides or an honestly recorded UNCOVERED with its reason. "Yes" is the honest answer; it
  must not regress to "no".
- **Q2 (yes) — concurred.** 14/14 rows end `Special case? No`. Spot-opened three cited code
  paths and each matches its claim and is domain-general: `packages/runtime-bun/src/executor.ts:345`
  (`wait:remote:` durable wait, availability checked only before durable selection);
  `packages/runtime-api/src/frontend.ts` (`invokeFrontend` → `frontend:<capability>` typed
  `ctx.waitFor`, generic continuation); `packages/runtime-api/src/state.ts` (`StatePatchError`
  + JSON-pointer CAS fold). `kernel-primitives.test.ts` 3/0 in the re-run architecture suite.
- **Q3 (yes) — concurred.** Protocol suite re-ran 11/0; official HttpAgent run without
  CopilotKit; pinned RunAgentInput verbatim; schema-validated SSE frames; the purity scanner is
  proven non-vacuous (flags a synthetic `@copilotkit/react-ui` import and a
  `copilotkit-helper.ts` path). FU-1/FU-3 (two resolution paths needing the
  `forwardedProps.cognate` extension) are disclosed, not hidden.

## 6. Scope/purity audit

`git status --porcelain` from repo root, HEAD `365a86d` (no commits made), branch
`cognate/harness`. Every modified/untracked path accounted:

- `.agents/CURRENT_STATUS.{md,yaml}`, `.agents/plans/copilot-reconstruction-remaining.md`
  (struck R-blocks) — status/plan discipline.
- `.agents/evidence/` — six new builder-critic evidence files.
- `bun.lock` — delta is exactly `@modelcontextprotocol/sdk 1.30.1` + `zod 3.25.76` (the cognate
  app's new deps; MCP SDK is protocol-only and permitted).
- `scripts/check-substrate.ts` — install-skew guard only (declared footprint).
- `packages/client/src/index.ts` + `packages/client/test/client.test.ts` — general
  projection-store `refresh()` repair (a fold can land after the event-scheduled read) with a
  25-line stub-based regression test; satisfies all four general-repair conditions; no changes
  under `packages/` beyond these two files.
- `validation/reconstructions/copilot/**` — the reconstruction tree (cognate src/package.json,
  capture/, diffs/, tests/, screenshots, reports, checker, manifest, provenance).
- Zero diff under `justfile`, `scripts/harness.ts`, `scripts/copilot.ts`, `.sea/`,
  `validation/reconstructions/copilot/reference/`, `validation/reconstructions/deepseek-harness/`.
- Reference checkout untouched at `.tmp/ref/copilotkit` (git-ignored area), restored after the
  gate-23 cycle.

## 7. Findings

1. **[minor] Stale prose tally in `parity-report.md`:** the "Statuses:" line under "Settlement
   gates (32)" reads "23 pass · 7 pass-with-recorded-gap · 2 open … open: 13, 31", contradicting
   the MD table, the JSON (gate 13 = pass-with-recorded-gap) and the report's own closing tally
   (23/8/1). R7 should correct that one line.
2. **[minor] Stale observed counts in the report's suite table:** cognate journeys "11 pass / 10
   files" (now 12/11 with the MCP test) and checker "174 cited paths" (now 175). Both were true
   when recorded; this critic's re-runs supersede them.
3. **[minor] Reference per-message copy/tool affordance icons** (mobile checkpoints) lack a
   Cognate counterpart and are not named in `DISPOSITIONS.md` (spirit of D13, not the letter).
   Peripheral/P2; recommend a D14 line at R7.
4. **[note] Gate-1 pin integrity** rests on the manifest's GitHub-commit-tarball
   `checkout.archiveCommit` (immutable by construction) rather than a live tree↔SHA
   re-verification; acceptable, recorded here.
5. **[note] Gate 30's `evidence` field cites `reference-manifest.json`** (odd but harmless; the
   check command is `just verify` and was re-run green).
6. **[note] D8's "byte-identical to Cognate's J-F-01" phrasing is imprecise** (the J-F-01
   cognate panel shows the slot card, J-F-02's shows the decision controls); the disposition's
   substance (different run phases compared; resolved phase compared at J-F-03) holds as
   observed.

## 8. Verdict

**VERDICT: APPROVE.** All re-runs green from the artifacts alone; 175/175 cited paths exist;
31/31 images reviewed with every structural divergence dispositioned (one peripheral micro-gap
noted for R7); all 32 gates' statuses consistent with their cited evidence; the completion
standard's three "yes" answers are honest under the prompt's evidence-class system; working-tree
scope is exactly the builders' declared footprint. Gates 3/4/10/13/15/16/18/32 correctly remain
pass-with-recorded-gap rather than bare passes; gate 31 is closed by this file. R7 (settlement
re-audit and closure) may proceed, incorporating findings 1–3 as one-line corrections.
