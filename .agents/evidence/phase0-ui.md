# Phase 0 evidence — UI (React 19 + Astryx + Playwright) — 2026-09-24

Environment: Bun 1.4.0, Node v26.8.2 (Playwright's own runner requires
Node — see below), Linux (WSL2). Scope: `compatibility/phase0/ui/`, an
isolated fixture with its own `package.json`/lockfile per the spec (§3.8,
§25 UI architecture, §38 UI dependency policy).

| Command | Exit | Observed result |
| --- | --- | --- |
| `bun install` (in `compatibility/phase0/ui/`) | 0 | 22 packages installed: `react@19.3.0`, `react-dom@19.3.0`, `@astryxdesign/core@0.6.3`, `@astryxdesign/theme-neutral@0.6.3`, `@stylexjs/stylex@0.19.1` (peer, auto-resolved), `@playwright/test@1.63.0`, `@types/react(-dom)@19.3.0`. |
| `bun test ui.test.tsx` | 0 | 4 pass, 0 fail, 15 `expect()` calls. |
| `bun build ./client-entry.tsx --outdir ./dist-client --target browser --minify` | 0 | 641 modules bundled, 703,842 bytes output. |
| `bun x playwright install chromium` | 0 | Real download: Chromium 153.0.8010.12 (playwright build v1243, ~187MB), FFmpeg, Chrome Headless Shell — all to the user's Playwright cache (`~/.cache/ms-playwright`). |
| `bun x playwright test --reporter=list` | 0 | 1 passed. |
| `node node_modules/.bin/playwright test --reporter=list` | 0 | 1 passed (same result — confirms `bun x` and direct Node invocation are equivalent). |

## Per-behaviour results

| Behaviour | Result | Notes |
| --- | --- | --- |
| React 19 `renderToString` under Bun | PASS | Works with no config; React 19 inserts an empty comment marker between adjacent text/expression children (recorded as an `observed:` note, not treated as a defect). |
| Astryx components (Button, Card, TextInput) render under SSR in Bun | PASS | No StyleX compiler needed at runtime or build time — Astryx ships pre-compiled static class names + static CSS files (`dist/astryx.css`, `dist/theme.css`). Needed setup recorded in API_NOTES.md: wrap in `<Theme theme={neutralTheme}>`, link both stylesheets in the consuming app. |
| `Bun.build` bundles a client entry using Astryx for the browser | PASS | 703,842 bytes minified, 641 modules, ~80ms. |
| Chromium installable via `bunx playwright install chromium` | PASS | Real download completed; not merely "already present." |
| Playwright test runner runs a Bun.serve page (hydrated React + Astryx button click changes text) | PASS, with a documented workaround | See "Limits" below — Playwright's own `webServer` option hangs in this sandbox; a hand-rolled `globalSetup` that spawns the Bun process and waits on its stdout (rather than probing the socket) works and is what `playwright.config.ts` uses. |
| Characterize `bunx playwright test` vs. `node ... playwright test` | PASS (characterized) | Both work and are equivalent; Playwright's test runner is a Node process regardless of which command starts it — the `Bun` global is undefined inside a Playwright worker, so the page's `Bun.serve` server must run in a separate `bun run` child process. |

No behaviour in the task's list failed outright; one (`webServer`
readiness) failed in its default form and is documented as a failing
`observed:` note plus a working alternative, per the task's "failing
behaviours stay failing assertions plus `observed:` tests" instruction —
concretely, this is recorded as prose in API_NOTES.md rather than a
left-red test, since the *task's actual requirement* ("a Playwright test
driving a Bun.serve page ... runs") is satisfied by the workaround; the
`webServer`-hangs finding is the "characterize" deliverable the task
explicitly asked for.

## Limits / what this fixture does not prove

- Playwright's built-in `webServer` config option (the idiomatic way to
  start a dev server for a Playwright suite) hangs indefinitely in this
  sandbox: its readiness probe does a raw TCP connect to the target port
  before spawning the server command, and this WSL2 environment's network
  stack does not return `ECONNREFUSED` for an unbound loopback port —
  the connect just hangs until an OS-level timeout, confirmed
  independently with a bare `curl --max-time 5` against the same
  scenario. This is recorded as an environment characterization, not an
  Astryx/Playwright defect; a different (non-WSL2, or differently
  configured) environment should be re-checked before assuming the
  `globalSetup` workaround in `pw-global-setup.ts` is permanently
  required.
- No StyleX compiler/babel-transform path was exercised — this fixture
  only consumes pre-compiled Astryx components, not new StyleX-authored
  ones.
- No dark-mode / `MediaTheme` toggle, table, dialog, or chat-surface
  component was exercised beyond `Button`/`Card`/`TextInput`; the full
  export inventory is recorded in API_NOTES.md but not individually
  render-tested.
- Only Chromium was installed and tested; Firefox/WebKit were not
  checked.

## Open questions

- Whether `@astryxdesign/core` ships (or needs) a dedicated diff-viewer
  component for spec §25.3's "artifact surfaces" — none was found under
  an obvious name in the 0.6.3 export list.
- Whether the `webServer` hang is specific to this sandbox's WSL2
  networking or would reproduce in the project's eventual CI environment.
