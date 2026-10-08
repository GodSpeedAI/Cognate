# Cognate CLI

This file is the only place in the skill that says how the Cognate CLI is installed and invoked. Everything else says `cognate <command>`. When the CLI's distribution changes, update this file only.

## Distribution mode

**Current mode: source checkout.** `@godspeedai/cli` is private (version `0.0.0`) and not yet on npm (DEBT-016). Every `@godspeedai/*` package comes from a local Cognate checkout.

| Setting | Source checkout (current) | Published (future) |
| --- | --- | --- |
| `COGNATE_CHECKOUT` | path to a Cognate clone, e.g. `~/projects/cognate` | not needed |
| `cognate` means | `bun $COGNATE_CHECKOUT/packages/cli/src/bin.ts` | `bunx @godspeedai/cli` (or `cognate` after `bun add -g @godspeedai/cli`) |
| `create` package source | `--source $COGNATE_CHECKOUT` (packs and vendors packages) | npm registry, pinned versions |
| Upgrade the app | re-run `create` against a newer checkout, or re-vendor | `bun update @godspeedai/*` |

## Commands

The live usage string is in `packages/cli/src/bin.ts`. Verify it with `cognate` (no arguments) before relying on this list.

```bash
# Generate a starter app. The profile is copilot or harness; --with adds optional adapters (comma-separated).
cognate create <dir> --profile copilot|harness --source "$COGNATE_CHECKOUT" [--with a,b]

# Run the app: runtime + Connect + AG-UI + UI server.
cognate dev [--port N]
```

The starter's `domain/` directory holds the app's `.sea` files. `cognate dev` loads them with `loadSemanticProjection`, so put the validated interaction model there (or have `domain/` reference `.sea/interaction/`) rather than keeping a second copy.

## Updating this file when the CLI is published

1. Change **Current mode** to `published`, and fill in the real package name and version range in the table.
2. Remove `--source` from the `create` example if the published CLI drops it. Check with `cognate create` without flags.
3. Replace the source-checkout install step in SKILL.md's "Tooling" section with the published install command.
4. Re-run the skill's smoke check: `cognate create /tmp/x --profile copilot` (plus `--source` if still required), then `cognate dev` in `/tmp/x`, and confirm the UI serves.
