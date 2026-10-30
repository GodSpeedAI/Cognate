# starter/harness — harness profile overlay

## Overview
A three-file overlay copied on top of `templates/starter/common` when `cognate create` runs with `--profile harness` `[packages/cli/src/index.ts:create]`. It supplies the generated app's `package.json`, `cognate.config.ts`, and `README.md`; `common/` provides the rest of the tree `[templates/starter/README.md:templates/starter]`. Unlike the copilot overlay it declares no React dependencies, because this profile serves no browser UI `[templates/starter/harness/README.md:my-cognate-app]`.

## Interface
- `package.json` — private ESM manifest named `my-cognate-app` with `dev: "cognate dev"` and `test: "bun test"` `[templates/starter/harness/package.json:scripts]`
- Declared runtime deps — `cognate-cli`, `cognate-profile-harness`, `cognate-domainforge`, `cognate-provider-local`, all `workspace:*`; no `react`/`react-dom` `[templates/starter/harness/package.json:dependencies]`
- `cognate.config.ts` — default export satisfying `CognateConfig` with `profile: "harness"` and an `instructions` string `[templates/starter/harness/cognate.config.ts:export default]`
- `README.md` — the generated app's own front page; states there is no browser UI for this profile `[templates/starter/harness/README.md:There is no browser UI]`

## Invariants
- `cognate create` copies `common/` then this overlay, so these three files are the ones that land in the app `[packages/cli/src/index.ts:copyDir]`
- Registry mode replaces `workspace:*` ranges with the CLI's own version and pins `PROFILE_ROOTS.harness` `[packages/cli/src/index.ts:cliVersion]`
- `--source` mode rewrites those ranges to `file:./.cognate/vendor/<tarball>` and adds `overrides` for the whole vendored closure `[packages/cli/src/index.ts:fileDepFor]`
- The declared dep set matches `PROFILE_ROOTS.harness`, which names the same four `@godspeedai/*` roots `[packages/cli/src/index.ts:PROFILE_ROOTS]`
- `cognate dev` takes the non-copilot branch for this config: it imports `createHarness`, `LOOP_AGENT`, and `harnessRegistry`, then mounts `providerComponent(localProvider(...))` `[packages/cli/src/index.ts:dev]`
- The dev server returns the health payload at `/` for non-copilot profiles and 404s anything else `[packages/cli/src/index.ts:server]`

## Side Effects
- Copied into the target directory by `create`; nothing here executes at scaffold time `[packages/cli/src/index.ts:create]`
- `cognate dev` creates `.cognate/` and the SQLite store at `.cognate/app.sqlite` in the generated app `[packages/cli/src/index.ts:storePath]`

## Verification
- Run: `bun test ./tests/integration/cli-create.test.ts`
