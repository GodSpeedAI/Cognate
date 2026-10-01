# CopilotKit reconstruction — remaining work

**Anchor:** status revision 19, commit `79d1f35` — BLACK_BOX reference execution is established;
J-A and J-C are green on both sides of the evidence boundary. This plan sequences only what
remains. [copilot-reconstruction.md](copilot-reconstruction.md) keeps owning tranche
architecture (T0–T4); the normative phases and the 32 settlement gates live in
[the reconstruction prompt](../prompts/copilotkit-reconstruction-test.md).

## Where we stand

- **Reference execution:** `reference/harness.mjs` (`boot` → `run <J-A|J-C>`) is repeatable,
  self-healing and proven. Green captures: 8 screenshots, `logs/runs/J-A.json` and `J-C.json`
  with `ok:true`, zero run-scoped misses, wire archives under `logs/runs/run-req-*`.
- **Evidence classes:** matrix rows R-A01 and R-A02 are `BLACK_BOX_REFERENCE`; R-A04/A06/A07
  are `OFFICIAL_FIXTURE_REFERENCE`; everything else `DOCUMENTED_REFERENCE`.
- **Cognate side:** journeys J-A, J-B, J-C implemented and green; J-D, J-E, J-F, J-G, J-H,
  J-J, J-K modeled in the IDM catalog but unbuilt.
- **Open gates:** roughly 22 of 32. Missing artifacts: `diffs/`, `parity-report.md`,
  `parity-report.json`, `primitive-provenance.md`, and the `tests/protocol`, `tests/visual`,
  `tests/architecture` trees.

## Operating constraints (each was learned by an observed failure — do not re-learn)

1. **Exact-match prompts.** The mock runs with `requestTransform`, so llmock sets
   `useExactMatch`: a journey prompt must equal the fixture's `match.userMessage`
   **byte-for-byte**. An invented prompt is a MISS by design (recorded: `JA_EXIT=1`).
2. **Ports.** mock `4012`, injector `13361`, agent `8123`, UI `3000`. Never `4010` —
   `scripts/harness.ts` owns it and SIGKILLs occupants.
3. **Chaining and healing.** `boot && run` is safe (boot exits explicitly). `run` preflights
   all four services and cold-restarts the UI when the pinned Turbopack/CSS defect strikes
   (it has struck five times, including mid-session); expect 60–90 s heal windows.
4. **Playwright runs under node only.** Under Bun the browser dies before navigation.
5. **Evidence rules.** Never infer execution from the absence of an error; a failed capture is
   not evidence and must be excluded, not cited. Upgrade a matrix row's evidence class only
   from a green `ok:true` run or an official fixture. No paid endpoint is ever needed (Phase 1B).
6. **The reference app is byte-identical to the pin.** All normalization lives in
   `reference/aimock-server.mjs` (matching only); archived request bodies stay unaltered.
   Never `npx aimock`/`npx llmock` — unrelated npm packages.
7. **Commit discipline.** Stage explicit paths under `validation/reconstructions/copilot/` +
   `.agents/CURRENT_STATUS.*` only; a concurrent session owns `deepseek-harness`,
   `justfile`, `scripts/harness.ts`. Check for `.git/index.lock` before committing.
8. **Status discipline.** Append snapshots with the scripted parser only (line-anchored
   edits corrupted revision 18). The Markdown view must embed the latest YAML `summary`
   verbatim after `**Summary:** ` or `just check` fails.


## ~~R1 — Reference captures for the remaining journeys (Phase 6 completion)~~ — DONE 2026-09-30 (rev 24): 6 GREEN journeys + 3 recorded UNCOVERED (J-D/J-G/J-K), 31 reference shots, zero run-scoped misses; see `reference-manifest.json` journeyCoverage

Extend `harness.mjs` `JOURNEYS` with one entry per canonical journey, each sending the
fixture-declared prompt (constraint 1). Candidate fixtures already inventoried under
`showcase/aimock/{d4,d6}/langgraph-typescript/` and `shared/`:

