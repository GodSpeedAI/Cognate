# ui — React 19 + Astryx SSR and hydration fixture

## Overview
A Phase 0 fixture proving React 19 server rendering, Astryx components, and browser
hydration work under Bun without a StyleX compiler step. `ui.test.tsx` covers SSR and
bundling; `hydration.spec.ts` drives a real Chromium page through Playwright. The page
is served by a separate `Bun.serve()` process that also serves the built client bundle.

## Interface
- `ui.test.tsx` — Bun test suite: `renderToString`, Astryx stylesheet presence, and `Bun.build` output `[compatibility/phase0/ui/ui.test.tsx:test]`
- `startServer(port = 0)` — serves SSR HTML at `/`, the client bundle at `/client-entry.js`, and both stylesheets `[compatibility/phase0/ui/playwright-server.tsx:startServer]`
- `App` in `playwright-server.tsx` — renders `Theme` > `Card` > `Button#probe-button` on the server `[compatibility/phase0/ui/playwright-server.tsx:App]`
- `App` in `client-entry.tsx` — the hydrating counterpart, holding `label` in `useState` `[compatibility/phase0/ui/client-entry.tsx:App]`
- `hydration.spec.ts` — the Playwright assertion that clicking `#probe-button` changes its text `[compatibility/phase0/ui/hydration.spec.ts:test]`
- Playwright config — `testMatch: "hydration.spec.ts"`, `baseURL` `http://localhost:3311`, 30 s timeout `[compatibility/phase0/ui/playwright.config.ts:defineConfig]`
- `globalSetup` — spawns `bun run playwright-server.tsx` and waits on its stdout `[compatibility/phase0/ui/pw-global-setup.ts:globalSetup]`
- Subdirectories: [./dist-client/EGM.md](./dist-client/EGM.md) — the built browser bundle

## Invariants
- Playwright's built-in `webServer` option is not used because its TCP readiness probe hangs in this sandbox; a hand-rolled global setup waits on the child's `listening on` line instead `[compatibility/phase0/ui/playwright.config.ts:NOTE]`.
- The Playwright runner executes under Node, not Bun, so the page must come from a child process `[compatibility/phase0/ui/playwright.config.ts:Playwright's test runner]`.
- React 19 `renderToString` inserts `<!-- -->` between adjacent static text and an interpolated child, so the SSR assertion compares the exact string including that marker `[compatibility/phase0/ui/ui.test.tsx:renderToString]`.
- Astryx CSS ships precompiled and a consuming app must link `astryx.css` and `theme.css` itself; SSR markup is correct without them but renders unstyled `[compatibility/phase0/ui/playwright-server.tsx:startServer]`.
- The bundled client size is asserted within a 100,000–2,000,000 byte window rather than an exact byte count `[compatibility/phase0/ui/ui.test.tsx:Bun.build]`.

## Side Effects
- `startServer` binds a loopback port; standalone mode uses 3311 `[compatibility/phase0/ui/playwright-server.tsx:import.meta.main]`.
- Global setup spawns a child process and returns a teardown that kills it `[compatibility/phase0/ui/pw-global-setup.ts:globalSetup]`.
- Tests read prebuilt CSS files from `node_modules` at runtime `[compatibility/phase0/ui/ui.test.tsx:astryx.css]`.

## Verification
- Run: `cd compatibility/phase0/ui && bun test ui.test.tsx`
- Run: `cd compatibility/phase0/ui && bun x playwright test --reporter=list`
