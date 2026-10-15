# Cognate CLI

This file is the only place in the skill that says how the Cognate CLI is installed and invoked. Everything else says `cognate <command>`. When the CLI's distribution changes, update this file only.

## Distribution mode

**Current mode: published.** The CLI ships as the [`@godspeedai/cognate-cli`](https://www.npmjs.com/package/@godspeedai/cognate-cli) npm package (latest: 0.5.0; its `bin` is `cognate`). All SDK packages publish under the `@godspeedai/cognate-*` convention ([ADR-0012](../../../docs/decisions/ADR-0012-cognate-package-naming.md)), and all are at 0.5.0 on npm.

| Setting | Published (current) | Registry-only `create` (future, DEBT-016) |
| --- | --- | --- |
| `cognate` means | `bun x @godspeedai/cognate-cli@0.5` (or `cognate` after `bun add -g @godspeedai/cognate-cli`) | same |
| `create` package source | `--source $COGNATE_CHECKOUT` still required: the published tarball ships only `src/` (`packages/cli/package.json` `files`), and `create` reads the starter and packages from the checkout (`packages/cli/src/bin.ts:31-35`), vendoring them with `file:` tarballs | npm registry, pinned versions — no checkout needed |
| Upgrade the app | re-run `create` against a newer checkout, or re-vendor; SDK deps inside a generated app update with `bun update` | `bun update @godspeedai/*` |

Pin the minor line in scripts (`bun x @godspeedai/cognate-cli@0.5`) so generated apps stay reproducible.

`bunx` is not on PATH in every shell (`bunx: command not found`). Use `bun x` instead, which resolves the same package (checked with 0.5.0 on bun 1.4.0).

## Commands

Verify the live usage string with `cognate` (no arguments) before relying on this list; the same text ships in the installed package's `src/bin.ts`.

```bash
# Generate a starter app. The profile is copilot or harness; --with adds optional adapters (comma-separated).
cognate create <dir> --profile copilot|harness --source "$COGNATE_CHECKOUT" [--with a,b]   # --source is still required (DEBT-016)

# Run the app: runtime + Connect + AG-UI + UI server.
cognate dev [--port N]
```

The starter's `domain/` directory holds the app's `.sea` files. `cognate dev` loads them with `loadSemanticProjection`, so put the validated interaction model there (or have `domain/` reference `.sea/interaction/`) rather than keeping a second copy.

## Building without `create` (npm only)

An app does not need `create` or a checkout. It can depend directly on the published SDK packages and compose the runtime from its own entry point:

```bash
bun add @godspeedai/cognate-runtime-bun@0.5.0 @godspeedai/cognate-client@0.5.0 @godspeedai/cognate-runtime-api@0.5.0 @godspeedai/cognate-kernel-api@0.5.0
bun add @godspeedai/cognate-domainforge@0.5.0   # only when the app loads a .sea model
```

Add `typescript` and `@types/bun` as dev dependencies if you typecheck. These exact packages built and tested a refund-desk app on 2026-10-15 (a scratch project, not in this repo). Its entry point calls `createRuntime({ store, policy, actions, agents, components })` and `createClient({ service: runtime.service, caller })`. Its API usage is in [cognate-api.md](cognate-api.md).

Choose the route by what you need:

- **`create` (with a checkout)** when you want the copilot or harness starter: the UI, Connect, AG-UI, `cognate dev`, and a generated `domain/` and `.cognate/app.sqlite` setup. You accept the checkout dependency.
- **Direct npm dependencies** when the app owns its own server, auth, and HTTP surface, or when you want no checkout. You then create the SQLite store's parent directory yourself (see [cognate-api.md §10](cognate-api.md)), and you parse `.sea` yourself if you need it (SKILL.md step 2).

Pin all the `@godspeedai/cognate-*` packages you depend on to the same version, and move them together by changing those versions and re-running `bun install`.

## Updating this file when `create` gains a registry-only mode

`create` still vendors from `--source` (tracked as DEBT-016's remaining gap). When a registry-only mode lands:

1. Remove `--source` from the `create` example and the table row above. Check with `cognate create /tmp/x --profile copilot` (no flags).
2. Drop the `COGNATE_CHECKOUT` mentions from SKILL.md.
3. Re-run the smoke check: `cognate create /tmp/x --profile copilot`, then `cognate dev` in `/tmp/x`, and confirm the UI serves.
