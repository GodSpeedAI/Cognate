# templates

## Overview
Application scaffolding source. This directory holds the starter tree that `cognate create` copies: a `common/` base plus one profile overlay (`copilot/` or `harness/`) selected by `--profile`. The tree stays at the repository root as the single source of truth and is copied into the published CLI package at pack time.

## Subdirectories & Boundaries
- starter/: [./starter/EGM.md](./starter/EGM.md) — the template tree itself, containing `common/` plus the `copilot/` and `harness/` overlays `[templates/starter/README.md:common/]`

## Global Invariants
- Only files under `templates/starter` are scaffolded; `common/` is copied first, then the profile overlay on top `[packages/cli/src/index.ts:copyDir]`
- A checkout run reads `templates/starter` from the repository root; registry mode reads the copy shipped inside the CLI package `[packages/cli/src/index.ts:PACKAGED_TEMPLATE_ROOT]`
- `prepare-npm-package.mjs` copies this tree into `packages/cli/templates/starter` and renames `common/.gitignore` to `_gitignore`, because npm never publishes dot-named `.gitignore` files `[scripts/prepare-npm-package.mjs:npm never publishes .gitignore files]`
- `cognate create` reports any `--with` adapter the starter does not support and writes none of them into the manifest `[packages/cli/src/index.ts:KNOWN_UNSUPPORTED]`
- Each overlay manifest is `private: true` and declares `dev: "cognate dev"` plus `test: "bun test"` `[templates/starter/harness/package.json:scripts]`
- Both overlays pin react only where the profile needs a browser UI: the copilot manifest declares `react`/`react-dom`, the harness manifest does not `[templates/starter/copilot/package.json:dependencies, templates/starter/harness/package.json:dependencies]`

## Global Side Effects
- `cognate create` writes the generated app directory, and in `--source` mode also runs `bun pm pack` into the app's `.cognate/vendor/` and rewrites `dependencies` and `overrides` with `file:` ranges `[packages/cli/src/index.ts:packPackage]`
- `prepare-npm-package.mjs` copies this tree into the CLI package working copy, which is git-ignored and never committed `[scripts/prepare-npm-package.mjs:copied templates/starter into]`

## Verification
- Run: `bun test ./tests/integration/cli-create.test.ts`
