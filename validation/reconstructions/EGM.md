# validation/reconstructions — third-party reconstruction exercises

## Overview
Two independent exercises that rebuild an external product's observable behaviour on Cognate, then prove the result is behaviorally and architecturally comparable to a pinned reference. Each holds its own reconstruction app, capture or journey harness, diff evidence, parity report, and a validity checker. They share a method (pinned reference, shared driver, pixel comparison as evidence rather than a gate) but no code.

## Subdirectories & Boundaries
- `copilot`: [./copilot/EGM.md](./copilot/EGM.md) — CopilotKit reconstruction: harness, captures, parity report, purity tests
- `deepseek-harness`: [./deepseek-harness/EGM.md](./deepseek-harness/EGM.md) — DeepSeek Harness console reconstruction: journeys, captures, critic rounds, docs

## Global Invariants
- Both reconstruction apps are workspace packages pinned by `file`/`workspace` references, so a reconstruction cannot silently depend on a published lookalike `[validation/reconstructions/copilot/cognate/package.json:dependencies]`, `[validation/reconstructions/deepseek-harness/cognate/package.json:dependencies]`
- Pixel difference is recorded as evidence; there is no similarity threshold that can pass or fail a reconstruction `[validation/reconstructions/copilot/capture/compare.mjs:1]`, `[validation/reconstructions/deepseek-harness/tests/visual/compare.ts:1]`
- The pinned reference is never edited; adaptations are made in a proxy or transform outside the reference `[validation/reconstructions/copilot/reference/mock-context-injector.mjs:1]`
- Divergences must be dispositioned (fixed or named) rather than masked `[validation/reconstructions/copilot/capture/compare.mjs:1]`

## Global Side Effects
- Both trees run Playwright browsers and spawn local servers on fixed ports `[validation/reconstructions/copilot/capture/capture.mjs:PORT]`
- Captures write PNG evidence and derived summary tables into their own trees `[validation/reconstructions/copilot/capture/compare.mjs:DIFFS]`
- Both keep runtime state under a `.data` directory that is regenerated per capture `[validation/reconstructions/copilot/capture/capture.mjs:DATA]`

## Verification
- Run: `cd validation/reconstructions/copilot && bun test tests/architecture/`
- Run: `cd validation/reconstructions/deepseek-harness/tests && bun run journeys`
