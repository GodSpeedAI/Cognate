# landing — Astro marketing site

## Overview
A self-contained Astro application (its own `package.json`, `node_modules`, lockfile and Playwright config) that publishes the Cognate landing page and a QA keyframe route. It is built with `astro build` and then post-processed by `scripts/notices.ts`, which emits third-party licence notices into `dist/`. The site is static output with one React integration; the runtime behaviour lives in `src/` islands and the build/serve tooling lives in `scripts/`.

## Interface
- `dev`, `build`, `preview`, `check`, `test`, `verify:sources`, `shots`, `test:e2e` — the complete script surface `[landing/package.json:scripts]`
- `defineConfig` — site origin `https://cognate.gspeedai.com`, `output: 'static'`, React integration, dev toolbar disabled `[landing/astro.config.mjs:defineConfig]`
- Subdirectories: [./scripts/EGM.md](./scripts/EGM.md) — build, serve, asset and provenance tooling
- Subdirectories: [./src/EGM.md](./src/EGM.md) — layouts, pages, data, components and drawing library

## Invariants
- `build` is two sequential steps; notices must run after `astro build` or `dist/` has no licence files `[landing/package.json:scripts]`
- A missing licence text file aborts the build rather than emitting an incomplete notice `[landing/scripts/notices.ts:readText]`
- The published SDK version is baked in at build time with a pinned fallback, so an offline build still states a true version `[landing/src/pages/index.astro:npmVersion]`
- The notices test reads `dist/` and therefore requires a completed build first `[landing/tests/notices.test.ts:dist]`

## Side Effects
- Network: `fetch` of `https://registry.npmjs.org/@godspeedai/cognate/latest` during page render `[landing/src/pages/index.astro:npmVersion]`
- Disk: writes `dist/THIRD_PARTY_NOTICES.txt` and `dist/licenses/OFL-*.txt` `[landing/scripts/notices.ts:writeNotices]`
- Disk: server state and log files under `landing/.site/` `[landing/scripts/site.ts:stateDir]`
- Process: launches headless Chromium via Playwright for asset and screenshot generation `[landing/scripts/assets.ts:writeWebpDerivatives]`

## Verification
- Run: `cd landing && bun test`
