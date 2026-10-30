# actualize — design and creative pipeline workbench

## Overview
A run-scoped workbench holding one closed Product Actualizer run for the Cognate repositioning. It carries no TypeScript of its own; it holds the run ledger, the per-lens artifacts and evidence directories, and the model history. The only executable code in the tree is the fidelity QA measurement script under `evidence/fidelity-qa/measure/`.

## Subdirectories & Boundaries
- `artifacts/` — per-lens deliverables (brand, direction, experience, fidelity-qa, illustration, marketing, motion-editorial, provenance-licensing, release-readiness)
- `evidence/`: [./evidence/EGM.md](./evidence/EGM.md) — per-lens evidence: prose, logs and committed screenshots
- `.state/` — base copies of the model and proposals used to seed the run
- `history/` — model snapshots v1 through v7
- `COMPLETION-REPORT.md` — the run's own closing report
- `product-model.md`, `proposals.md`, `state.json`, `.log.jsonl` — model prose, proposals, run ledger, run log

## Global Invariants
- The run is closed: `active` is false, `phase` is `idle`, `verdict` is `go-with-exception`, and `modelVersion` is 7 `[actualize/state.json:verdict]`
- Lens selection is explicit and records why non-applicable lenses are excluded (physical, electronics, embedded-systems, robotics, product-visualization, audio-sound, legacy-modernization) `[actualize/state.json:selection.excluded]`
- Lenses run in three recorded waves, so evidence for a later wave presumes the earlier ones `[actualize/state.json:selection.waves]`
- Each lens carries a completion count on the ledger `[actualize/state.json:completed]`
- The run's own report records what it did not finish, including merge/push, host and public URL, and a waiver list `[actualize/COMPLETION-REPORT.md:Remaining limitations and blockers (owner-only)]`

## Global Side Effects
- The fidelity QA script writes `results.json` and `hold-1440.png` into its own directory `[actualize/evidence/fidelity-qa/measure/measure.ts:OUT]`
- The landing site's screenshot script writes PNGs into this tree `[landing/scripts/shots.ts:outDir]`
- Screenshot evidence committed here is roughly 31 MB, flagged for pruning `[actualize/COMPLETION-REPORT.md:Remaining limitations and blockers (owner-only)]`

## Verification
- Run: `bun run check`
