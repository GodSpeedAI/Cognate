# actualize/evidence/fidelity-qa — landing page fidelity evidence

## Overview
Holds the measured fidelity evidence for the Cognate landing site: full-page screenshots at five widths, the exploded-view forward/backward stills with their diff summary, the iteration narrative, and the measurement program that produced the numbers. Measurement is read-only against `landing/`, so nothing here can change the site.

## Subdirectories & Boundaries
- `measure`: [./measure/EGM.md](./measure/EGM.md) — the Playwright measurement script, its JSON results and hold screenshot
- `exploded/` — forward/backward stills per scroll unit at two viewports, `measure.json`, `diff-summary.json`, `iterations.md`

## Global Invariants
- Screenshots live beside the prose that explains them; `iterations.md` records which gate commands were run and their exit codes rather than asserting cleanliness `[actualize/evidence/fidelity-qa/iterations.md:Gate results (final)]`
- Deviations from the creative direction are named with the reason and the measured ratio, not silently accepted `[actualize/evidence/fidelity-qa/iterations.md:Contrast fixes (axe color-contrast, serious)]`
- Exploded-view parity is judged as max channel delta and differing pixel count per unit, per viewport, in a machine-readable summary `[actualize/evidence/fidelity-qa/exploded/diff-summary.json:maxDelta]`
- Iterations are recorded as a changelog of what was changed and what remained open, so an unresolved diff stays visible `[actualize/evidence/fidelity-qa/exploded/iterations.md:Iteration 3: layer step 260, cartridges above plates]`

## Global Side Effects
- The measurement script creates its output directory and rewrites `results.json` on every run `[actualize/evidence/fidelity-qa/measure/measure.ts:mkdirSync]`
- The serve log records the exact served origin, which the measurement script hardcodes as its base `[actualize/evidence/fidelity-qa/measure-serve.log:1]`

## Verification
- Run: `bun run check`
