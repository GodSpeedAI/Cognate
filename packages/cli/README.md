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
cognate create my-app --profile copilot

cd my-app
bun install
bun dev            # serves the app; print the URL and open it
```

`create` copies the profile's starter layout (`domain/*.sea` semantic files,
`src/{agents,capabilities,components,projections,ui}`, `cognate.config.ts`, `package.json`)
and pins every `@godspeedai/*` dependency to this CLI's exact version, resolved from npm.
Pass `--with <name,name>` to request optional adapters: anything the profile can't wire yet is
reported (`unsupported: <name> (<reason>)`) and never silently added.

To generate an app from a local checkout of the Cognate repository, pass `--source <checkout>`: `create`
packs the profile's packages from that checkout into the app's `.cognate/vendor/` directory and
pins them with `file:` dependencies, so the app is self-contained and reproducible from that checkout.

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
| `cognate create <dir> --profile copilot\|harness [--source <checkout>] [--with a,b]` | Generate a starter app |
| `cognate dev [--port N]` | Run the app from its directory |

Run `cognate` with no arguments to print the usage your installed version supports.

## Limitations

- Without `--source`, generated apps resolve the `@godspeedai/*` packages from npm at the CLI's
  version, so the generated app needs network access to the npm registry on first install.
- `--source` vendors packages from a checkout at generation time, for building against a local checkout of the repository rather than the published versions.
- `dev` is a development server: its auth is dev-only and it runs a single process.

## Related packages

- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella
  (runtime + client in one import) for building apps without the CLI.
- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) /
  [`@godspeedai/cognate-profile-harness`](https://www.npmjs.com/package/@godspeedai/cognate-profile-harness) —
  the composition profiles `create` scaffolds from.

## License

Apache-2.0
