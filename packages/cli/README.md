# @godspeedai/cognate-cli

The Cognate CLI: scaffold a production-shaped agent app (`cognate create`) and run it with a
live runtime, semantic domain loading, and a built-in UI (`cognate dev`).

## Installation

```sh
bun add -g @godspeedai/cognate-cli   # global `cognate` command
# or run without installing:
bunx @godspeedai/cognate-cli --help
```

Requires [Bun](https://bun.sh) >= 1.4.0. Typechecking projects that depend on the CLI (or on
generated apps) also needs the ambient type packages: `bun add -d @types/bun @types/node`.

## Quick start

```sh
# Scaffold an app from the copilot profile (an interactive chat app).
# --source points at a Cognate checkout whose packages are vendored into the app.
cognate create my-app --profile copilot --source /path/to/cognate/checkout

cd my-app
bun install
bun dev            # serves the app; print the URL and open it
```

`create` copies the profile's starter layout (`domain/*.sea` semantic files,
`src/{agents,capabilities,components,projections,ui}`, `cognate.config.ts`, `package.json`),
then vendors every `@godspeedai/cognate-*` package the profile needs from `--source` into
`.cognate/vendor/`, pinning each with a `file:` dependency — so the generated app is
self-contained and reproducible against the checkout you generated it from. Pass
`--with <name,name>` to request optional adapters: anything the profile can't wire yet is
reported (`unsupported: <name> (<reason>)`) and never silently added.

`dev` loads `cognate.config.ts`, parses `domain/*.sea` through the DomainForge adapter, creates
the app's SQLite database at `.cognate/app.sqlite` (state survives restarts), and serves:

- `GET /health` — liveness
- `/cognate.v1.RuntimeService/*` — the Connect RPC surface (dev-only `Bearer <tenant>:<user>`
  auth — fine for local development, replace before exposing)
- `/agui` — the AG-UI event stream (copilot profile)
- `/` — a chat UI (copilot) or a health JSON page (harness)

## Commands

| Command | Purpose |
| --- | --- |
| `cognate create <dir> --profile copilot\|harness --source <checkout> [--with a,b]` | Generate a starter app |
| `cognate dev [--port N]` | Run the app from its directory |

Run `cognate` with no arguments to print the usage your installed version supports.

## Limitations

- `create` requires `--source` pointing at a Cognate checkout; packages are vendored at
  generation time rather than resolved from npm. A registry-only mode is a known, tracked
  follow-up.
- `dev` is a development server: its auth is dev-only and it runs a single process.

## Related packages

- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella
  (runtime + client in one import) for building apps without the CLI.
- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) /
  [`@godspeedai/cognate-profile-harness`](https://www.npmjs.com/package/@godspeedai/cognate-profile-harness) —
  the composition profiles `create` scaffolds from.

## License

Apache-2.0