| Journey | Fixture columns to drive |
| --- | --- |
| J-D agent context | `agent-config.json` |
| J-E controlled GenUI | `gen-ui-custom`, `gen-ui-tool-based`, `gen-ui-agent` |
| J-F tool HITL | `hitl-in-chat`, `hitl-in-app`; d4 scheduleTime prompt "30-minute meeting with CopilotKit" |
| J-G interrupt | `interrupt-headless`, `gen-ui-interrupt` |
| J-H declarative A2UI / open-ended | `gen-ui-declarative`, `render-a2ui`, `a2ui-recovery`, `mcp-apps`, `gen-ui-open` |
| J-J rich thread | `threadid-frontend-tool-roundtrip`, `headless-complete` |
| J-K live recovery | `headless-simple`, re-run/reconnect flow |

~~**Acceptance:** each journey `ok:true` with zero run-scoped misses, shots at desktop~~
~~1440×900@2x and mobile 390×844 in `reference/screenshots/`, run report in `logs/runs/`.~~
~~Journeys whose fixtures cannot express the scenario record that fact in the manifest instead~~
~~of a synthetic prompt — uncovered behavior is a legitimate result.~~

## ~~R2 — Cognate-side journeys (Phases 7–9)~~ — DONE 2026-09-30 (rev 24): 11 settlement-evidence tests across 10 files, one per catalog journey, all composed from general primitives

Implement J-D … J-K against Cognate primitives following the T0–T4 tranche order in
[copilot-reconstruction.md](copilot-reconstruction.md) (GenUI/HITL questions belong to T3).
Every journey test is named after its catalog ID and asserts **settlement evidence** — durable
events/projections, never React-local state.

~~**Acceptance:** `bun test validation/reconstructions/copilot/cognate/test/` green with one~~
~~test per catalog journey. If a behavior cannot compose from general primitives, stop and~~
~~write the architectural counterexample from the prompt's "Failure Is Valuable" section -~~
~~a failed settlement is a valid result; a CopilotKit-specific kernel primitive is not.~~

## ~~R3 — Protocol, state and purity suites (Phases 10, 12, 13, 14)~~ — DONE 2026-10-01 (rev 25): `tests/protocol` 11/0, `tests/persistence` 5/0 (restart, SIGKILL crash, rebuild, cognitive non-authority), `tests/architecture` 45/0 (purity + gate-23 reference-removed); evidence in `.agents/evidence/2026-09-30-copilot-{protocol-suite,architecture-purity,persistence-suite}.md`; gate command documented in each tree's README

Create `tests/protocol` (AG-UI interop with no CopilotKit present), `tests/architecture`
(no CopilotKit import reachable from `packages/`; no kernel primitive named for the
reference; cognitive outputs never authoritative), and the state-evidence checks
(restart/replay survive, projections rebuild).

~~**Acceptance:** the three trees run under `just verify` or a documented gate command;~~
~~evidence recorded in `.agents/evidence/`.~~

## ~~R4: Structural Visual Parity (Phase 11, gates 20-21)~~ — DONE 2026-10-01 (rev 25): 29 triptychs in `diffs/`, 5 divergences fixed (F1–F5), 13 named deviations (D1–D13), 2 reference-only checkpoints justified (D7); desktop+mobile rows for every journey with reference shots; critic-audited image pass

For every journey that has a reference screenshot:

1. Capture the Cognate screen at the same fixed viewports as the reference.
2. Generate side-by-side comparisons in `diffs/`.
3. Resolve each visible structural divergence one of two ways:
   - Fix it.
   - Record it as a named deviation with a rationale.

**Scope:** Match structure (layout, hierarchy, spacing, component placement). Do not alter Cognate's visual identity.

