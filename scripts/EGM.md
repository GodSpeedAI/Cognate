# scripts

## Overview
Repository-level operational scripts, run directly with `bun` (or `node` for the `.mjs` release helpers) rather than published. The `justfile` recipes are thin wrappers over most of them, and the gate and viewer scripts are imported by tests as ordinary modules.

## Interface
- `check-substrate.ts` — validates the spec digest, ledger identity, status documents, DEBT bindings, and install skew `[scripts/check-substrate.ts:const errors: string[] = []]`
- `gate.ts` — runs one ledger proof gate or every gate (`--all`, `--implemented`) and reports status drift `[scripts/gate.ts:runGate]`
- `ledger-status.ts` — rewrites one requirement's `status`/`evidence`/`debt` lines in `requirements/ledger.yaml` in place `[scripts/ledger-status.ts:lines.splice]`
- `sync-workspace-deps.ts` — rewrites root `devDependencies` to exactly the `packages/*` and `profiles/*` workspace packages `[scripts/sync-workspace-deps.ts:Bun.write]`
- `db.ts` — local PostgreSQL lifecycle (`up`, `down`, `status`, `migrate`, `backup`, `restore`, `vacuum`) over the pinned pg0 binary `[scripts/db.ts:switch (command)]`
- `setup-pg0.ts` / `setup-openssh.ts` — download and verify pinned local binaries into `.tmp/` `[scripts/setup-pg0.ts:DIGESTS]`
- `remote-workspaces-live.ts` — runs the live SSH/WSL suite after ensuring an OpenSSH build exists `[scripts/remote-workspaces-live.ts:Bun.spawn]`
- `bench-stores.ts` — append/latency benchmarks across SQLite, PostgreSQL, and memory stores `[scripts/bench-stores.ts:percentile]`
- `clean-room-smoke.ts` — out-of-monorepo consumer smoke for the published umbrella SDK `[scripts/clean-room-smoke.ts:SMOKE PASS]`
- Release helpers: `plan-sdk-release.mjs`, `prepare-npm-package.mjs`, `inspect-npm-tarballs.mjs`, `verify-sdk-publication.mjs`, `check-unified-release-config.mjs` `[scripts/plan-sdk-release.mjs:process.stdout.write]`
- Doc gate: `check-readmes.mjs` — mechanical README standard check per published package `[scripts/check-readmes.mjs:const problems = []]`
- Launch helpers: `copilot.ts` and `harness.ts` manage the reconstructed validation apps with a pid/state file under `.tmp/` `[scripts/copilot.ts:STATE_FILE, scripts/harness.ts:STATE_FILE]`
- `show-documents.ts` — the Artifact Viewer launcher `[scripts/show-documents.ts:main]`
- Subdirectories: [viewer](./viewer/EGM.md) — Artifact Viewer implementation modules (paths, corpus, git, service, assets)

## Invariants
- A gate whose proof paths are missing exits 1 and reports the missing path; it never skips `[scripts/gate.ts:unmet gate]`
- Whole-ledger runs take an exclusive `.tmp/gates.lock` and treat a lock held by a dead pid as stale `[scripts/gate.ts:acquireLock]`
- `check-substrate.ts` rejects a ledger that is not `ledger_version: 2` with `freeze_hash: candidate` `[scripts/check-substrate.ts:Expected a version 2 candidate ledger]`
- A status document must be a complete two-line pair, end with a newline, and have strictly increasing `revision` `[scripts/check-substrate.ts:revision must increase]`
- A pinned dependency installed at a different version than its binding fails the substrate check with the fix in the message `[scripts/check-substrate.ts:Install skew]`
- `prepare-npm-package.mjs` rewrites only `workspace:*`, `workspace:^`, and `workspace:~` on non-dev sections, and skips devDependencies `[scripts/prepare-npm-package.mjs:devDependencies are not touched]`
- Planning a release fails closed when any linked SDK version diverges `[scripts/plan-sdk-release.mjs:Linked SDK versions diverge]`
- `setup-pg0.ts` fails for a platform with no recorded sha256 instead of downloading unpinned `[scripts/setup-pg0.ts:no recorded sha256 for]`
- `check-readmes.mjs` exits non-zero, printing one line per problem `[scripts/check-readmes.mjs:process.exit(1)]`

## Side Effects
- Writes `requirements/ledger.yaml`, root `package.json`, and per-package `package.json` files in place `[scripts/sync-workspace-deps.ts:Bun.write, scripts/ledger-status.ts:writeFileSync]`
- Creates `.tmp/pg0`, `.tmp/openssh`, `.tmp/backups`, `.tmp/copilot-cognate`, `.tmp/harness`, and `.tmp/gates.lock` `[scripts/setup-pg0.ts:binDir, scripts/db.ts:BACKUP_DIR]`
- Network downloads: the OpenSSH tarball from `cdn.openbsd.org` and the pg0 release binary `[scripts/setup-openssh.ts:fetch]`
- Spawns child processes: `pg0`, `pg_dump`, `psql`, `ssh` setup builds, `bun test`, and the dev servers `[scripts/db.ts:spawnSync]`
- Queries the public npm registry for publication receipts `[scripts/verify-sdk-publication.mjs:PUBLIC_NPM_REGISTRY]`
- Starts and stops long-lived dev servers recorded in `.tmp/**/state.json` `[scripts/copilot.ts:STATE_FILE]`

## Verification
- Run: `bun test ./tests/proof-routing.test.ts ./tests/release-publication.test.mjs ./tests/integration/cli-create.test.ts`
