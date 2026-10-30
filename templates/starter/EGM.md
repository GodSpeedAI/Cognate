# templates/starter — source for `cognate create`

## Overview
The template tree copied into every generated app. `common/` is shared; a profile directory (`copilot/` or `harness/`) is copied on top depending on `--profile`. Each profile contributes a `cognate.config.ts` and a `package.json`; the shared part contributes the domain model, the `src/` skeletons and one starter test.

## Subdirectories & Boundaries
- `copilot`: [./copilot/EGM.md](./copilot/EGM.md) — copilot profile config and manifest (browser chat UI plus AG-UI)
- `harness`: [./harness/EGM.md](./harness/EGM.md) — harness profile config and manifest (headless loop agent, no browser UI)
- `common/` — shared payload: `domain/example.sea`, `src/{agents,capabilities,components,projections,ui}/`, `test/app.test.ts`, `.gitignore`

## Global Invariants
- A profile is selected by the `profile` literal in the config, which must satisfy the CLI's `CognateConfig` type `[templates/starter/copilot/cognate.config.ts:profile]`, `[templates/starter/harness/cognate.config.ts:profile]`
- The two profiles differ in dependency set: copilot adds React, the copilot profile package and the local provider, harness adds the harness profile package and no React `[templates/starter/copilot/package.json:dependencies]`, `[templates/starter/harness/package.json:dependencies]`
- Both profiles declare the same `dev` and `test` scripts, so the generated app has one run surface regardless of profile `[templates/starter/copilot/package.json:scripts]`, `[templates/starter/harness/package.json:scripts]`
- The CLI resolves this tree two ways: from the checkout (`../../../templates/starter`) and from the packaged copy, preferring the packaged one when present `[packages/cli/src/index.ts:registryTemplateRoot]`
- Dependencies are written as `workspace:*` in the template and re-pinned as `file:` dependencies with `overrides` at create time `[packages/cli/src/index.ts:packPackage]`
- The shared starter test asserts only that `domain/example.sea` parses into semantic objects with at least one object, making it a template sanity check rather than a feature test `[templates/starter/common/test/app.test.ts:loadSemanticProjection]`
- The template is intentionally small because it is the first thing a user reads and edits `[templates/starter/README.md:1]`

## Global Side Effects
- No effect in place; the tree is read and copied into a target directory by the CLI `[templates/starter/copilot/package.json:name]`
- Every generated app keeps the shared package name until the user renames it, so two generated apps collide by default `[templates/starter/copilot/package.json:name]`

## Verification
- Run: `bun test ./tests/integration/cli-create.test.ts`
