# fidelity-qa/measure — landing page measurement script

## Overview
A single-shot Bun script that drives headless Chromium over the built landing site and emits one JSON report per viewport/scheme/page combination. It measures design tokens, font families and sizes, contrast, clipping, document overflow, image density and placeholder strings. It is a measurement instrument, not a test: it prints a condensed summary to stdout and never asserts.

## Interface
- `BASE` — the fixed origin it drives; the caller must already serve `landing/dist` there `[measure.ts:BASE]`
- `OUT`, `DIST` — absolute output directory and absolute path of the built site it reads `[measure.ts:OUT]`
- `SPEC` — the expected light/dark token values, keyed by token name `[measure.ts:SPEC]`
- `audit` — the in-page async function that walks `body *` and returns the whole report object `[measure.ts:audit]`
- `holdScan` — scrolls to the mid-hold unit of the exploded-view track and reports whether the inspector is visible `[measure.ts:holdScan]`
- `sweep` — scrolls the full document in 400px steps to trigger scroll-driven state before measuring `[measure.ts:sweep]`
- `plan` — the enumerated matrix: widths 320/375/768/1024/1440 × `/` + `/keyframe/`, plus dark, hold and DPR 2 cases `[measure.ts:plan]`

## Invariants
- A token matches spec only when no RGB channel differs by more than 1 from the expected value `[measure.ts:specRes]`
- A colour counts as on-palette only within 2 per channel and 0.01 alpha of a declared token, so near-miss colours are reported as defects `[measure.ts:isToken]`
- Contrast thresholds are 3:1 for large text (≥24px, or ≥18.66px at weight ≥700) and 4.5:1 otherwise `[measure.ts:contrastChecked]`
- Elements whose ancestor chain has a `background-image` are counted as `unmeasuredBg` instead of being scored `[measure.ts:unmeasuredBg]`
- An image passes density only when it is complete and its intrinsic width is at least the displayed width times the device pixel ratio `[measure.ts:images]`
- Visibility requires non-zero box, non-`hidden`/`none`, and an effective opacity above zero accumulated through ancestors `[measure.ts:isVisible]`
- Placeholder scanning strips `script` and `style` content before matching lorem/TODO/TBD/example.com/xxx/FIXME `[measure.ts:stripped]`
- Font families, radii and font sizes are checked against small allowlists rather than any scale rule `[measure.ts:ALLOWED_FAM]`, `[measure.ts:ALLOWED_RAD]`, `[measure.ts:isAllowedSize]`

## Side Effects
- Creates the output directory if absent `[measure.ts:mkdirSync]`
- Writes `results.json` with the full report `[measure.ts:writeFileSync]`
- Writes `hold-1440.png` when the hold plan entry runs `[measure.ts:holdScan]`
- Launches and closes a Chromium browser and one context per plan entry `[measure.ts:browser]`
- Performs HTTP loads of `BASE + path` and waits on `document.fonts.ready` plus fixed timeouts `[measure.ts:page]`
- Reads the built HTML files directly from `DIST` for the placeholder scan `[measure.ts:pats]`

## Verification
- Run: `bun actualize/evidence/fidelity-qa/measure/measure.ts` (requires a server on `127.0.0.1:4455` serving `landing/dist`)
- Run: `cd landing && bun run build && bun run shots`
