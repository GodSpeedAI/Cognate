# validation/reconstructions/copilot — CopilotKit reconstruction

## Overview
An independent reconstruction of the pinned CopilotKit LangGraph-JS example, rebuilt as a Cognate application under `cognate/`. The tree holds the evidence that the rebuild is behaviorally and architecturally comparable: reference research notes, capture and comparison drivers, parity reports, and a purity test suite. It owns its own validity checker so the report's claims can be re-verified mechanically.

## Interface
- `check-parity-report.mjs` — the report validity checker; parses `parity-report.json` and asserts cited paths, gate statuses and matrix rows `[validation/reconstructions/copilot/check-parity-report.mjs:report]`
- `parity-report.json`, `parity-report.md` — the machine report and its prose rendering `[validation/reconstructions/copilot/parity-report.json:1]`
- `reference-manifest.json`, `reference-suite.md` — reference pin and the selected reference surfaces with their evidence state `[validation/reconstructions/copilot/reference-suite.md:1]`
- `DESIGN.md` — the reconstruction's own design system, declared authoritative for later refinement `[validation/reconstructions/copilot/DESIGN.md:1]`
- `primitive-provenance.md`, `architectural-counterexamples.md`, `PRODUCT.md` — provenance of each primitive, rejected architectures, product truth
- Subdirectories: [capture](./capture/EGM.md) — capture and comparison drivers, [reference](./reference/EGM.md) — reference boot and mock plumbing, [cognate](./cognate/EGM.md) — the reconstruction app
- `tests/` — architecture/persistence/protocol suites, `diffs/` — triptychs and dispositions, `.sea/` — the interaction model

## Invariants
- Every gate status is one of `pass`, `pass-with-recorded-gap` or `open`; only `open` gates may omit an executable check `[validation/reconstructions/copilot/check-parity-report.mjs:KNOWN_STATUS]`
- All 32 settlement gates must be present exactly once and the 14 P0/P1 matrix rows must have known priority and status `[validation/reconstructions/copilot/check-parity-report.mjs:KNOWN_ROW_STATUS]`
- Every artifact path cited in the report must exist on disk, resolved against the repository root `[validation/reconstructions/copilot/check-parity-report.mjs:citedPaths]`
- Open deviations must be tracked as D1..D13 by identifier `[validation/reconstructions/copilot/check-parity-report.mjs:deviationIds]`
- The checker exits non-zero on any failure and prints each problem `[validation/reconstructions/copilot/check-parity-report.mjs:fail]`

## Side Effects
- The purity suite is stated to boot no fixed-port service; only ephemeral runtimes from the journey suite `[validation/reconstructions/copilot/tests/architecture/README.md:1]`
- Capture and comparison runs write PNGs and summary tables into `diffs/` `[validation/reconstructions/copilot/capture/compare.mjs:rows]`

## Verification
- Run: `node validation/reconstructions/copilot/check-parity-report.mjs`
- Run: `cd validation/reconstructions/copilot && bun test tests/architecture/`
