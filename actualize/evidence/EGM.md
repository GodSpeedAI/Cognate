# actualize/evidence — per-lens evidence

## Overview
One directory per completed lens: prose findings, command transcripts, and committed screenshots. Nothing here is executed by the repository's normal gates; it is cited evidence for the run's claims. The `fidelity-qa` subtree is the only part containing a program.

## Subdirectories & Boundaries
- `fidelity-qa`: [./fidelity-qa/EGM.md](./fidelity-qa/EGM.md) — screenshot, measurement and exploded-view evidence for the landing page
- `experience/` — onboarding evidence for the npm-only first build and the Refund Desk example
- `first-contact/` — cold-build report, comprehension test, persona red team
- `illustration/` — keyframe captures, an illustration census, and the keyframe iteration log
- `impeccable/` — five numbered design-pass notes
- `marketing/` — README content map
- `provenance-licensing/` — licence and provenance scan
- `recon-software/` — product/software reconstruction notes for Cognate core, Workbench, onboarding and external material
- `release-readiness/` — command transcripts, link inventory, placeholder scan, npm and skills logs

## Global Invariants
- Evidence is written as Markdown prose plus raw tool output; nothing in the lenses is imported by the workspace `[actualize/COMPLETION-REPORT.md:Verified (commands and results)]`
- The run reports its own verification numbers here rather than in the spec; 81/81 gates, typecheck exit 0, example tests, landing tests and e2e are listed as the verified set `[actualize/COMPLETION-REPORT.md:Verified (commands and results)]`
- Fidelity QA measurement writes into its own subdirectory instead of a shared temp location `[actualize/evidence/fidelity-qa/measure/measure.ts:OUT]`
- Landing screenshots are produced by the landing package and land in this tree, so the evidence is regenerable rather than hand-captured `[landing/scripts/shots.ts:outDir]`
- The static server used for measurement is recorded verbatim, including the served root and port `[actualize/evidence/fidelity-qa/measure-serve.log:1]`

## Global Side Effects
- Regenerating evidence overwrites committed PNGs in place `[landing/scripts/shots.ts:outDir]`
- The measurement run requires a live server at `http://127.0.0.1:4455` serving `landing/dist` `[actualize/evidence/fidelity-qa/measure/measure.ts:BASE]`

## Verification
- Run: `bun run check`