~~**Acceptance:**~~
~~- `diffs/` contains a comparison for every stable reference screen.~~
~~- Every divergence has a disposition: fixed or named deviation.~~
~~- Responsive equivalence is demonstrated at both viewports.~~


## ~~R5 - Provenance and parity report (Phases 15-16 preconditions)~~ — DONE 2026-10-01 (rev 25): primitive-provenance.md 14/14 'Special case? No'; parity-report.json/.md with all 32 gates (23 pass / 8 pass-with-recorded-gap / 1 open) + check-parity-report.mjs exit 0 over 175 cited paths

- `primitive-provenance.md` - every P0/P1 matrix row mapped to the general Cognate primitive
  that implements it (gate 25).
- `parity-report.json` + `parity-report.md` - machine-readable then human report: all 32
  gates, each row's evidence class with artifact paths, open deviations, and the three
  completion-standard answers.

~~**Acceptance:** both files parse (`parity-report.json`), cite only artifacts that exist on~~
~~disk, and no gate claims hold without an executable check behind it.~~

## ~~R6 - Independent critic (Phase 16, gate 31)~~ — DONE 2026-10-01 (rev 26): consolidated independent critic re-ran every gate from the artifacts alone (all suites serial green, 31/31 images systematic, 32-gate audit, completion standard concurred) — VERDICT: APPROVE, no R-block reopens; verdict recorded at `.agents/evidence/2026-10-01-copilot-r6-critic.md` (the five per-unit critic approvals preceded it)

An independent pass re-runs the gates from the artifacts alone: verify every cited path,
re-run the journey suites, and perform the systematic visual diff (image reads are
available - one was used in revision 19 - but the pass must be systematic, not spot checks).

~~**Acceptance:** critic verdict recorded in `.agents/`; any failed citation reopens the~~
~~owning R-block.~~

## ~~R7 - Settlement re-audit and closure~~ — DONE 2026-10-01 (rev 26): gates 31/32 closed on the critic's evidence; critic findings applied (D14 + stale-line fixes); ledger audited, no entry contradicted so no edit required; settlement revision 26 recorded

Re-enumerate the 32 gates from the prompt, attach evidence per gate, update
`requirements/ledger.yaml` only with observed results, and record the final status revision.

~~**Definition of done:** all applicable gates hold, `parity-report.md` answers **yes** to all~~
~~three completion-standard questions, `just verify` is green, and the DeepSeek Harness~~
~~regression (21 tests) still passes.~~

Observed (rev 26): 25 pass / 7 pass-with-recorded-gap / 0 open; all three answers **yes**;
`just verify` 78/78; DeepSeek Harness regression 37 pass / 0 fail (the plan's 21-test figure
predates that suite's growth — observed reality recorded in the settlement revision).

## Suggested order and dependency notes

```
R1 (reference captures) --+--> R4 (visual parity needs both sides' shots)
R2 (cognate journeys)   --+
R2 --> R3 (protocol/purity suites assert the built surface)
R1+R2+R3+R4 --> R5 (provenance + parity report) --> R6 (critic) --> R7 (closure)
```

R1 and R2 can proceed in parallel; R1 is cheaper per journey (harness entry + one capture)
and should go first so reference behavior is characterized before each implementation -
the same "pinned observation precedes implementation" rule as the tranche plan.

## Standing risks

- The pinned Turbopack/CSS defect can strike any capture; the self-heal absorbs it, but a
  capture that silently burns every timeout should be treated as a broken page, not a broken
  reference.
- Fixtures may not cover every scenario (MCP Apps, open-ended UI); uncovered rows stay
  `DOCUMENTED_REFERENCE` with the gap named - never simulated.
- The concurrent deepseek session shares this worktree; coordinate before touching
  `justfile`, `scripts/harness.ts`, or port 4010.
- The IDE-server/daemon tools shadow coreutils on this machine (`od`, `npx` targets); prefer
  `node -e` and `grep` for byte-level checks.
