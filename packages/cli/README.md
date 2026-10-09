# @godspeedai/cognate-cli

`cognate create` and `cognate dev` (spec §37 Phase 10).

```bash
cognate create my-app --profile copilot --source /path/to/cognate/checkout
cd my-app && bun install && bun dev
```

`create` copies `templates/starter` (profile-specific layout: `domain/`,
`src/{agents,capabilities,components,projections,ui}`, `cognate.config.ts`,
`package.json`), then vendors every `@godspeedai/*` package the profile needs
from `--source` with `bun pm pack` into `.cognate/vendor/`, pinning each with
a `file:` dependency and a matching `package.json` `overrides` entry so
`workspace:*` inside the packed tarballs resolves outside the workspace
(DEBT-016 — packages are not published). `--with <a,b>` reports unsupported
extras (`unsupported: <name> (<reason>)`) and never adds them to imports or
`package.json`.

`dev` (run from the generated app) loads `cognate.config.ts`, parses
`domain/*.sea` via `@godspeedai/domainforge`, creates the profile's app on
`.cognate/app.sqlite` (state survives restart), and serves one `Bun.serve`:
`GET /health`, the Connect `RuntimeService` at `/cognate.v1.RuntimeService/*`
(dev-only `Bearer <tenant>:<user>` auth), `/agui` (copilot only), and `/` — an
Astryx chat UI for copilot, a health JSON page for harness.

## Consumer type setup

Typechecking a project that depends on this package (or on generated apps
vendoring it) needs the ambient type packages:

```sh
bun add -d @types/bun @types/node
```
