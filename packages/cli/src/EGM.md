# cli / src — starter generation and dev server

## Overview

`create` copies the starter template for a named profile into a target directory in one of two modes: with `--source <checkout>` it packs the reachable `@godspeedai/*` workspace packages with `bun pm pack` and pins them as `file:` dependencies plus a root `overrides` map; without it, every `@godspeedai/cognate-*` dependency is pinned to the CLI's own version `[index.ts:create]`. `dev` boots a runtime for the requested profile and fronts it with one Bun server exposing the Connect service routes, the AG-UI endpoint, `/health`, and (for `copilot`) a bundled browser UI `[index.ts:dev]`. `bin.ts` is the only argument parser and entrypoint `[bin.ts:main]`.

## Interface

- `create` — writes the starter and returns a `CreateReport` `[index.ts:create]`
- `dev` — starts the server and returns `{ url, stop }` `[index.ts:dev]`
- `CreateOptions` — `dir`, `profile`, optional `source` checkout, optional `with` component names `[index.ts:CreateOptions]`
- `CreateReport` — `dir`, copied `files`, `vendored` package names, `unsupported` entries with reasons `[index.ts:CreateReport]`
- `CognateConfig` and `DevServer` — the generated app's config shape and the served handle `[index.ts:CognateConfig]`
- `transitiveClosure` — BFS over `@godspeedai/*` dependency edges from the profile roots `[index.ts:transitiveClosure]`
- Subdirectories: none.

## Invariants

- `--profile` outside `copilot` / `harness` is rejected by `bin.ts` before `create` runs `[bin.ts:runCreate]`
- Vendoring walks only `@godspeedai/*` dependencies that exist in the checkout, so a pinned external adapter still resolves from the registry `[index.ts:transitiveClosure]`
- A `--with` name listed in `KNOWN_UNSUPPORTED` is reported with its reason and never imported `[index.ts:KNOWN_UNSUPPORTED]`
- Template discovery prefers the packaged `templates/starter` copy and falls back to the checkout root `[index.ts:registryTemplateRoot]`
- The packaged template stores `.gitignore` as `_gitignore` and `copyDir` restores the dot name `[index.ts:copyDir]`
- The dev server binds `127.0.0.1`, proxies `/cognate.v1.RuntimeService/` paths to the internal runtime, and returns 404 otherwise `[index.ts:dev]`
- The non-`copilot` root returns the health payload rather than HTML `[index.ts:dev]`

## Side Effects

- Directory creation, template copying, and file writes into the target directory `[index.ts:create]`
- `bun pm pack` child processes per vendored package `[index.ts:packPackage]`
- Binding a loopback TCP listener and a second internal runtime listener `[index.ts:dev]`
- Dynamic imports of profile, provider, and transport packages at dev time `[index.ts:dev]`
- `Bun.build` bundles the browser entry for the `copilot` profile `[index.ts:dev]`

## Verification

- Run: `bun test ./tests/integration/cli-create.test.ts` from the repository root, since `packages/cli` has no `test/` directory
