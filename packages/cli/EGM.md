# cli

## Overview

Blueprint directory for `@godspeedai/cognate-cli`, which implements `cognate create` (starter generation with profiles) and `cognate dev` (runtime plus Connect, AG-UI, and UI server) `[packages/cli/package.json:description]`. `src/index.ts` holds the two programmatic entrypoints and `src/bin.ts` holds the executable argument parsing wired to `./src/bin.ts` by the manifest's `bin` map `[packages/cli/package.json:bin]`. `src/index.ts` is the package export and the manifest also ships a `templates` directory `[packages/cli/package.json:files]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — `index.ts` (`create`, `dev`) and `bin.ts` (flag parsing, usage, exit codes)
- No child `EGM.md` exists under this package.

## Global Invariants

- `create` requires a `--profile` of `copilot` or `harness`; anything else prints usage and exits 1 `[packages/cli/src/bin.ts:runCreate]`
- Registry mode (no `--source`) rewrites every `workspace:*` dependency to the CLI's own package version and writes no `overrides` `[packages/cli/src/index.ts:create]`
- Checkout mode (`--source`) packs the transitive `@godspeedai/*` closure of the profile roots with `bun pm pack` and pins each to `file:./.cognate/vendor/<tarball>` in both `dependencies` and `overrides` `[packages/cli/src/index.ts:create]`
- Only workspace packages are vendored; a dependency is followed only when it starts with `@godspeedai/` and exists in the indexed checkout `[packages/cli/src/index.ts:transitiveClosure]`
- `--with` names outside the supported set are reported in `CreateReport.unsupported` with a reason and never imported `[packages/cli/src/index.ts:KNOWN_UNSUPPORTED]`
- Template root is the packaged `../templates/starter` when present, else the checkout's `templates/starter` `[packages/cli/src/index.ts:registryTemplateRoot]`
- `cognate dev` serves `/health`, proxies `/cognate.v1.RuntimeService/*` to the internal server, and serves `/agui` only for POST `[packages/cli/src/index.ts:dev]`
- The dev token authenticator is explicitly dev-only and never for production `[packages/cli/src/index.ts:dev]`

## Global Side Effects

- Filesystem writes into the target directory: template copy, `.cognate/vendor`, `.cognate/entry.tsx`, rewritten `package.json` `[packages/cli/src/index.ts:create]`
- Child processes: `bun pm pack` per vendored package, and streamed `fetch` proxying `[packages/cli/src/index.ts:packPackage]`
- A listening HTTP server on `127.0.0.1` at `--port` (default 3000) `[packages/cli/src/bin.ts:runDev]`
- `Bun.build` of the copilot browser entry `[packages/cli/src/index.ts:dev]`

## Verification

- This package has no `test/` directory; the workspace gate is `cd /home/sprime01/projects/cognate && bun run check` `[package.json:scripts]`
- End-to-end coverage for `create`/`dev` lives in `tests/integration/cli-create.test.ts`, outside this package.
