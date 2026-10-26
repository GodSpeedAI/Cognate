# README reframe — observed verification (2026-10-26)

Mission: reframe the root README (public positioning) without changing SDK code. All commands were run in the `docs/readme-reframe` worktree (branched from `main` at 81f4aac) unless noted.

## Gates run after the rewrite

| Command | Observed result |
| --- | --- |
| `bun test tests/architecture/docs.test.ts` | 5 pass, 0 fail — the README example tree parses to 15 names, every documentation-map page exists, every relative link in README/docs/package guides resolves |
| `bun test tests/examples.test.ts` | 16 pass, 0 fail — parse test plus all 15 examples run and print `ok:` outcomes |
| `bun scripts/check-readmes.mjs` | 45 published package READMEs checked, OK |
| `bun test ./tests/proof-routing.test.ts` | 5 pass, 0 fail |
| `bun test ./tests/release-publication.test.mjs` | 9 pass, 0 fail |
| `bun run check` | Substrate check passed: 81 requirements (81 implemented, 0 blocked, 0 candidate) |

The worktree needed `bun install` (fresh checkout, 309 packages) before the examples gate could run.

## Quick-start claims re-verified against the public surface

- `npx skills add GodSpeedAI/Cognate --skill building-with-cognate --skill deriving-interaction-domain-models --skill domainforge-sea -a claude-code -y` — run in an empty sandbox: installs the three skills (exit 0; files under `.claude/skills/`). The repository is public on GitHub (verified via `gh repo view`).
- `examples/refund-desk` (on `feature/landing-repositioning`): `bun install && bun test` → 7 pass, 0 fail. The README's Refund Desk example and its event list (`refund.proposed`, `refund.awaiting_approval`, `refund.approved`/`refund.denied`, `refund.issued`) match this app's tests.
- `npm view @godspeedai/cognate` → 0.7.1 (umbrella, cli, runtime-bun, ui-astryx, store-sqlite all 0.7.1). The README deliberately pins no version number.
- `bunx @godspeedai/cognate-cli@latest create my-app --profile copilot` (no `--source`) → **fails**, exit 1, "cognate create: --source is required". The debt-burndown branch (45c4ce2) implements registry-mode create ("works from npm without --source; the starter template ships in the CLI tarball") but it is unpublished. Verified locally: running that CLI from the checkout creates the app, `bun install` resolves 56 packages from the registry, `bun test` passes 1/1. **The README therefore keeps the `--source` scaffold instruction and cites DEBT-016 until that release ships.**

## Facts carried into the new README

- The skills quick-start fences (mkdir/skills/test lines and the first-request text block) are byte-identical to `landing/src/data/onboarding.ts`, which `landing/tests/readme.test.ts` asserts against the README — kept so the landing branch merges without breaking its tests.
- Workbench's Experts and Teams are now on Workbench main (`src/experts`, `src/schedules` present; README lists them under "What works today"). The landing page's "in development on a branch" presentation was stale and is corrected on the landing branch.
- The README does not link `docs/explainers/` (exists only as uncommitted working-tree files, not on main).

## Known limits of this change

- Merge conflict with the debt-burndown branch's small README edits (status banner, quick start) is expected; this rewrite supersedes them and folds in their corrections (Connect unary/server-streaming, `maxConcurrentRuns`).
- The `docs/readme-reframe` branch is local; pushing and merging are reserved to the operator.
