# starter/copilot — copilot profile overlay

## Overview
A three-file overlay copied on top of `templates/starter/common` when `cognate create` runs with `--profile copilot` `[packages/cli/src/index.ts:create]`. It supplies the generated app's `package.json`, `cognate.config.ts`, and `README.md`; the shared `domain/`, `src/`, `test/`, and `.gitignore` come from `common/` `[templates/starter/README.md:templates/starter]`.

## Interface
- `package.json` — private ESM manifest named `my-cognate-app` with `dev: "cognate dev"` and `test: "bun test"` `[templates/starter/copilot/package.json:scripts]`
- Declared runtime deps — `cognate-cli`, `cognate-profile-copilot`, `cognate-domainforge`, `cognate-provider-local` (all `workspace:*`) plus `react` and `react-dom` at `19.3.0` `[templates/starter/copilot/package.json:dependencies]`
- `cognate.config.ts` — default export satisfying `CognateConfig` with `profile: "copilot"` and an `instructions` string `[templates/starter/copilot/cognate.config.ts:export default]`
- `README.md` — the generated app's own front page; documents `bun install` and `bun dev` `[templates/starter/copilot/README.md:bun install]`

## Invariants
- `cognate create` copies `common/` first and this overlay second, so these three files are the ones that land in the app `[packages/cli/src/index.ts:copyDir]`
- Registry mode replaces every `workspace:*` range with the CLI's own version and pins `PROFILE_ROOTS.copilot` explicitly `[packages/cli/src/index.ts:cliVersion]`
- `--source` mode instead rewrites every `workspace:*` range to `file:./.cognate/vendor/<tarball>` and writes matching `overrides` entries `[packages/cli/src/index.ts:fileDepFor]`
- The declared dep set matches `PROFILE_ROOTS.copilot`, which names the same four `@godspeedai/*` roots `[packages/cli/src/index.ts:PROFILE_ROOTS]`
- `cognate dev` reads `profile` from this config to select the copilot branch, which imports `createCopilotApp` and `COPILOT_AGENT` `[packages/cli/src/index.ts:dev]`
- `react`/`react-dom` are declared because the copilot branch is the one that serves a browser UI `[packages/cli/src/index.ts:config.profile]`

## Side Effects
- Copied into the target directory by `create`; nothing in this directory executes at scaffold time `[packages/cli/src/index.ts:create]`
- `.cognate/` is the generated app's local state directory; `common/.gitignore` ignores `.cognate/app.sqlite*` and `.cognate/dist` `[templates/starter/common/.gitignore:.cognate/app.sqlite*]`

## Verification
- Run: `bun test ./tests/integration/cli-create.test.ts`
