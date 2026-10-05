# CopilotKit reconstruction — R4 structural visual parity (gates 20–21) — 2026-09-30

Environment: Node v26.8.2 (capture/compare drivers — Playwright's browser dies under Bun,
matching the reference harness's recorded constraint), Bun for the app server and the journey
suite, Linux (WSL2). Scope: `validation/reconstructions/copilot/` — the Cognate-side captures,
`diffs/` triptychs, and dispositions for plan §R4. The reference stack was NOT booted; the 31
reference screenshots under `reference/screenshots/` already existed and were read-only inputs.

| Command | Exit | Observed result |
| --- | --- | --- |
| `cd validation/reconstructions/copilot/cognate && bun run typecheck` | 0 | Clean after every edit (final tree included). |
| `cd validation/reconstructions/copilot/cognate && bun test test` | 0 | 11 pass, 0 fail, 196 `expect()` calls — the journey suite stayed green throughout. |
| `cd validation/reconstructions/copilot/capture && node capture.mjs` | 0 | 4 full runs (see below). Runs 1–3: 29 screenshots each; run 4 (final, after parity fixes): 29 screenshots + `capture-log.json`. Port 3190 verified free before each run; server data home wiped per run (`capture/.data`); server stopped by the driver. |
| `cd validation/reconstructions/copilot/capture && node compare.mjs` | 0 | 29 triptychs into `diffs/`, `diffs/summary.md` (29 shared rows, 2 reference-only rows, 0 Cognate-only), per-journey desktop/mobile coverage table. |

## Capture runs (all four reported, per the re-run rule)

1. Run 1 (first full pass): 29 shots; J-E pending capture missed (4 attempts each for J-E-01/J-E-03).
2. Run 2 (after fixes F1–F3): 29 shots; J-E pending still missed.
3. Run 3 (after fixes F4–F5): 29 shots; J-E pending still missed.
4. Run 4 (final): 29 shots — the tree captured in `diffs/`. Both J-E pending checkpoints
   remained uncapturable on every run; both runs of every failed attempt are implied by the
   driver's logged attempts (4 per checkpoint per run).

## What was built

- **Surfaces wired** (`cognate/src/**`): `server.ts` registers the remaining journey agents
  (J-D…J-K, exactly as `remaining-journeys.ts` defines and the suite tests them) and their
  public projections (controlled-rendering, declarative-catalog, rich-thread) in the served
  runtime; `ui/App.tsx` grows navigation views 04–09 mounting `AgentContextSurface`,
  `ControlledRenderingSurface`, `ToolDecisionSurface`, `RuntimeInterruptSurface`,
  `DeclarativeUiSurface` and the composed `ui/RichThreadView.tsx` (thread list / new thread /
  switch back driven from durable projections + `RichThreadSurface`). Journey constants moved
  to `constants.ts` (re-exported from `remaining-journeys.ts`) so browser surfaces never import
  the server-side module. No agent, projection, or test semantics changed; optional
  `threadId` props added to `ControlledRenderingSurface` and `SharedStateSurface` default to
  prior behavior.
- **Capture driver** (`capture/capture.mjs`): node + repo-root Playwright (same resolution as
  `reference/harness.mjs`), spawns `bun src/server.ts` on port 3190 with a fresh data home,
  drives every reference checkpoint state, names PNGs to mirror the reference
  (`cognate/screenshots/J-*.png`), desktop 1440×900 and mobile 390×844, both at
  deviceScaleFactor 2 with `reducedMotion: "reduce"` and `animations: "disabled"` — the
  reference harness's exact viewport/scale settings (reference PNGs measure 2880×1800 /
  780×1688; Cognate captures match).
- **Comparison** (`capture/compare.mjs`): pngjs + pixelmatch from repo-root node_modules;
  reference | Cognate | pixel-diff triptychs into `diffs/`, plus `diffs/summary.md` and
  `diffs/DISPOSITIONS.md`.

## Settlement evidence

- Gate 20 (diffs + dispositions): `diffs/` holds one triptych per shared checkpoint (29); every
  visible structural divergence is fixed (F1–F5, re-captured) or a named deviation with
  rationale (D1–D13 in `diffs/DISPOSITIONS.md`); the two J-E pending checkpoints are
  reference-only rows with the reason recorded, never cited as parity evidence.
- Gate 21 (responsive equivalence): `diffs/summary.md` — J-A 2 desktop/1 mobile, J-C 4/1,
  J-E 3/1 (+2 reference-only desktop), J-F 4/1, J-H 2/1, J-J 8/1. Every journey with reference
  screenshots has at least one desktop and one mobile row.
- Not photographable (recorded, D7): the J-E pending fold is real and suite-proven
  (`cognate/test/J-E-controlled-rendering.test.tsx` asserts the prefix fold
  `{phase: "pending", renders: 1}`), but the deterministic run completes in ~5 ms while the
  streamed event channel's first delivery lands ~100 ms after StartRun (TCP-buffered), so every
  read the app itself issues returns the terminal fold. Verified with instrumented probes
  (0 event chunks observable pre-completion; first held ReadProjection at ~125 ms). The
  reference can photograph pending only because its mock LLM adds seconds of latency.

## Limits / what this unit does not prove

- Parity is structural, judged by reading the triptychs; the pixel percentages in
  `summary.md` are evidence only, with no threshold claimed.
- J-D and J-G have no reference screenshots (uncovered reference journeys), so no triptychs or
  dispositions exist for them; their surfaces are mounted and reachable (views 04 and 07) but
  were not captured.
- The reference's J-J-05/06 welcome-screen and J-J-07/08 byte-identical states are the
  reference's own OBSERVED_ABSENT post flow; Cognate's restored/list/new/switch-back states are
  genuine durable-state renders (deviations D9–D11 record the direction).
- `scripts/check-substrate.ts` shows a working-tree modification made by a concurrent session
  (install-skew check); this unit did not touch it and nothing was committed.
