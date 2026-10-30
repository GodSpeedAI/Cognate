# deepseek-harness/cognate/screenshots — Playwright capture script plus PNG checkpoints

## Overview

Mostly artifacts. The directory holds one thin script, `capture.ts`, and five subdirectories of PNG
checkpoints (`desktop/`, `dev/`, `laptop/`, `smoke/`, `workbench/`). The script describes itself as a
"one-off Playwright capture script for T5 dev screenshots", explicitly not part of `bun test`, to be
run by hand `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts]`. It drives
an already-running app over HTTP and asserts nothing; it only clicks through the UI and writes images.

## Interface

- `capture.ts` — no exported symbols; a top-level module script that launches Chromium, walks the
  first-run → settings → workspace → one streamed turn flow, and writes seven files
  `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:shot]`
- Reads `APP_URL` (default `http://127.0.0.1:3180`) and `MOCK_MODEL_URL` (default `http://127.0.0.1:4010`) `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:APP_URL]`
- Writes only into `dev/`, at viewport 1280x800 `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:OUT_DIR]`
- `dev/` — the seven checkpoints `01-first-launch` … `07-turn-completed` this script produces `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts]`
- `workbench/` — produced by the app's Chromium E2E test, which points at this directory `[validation/reconstructions/deepseek-harness/cognate/test/E2E-workbench.test.ts:SHOTS]`
- `desktop/` and `laptop/` — the `01`–`22` checkpoint families are reference-diff captures; the README documents invoking `../tests/capture/cognate.capture.ts` with a viewport argument to regenerate them, so the producer lives outside this tree `[validation/reconstructions/deepseek-harness/cognate/README.md]`
- `smoke/` — a subset of the `desktop` checkpoint names; no producer in this tree names that directory `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts]`

## Invariants

- The script never asserts UI state or compares images; it screenshots after fixed `waitForTimeout` sleeps, so a failing run still produces files `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:shot]`
- It requires the app server and the mock model server to already be running; it starts neither `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:APP_URL]`
- It creates its workspace directory under the OS temp dir rather than touching a real project `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts]`

## Side Effects

- Launches the bundled Playwright Chromium and navigates to `APP_URL` `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:chromium]`
- `mkdir -p` of `screenshots/dev/`, then overwrites PNGs there `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts:OUT_DIR]`
- Posts a `[[scenario:plain]]`-prefixed message to the running app and configures a `mock` provider pointing at `MOCK_MODEL_URL` `[validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts]`

## Verification

- Nothing in this directory is a test. The nearest automated check is the Chromium E2E test that writes `workbench/`: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test --timeout=30000` `[validation/reconstructions/deepseek-harness/cognate/package.json:scripts]`
