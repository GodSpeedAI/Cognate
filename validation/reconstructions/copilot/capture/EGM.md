# capture — Cognate-side visual capture and comparison

## Overview
Two Node scripts, plus their recorded output. `capture.mjs` boots the reconstruction's own server and drives its bundled UI to every reference checkpoint, saving PNGs named to mirror the reference captures. `compare.mjs` pairs those with the reference screenshots and writes a reference/diff/cognate triptych and a summary table. Both are written for Node because Playwright's browser dies under Bun.

## Interface
- `PORT`, `BASE` — the fixed reconstruction port and origin the driver boots and drives `[capture.mjs:PORT]`
- `VIEWPORTS` — the desktop 1440x900 and mobile 390x844 viewports mirroring the reference harness `[capture.mjs:VIEWPORTS]`
- `startServer` — clears `.data`, spawns `bun src/server.ts` with `COGNATE_HARNESS_HOME`, and waits on `/health` `[capture.mjs:startServer]`
- `GATE_SCRIPT` — an in-page fetch wrapper that paces StartRun, Events and ReadProjection responses so pending states are photographable `[capture.mjs:GATE_SCRIPT]`
- `main` — the capture driver itself `[capture.mjs:main]`
- `triptych` — composes reference, cognate and diff images side by side with an 8px gap `[compare.mjs:triptych]`
- `JOURNEY_OF`, `VIEWPORT_OF` — derive journey id and viewport from the checkpoint filename `[compare.mjs:JOURNEY_OF]`

## Invariants
- The driver refuses to start if the fixed port is occupied, rather than capturing against a foreign server `[capture.mjs:startServer]`
- The data home is deleted and recreated per run, so a capture starts from a clean durable store `[capture.mjs:startServer]`
- The pacing gate changes timing only; it never alters content `[capture.mjs:GATE_SCRIPT]`
- Comparison writes a triptych only for checkpoints present in both trees, and reports reference-only and cognate-only checkpoints separately `[compare.mjs:shared]`
- Images of differing dimensions are padded to a common canvas with white before diffing `[compare.mjs:padCanvas]`
- Pixelmatch runs at threshold 0.1 and the resulting percentage is recorded, not thresholded `[compare.mjs:rows]`
- The run manifest records viewports, device scale factor, reduced motion and the shot list `[capture.mjs:main]`
- Unphotographable pending states are logged as named deviations instead of being faked `[capture.mjs:main]`

## Side Effects
- Deletes and recreates `capture/.data` each run `[capture.mjs:startServer]`
- Truncates and writes `capture/server.log` with the spawned server's stdout/stderr `[capture.mjs:SERVER_LOG]`
- Writes `capture-log.json` describing the run `[capture.mjs:main]`
- Writes PNG screenshots into `cognate/screenshots/` and triptychs plus `summary.md` into `diffs/` `[compare.mjs:DIFFS]`
- Spawns and later terminates the server process unless `--keep-server` is passed `[capture.mjs:keepServer]`
- Loads `pngjs` and `pixelmatch` from the repository root `node_modules` `[compare.mjs:require]`

## Verification
- Run: `node validation/reconstructions/copilot/capture/capture.mjs`
- Run: `node validation/reconstructions/copilot/capture/compare.mjs`
