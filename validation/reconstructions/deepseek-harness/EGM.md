# validation/reconstructions/deepseek-harness — DeepSeek Harness console reconstruction

## Overview
A reconstruction of the DeepSeek Harness web console as a Cognate application under `cognate/`, paired with a differential test rig. The rig drives both the pinned reference and the reconstruction through one shared `Driver` interface and records behavioural, visual and architectural evidence. It also carries a documentation system and a multi-round critic record.

## Interface
- `cognate/` — the reconstruction app (`deepseek-harness-reconstruction`): runtime composition root, agents, capabilities, projections, UI, workbench, tests
- `tests/drivers/types.ts` — the `Driver` interface both systems implement, so journey scripts are written once `[validation/reconstructions/deepseek-harness/tests/drivers/types.ts:Driver]`
- `tests/drivers/reference.ts`, `tests/drivers/cognate.ts` — the two implementations
- `tests/journeys/run.ts` — suite runner that writes per-system results plus a side-by-side summary `[validation/reconstructions/deepseek-harness/tests/journeys/run.ts:RESULTS_DIR]`
- `tests/visual/compare.ts` — side-by-side plus pixel-diff comparison over shared checkpoints `[validation/reconstructions/deepseek-harness/tests/visual/compare.ts:1]`
- `tests/capture/` — reference and Cognate capture drivers `[validation/reconstructions/deepseek-harness/tests/capture/cognate.capture.ts:1]`
- `tests/package.json` — the suite's own manifest with `journeys`, `journeys:reference`, `journeys:cognate` scripts `[validation/reconstructions/deepseek-harness/tests/package.json:scripts]`
- `fixtures/` — deterministic model endpoint fixtures and workspace fixtures `[validation/reconstructions/deepseek-harness/fixtures/README.md:1]`
- `docs/` — the Diátaxis documentation system for both the app and the harness `[validation/reconstructions/deepseek-harness/docs/documentation-map.md:1]`
- Subdirectories: [cognate](./cognate/EGM.md) — the reconstruction app
- `critic/` — numbered critic rounds with dispositions; `diffs/`, `reference/` — comparison output and reference observations
- `parity-report.json`, `parity-report.md`, `primitive-provenance.md`, `architecture-evidence.md`, `donor-manifest.json`, `reference-manifest.json`

## Invariants
- Journey scripts target the `Driver` interface only; branding and selector differences are absorbed by an implementation, never by weakening assertions in the caller `[validation/reconstructions/deepseek-harness/tests/drivers/types.ts:1]`
- Each journey run uses an isolated data home and an injected mock model base URL, so runs cannot share durable state `[validation/reconstructions/deepseek-harness/tests/drivers/types.ts:LaunchOptions]`
- A journey that fails and then passes on retry is recorded as `flaky`, not as a clean pass `[validation/reconstructions/deepseek-harness/tests/journeys/run.ts:Outcome]`
- Pixel comparison is evidence with no similarity threshold; a human or agent must read the summary `[validation/reconstructions/deepseek-harness/tests/visual/compare.ts:1]`
- Architecture findings are reported per named spec criterion with the test file or command and a PASS result `[validation/reconstructions/deepseek-harness/architecture-evidence.md:1]`
- The reconstruction app is a declared workspace member, not a published package `[validation/reconstructions/deepseek-harness/cognate/package.json:name]`
- The app composes its runtime by hand rather than through a harness factory, and the reason is recorded in the app README `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:1]`
- Documentation pages have a single owning page per concept, tracked in the documentation map `[validation/reconstructions/deepseek-harness/docs/documentation-map.md:1]`

## Side Effects
- Journey and capture runs boot Playwright browsers and bind local servers, writing into `tests/test-results/` and `tests/journeys/results/` `[validation/reconstructions/deepseek-harness/tests/journeys/run.ts:RESULTS_DIR]`
- Visual comparison writes diff PNGs and a summary table `[validation/reconstructions/deepseek-harness/tests/visual/compare.ts:1]`
- The app binds port 3180 by default `[validation/reconstructions/deepseek-harness/cognate/package.json:scripts]`
- Capture and journey runs persist runtime state under a `.data` directory `[validation/reconstructions/deepseek-harness/fixtures/README.md:1]`

## Verification
- Run: `cd validation/reconstructions/deepseek-harness/tests && bun run journeys`
- Run: `just harness-up` / `just harness-down`
