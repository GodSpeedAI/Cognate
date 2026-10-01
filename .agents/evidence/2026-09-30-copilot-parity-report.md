# CopilotKit reconstruction — R5 primitive provenance + parity report (gates 1–32 groundwork) — 2026-09-30

Environment: Bun 1.4.0 for the suites, Node v26 for `node -e` gate checks and the report checker,
Linux (WSL2). Scope: `validation/reconstructions/copilot/` only — the four R5 deliverables plus
this evidence file. Nothing else was modified: no tests, no cognate source, no diffs, no
reference artifacts, no packages, no justfile, no ledger. The reference stack was NOT booted; no
port in the 4010/4012/13361/8123/3000 range was touched; no npx aimock/llmock was run.

## Deliverables

| Path | Content |
| --- | --- |
| `validation/reconstructions/copilot/primitive-provenance.md` | All 14 P0/P1 matrix rows (R-A01..R-A14) mapped to general Cognate primitives with real code citations; 14/14 rows `Special case? No`; §2 records why (C1/C2/A1 domain-general repairs); §3 records the honesty notes. |
| `validation/reconstructions/copilot/parity-report.json` | Machine-readable report: reference block, evidence-class definitions, 14 matrix rows (evidence classes, reference/cognate evidence paths, test IDs, statuses), all 32 gates with `check.command` + observed result, 15 open-deviation entries (D1–D13 + the two D7 reference-only checkpoints), 6 follow-ups, completion standard q1/q2/q3, observed-runs record. |
| `validation/reconstructions/copilot/parity-report.md` | Human report: same content; every gate row shows status + evidence + the executable check; the three completion questions answered with basis; per-suite observed tails. |
| `validation/reconstructions/copilot/check-parity-report.mjs` | Validity checker (Node, no deps): parses the JSON, verifies every cited path exists against the repo root, all 32 gates present with known statuses, non-empty `check.command`/`check.observed` behind every non-open gate, 14 matrix rows, completion answers, D1–D13 carried. Exits 0/1 with messages. |

## Observed runs (all first-attempt green; no rerun provision was exercised)

| Command | Exit | Observed result |
| --- | --- | --- |
| `node validation/reconstructions/copilot/check-parity-report.mjs` | 0 | Parsed; **174 cited artifact paths verified** against the repo root; 32 gates present with statuses; executable checks behind every non-open gate; 14 matrix rows; completion standard answered; D1–D13 carried. |
| `cd validation/reconstructions/copilot/cognate && bun test test` | 0 | 11 pass / 0 fail, 196 `expect()` calls, 10 files [1189.00ms]. |
| `cd validation/reconstructions/copilot && bun test tests/protocol/` | 0 | 11 pass / 0 fail, 148 `expect()` calls, 2 files [947.00ms]. |
| `cd validation/reconstructions/copilot && bun test tests/persistence/` | 0 | 5 pass / 0 fail, 166 `expect()` calls, 3 files [1311.00ms]. |
| `cd validation/reconstructions/copilot && bun test tests/architecture/` | 0 | **45 pass / 0 fail**, 132 `expect()` calls, 9 files [7.51s] — including the live reference-removed run (checkout renamed aside, journey suite 11/11 and inner architecture run green without it, restore asserted). `tests/architecture/reference-removed.log` additionally records 4 prior complete runs (2026-10-01 03:56–04:25), each exit 0 with restore confirmed. |
| `COPILOT_ARCH_SKIP_REFERENCE_REMOVED=1 bun test tests/architecture/` | 0 | 44 pass / 1 skip / 0 fail, 45 tests [14.46s] (skip-flag variant, run first under concurrent critic load). |
| `just verify` | 0 | **78/78 gates pass** — first attempt, serial run; the known concurrent-load flake did not occur, so the one-clean-rerun rule was never needed. Includes CG-PRF-002 (Copilot profile acceptance behaviors). |

Per-gate `check.command`s were also executed individually while writing the report (node one-liners
over the manifest/run reports, single-file journey tests, single architecture test files); their
observed outputs are recorded verbatim in `parity-report.json` `gates[].check.observed`.

## Gate status tally (32)

- **pass (23):** 1, 2, 5, 6, 7, 8, 9, 11, 12, 14, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30
- **pass-with-recorded-gap (7):** 3 (R-A06 arg-chunk re-render gap), 4 (R-A13/R-A14 gaps), 10
  (reference side OFFICIAL_FIXTURE_REFERENCE; starter mounts no useAgentContext — J-D UNCOVERED),
  15 (reference side DOCUMENTED_REFERENCE; no interrupt node at the pin — J-G UNCOVERED),
  16 (management mutations unimplemented; reference restoration OBSERVED_ABSENT),
  18 (popup unexecuted both sides; sidebar chrome = D2/D13), 32 (no fail/open rows; settlement
  awaits gate 31)
- **open (2):** 13 (no MCP-app/open-GenUI surface executed or built on either side; fixtures
  exist, so a scope/executable-surface gap — followUp FU-2), 31 (R6 independent critic verdict
  pending)

## Completion standard (from evidence on disk)

- **Q1: no (not yet).** Every executed surface is demonstrated (11/11 journey tests, 29
  structural-parity triptychs, F1–F5 fixed / D1–D13 named); the MCP App / open-ended GenUI
  surface is not (gate 13 open, FU-2).
- **Q2: yes.** 14/14 provenance rows `Special case? No`; C1/C2 repairs are domain-general
  (`architectural-counterexamples.md`); `tests/architecture/kernel-primitives.test.ts` 3/3.
- **Q3: yes.** `tests/protocol` 11/11 (official HttpAgent, pinned RunAgentInput verbatim,
  non-vacuous purity scanner); recorded caveat FU-1/FU-3 on two extension-resolved paths.

## Honesty tensions resolved

1. **Gate 3 could not be a bare pass** once R-A06 was recorded as pass-with-recorded-gap; gate 3
   was set to pass-with-recorded-gap with a check that asserts no P0 row is open/fail (the initial
   draft's inconsistent observed text was corrected before the checker ran).
2. **Gates 10/15/18** record which side is which: the cognate side passes its executable check;
   the reference side carries its recorded evidence class (OFFICIAL_FIXTURE_REFERENCE /
   DOCUMENTED_REFERENCE / unexecuted popup) — never a bare pass over an UNCOVERED reference side.
3. **Gate 13 is open, not pass-with-recorded-gap**: the MCP fixtures exist, so the gap is not a
   fixture impossibility; nothing on either side was executed, and "open" says exactly that.
4. **R-A08/R-A09/R-A11/R-A12 evidence-class upgrades** (matrix rows still marked
   DOCUMENTED_REFERENCE there) were taken only from green `ok:true` run reports recorded in the
   manifest (J-E/J-F/J-H/J-J), per the upgrade discipline; each upgrade names its run report.
5. **R-A13/R-A14 gaps** name what is missing on BOTH sides rather than simulating rename/archive/
   delete or popup chrome.

## Follow-ups recorded (parity-report.json `followUps`)

FU-1 remote-offer toolCallId gap (packages/ag-ui/src/index.ts:264 vs packages/runtime-bun/src/executor.ts:345;
standard tool-message resolve → RUN_ERROR not_found; forwardedProps.cognate.resolve works; found
by tests/protocol, confirmed by its critic) · FU-2 MCP surface · FU-3 interrupt resolution needs
the cognate extension · FU-4 gate-31 critic pending · FU-5 R-A13 mutations · FU-6 D7 pending-state
photography.
