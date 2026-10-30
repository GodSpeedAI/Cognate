# Cognate Blueprint

## System Overview

The root `package.json` declares the private package `cognate-workspace` with five `workspaces` globs — `packages/*`, `profiles/*`, `tests/e2e`, and two reconstruction trees under `validation/reconstructions/` — so published units and their test/reconstruction consumers link by workspace rather than by registry `[package.json:workspaces]`. All 45 `@godspeedai/cognate-*` packages are hoisted into root `devDependencies` as `workspace:*`, all at the linked version declared in `release-please-config.json` `[package.json:devDependencies, release-please-config.json:plugins]`. The `justfile` is the command surface over that workspace: `verify` chains `check`, `typecheck`, `docs`, two named test files, and `bun scripts/gate.ts --implemented` `[justfile:verify]`. Top-level trees divide by lifecycle stage: runtime code in `packages/` and `profiles/`, contracts in `proto/`, scaffolding in `templates/`, demonstrations in `examples/`, operational tooling in `scripts/`, and proof structures split between `compatibility/` (external dependency fixtures) and `validation/` (reconstruction exercises) `[packages/EGM.md:Overview, compatibility/EGM.md:Overview, validation/EGM.md:Overview]`. Prose is partitioned by owner: the README owns target state, `docs/` owns explanation, and `.agents/` owns status, plans, and evidence `[AGENTS.md:Documentation conventions]`. The last recorded status snapshot is revision 74, which recorded the EGM contract bootstrap `[.agents/CURRENT_STATUS.yaml:revision]`.

## Subdirectories & System Boundaries

- packages: [./packages/EGM.md](./packages/EGM.md) — every directory is an independently named `@godspeedai/*` workspace package with its own manifest `exports` and `src/` tree `[packages/EGM.md:Overview]`
- profiles: [./profiles/EGM.md](./profiles/EGM.md) — reference application profiles composing registered components into a complete app shape without adding kernel primitives `[profiles/EGM.md:Overview]`
- proto: [./proto/EGM.md](./proto/EGM.md) — canonical protobuf declarations under `cognate/v1`; `packages/proto` points `buf` here to generate TypeScript bindings `[proto/EGM.md:Overview]`
- scripts: [./scripts/EGM.md](./scripts/EGM.md) — repository-level operational scripts run with `bun`, wrapped by most `justfile` recipes and imported directly by tests `[scripts/EGM.md:Overview]`
- templates: [./templates/EGM.md](./templates/EGM.md) — the `starter/` tree `cognate create` copies, a `common/` base plus a `copilot/` or `harness/` overlay `[templates/EGM.md:Overview]`
- examples: [./examples/EGM.md](./examples/EGM.md) — 15 single-file `index.ts` demonstrations composing real workspace packages and throwing on an unexpected result, plus the multi-file `refund-desk` app under `src/` `[examples/EGM.md:Overview]`
- landing: [./landing/EGM.md](./landing/EGM.md) — a self-contained Astro site with its own `package.json`, lockfile, and Playwright config `[landing/EGM.md:Overview]`
- compatibility: [./compatibility/EGM.md](./compatibility/EGM.md) — Phase 0 fixtures, each a standalone project pinning one external dependency set to record observed behaviour `[compatibility/EGM.md:Overview]`
- validation: [./validation/EGM.md](./validation/EGM.md) — upper validation tree containing only `reconstructions/`, held outside `packages/` and `profiles/` `[validation/EGM.md:Overview]`
- actualize: [./actualize/EGM.md](./actualize/EGM.md) — a closed Product Actualizer run ledger with per-lens artifacts and evidence, whose only TypeScript is the fidelity measurement at `actualize/evidence/fidelity-qa/measure/measure.ts` `[actualize/evidence/fidelity-qa/measure/measure.ts:measure]`
- docs/ — human explanation tree with `README.md` as entry point and routing tables to concepts, architecture, and reference pages; no `EGM.md` on disk `[docs/README.md:Start here]`
- requirements/ — holds `ledger.yaml`, the candidate version 2 requirement, acceptance, and gate map read by the substrate check `[scripts/check-substrate.ts:ledgerPath]`
- tests/ — root test homes: `architecture/`, `e2e/`, `integration/`, `live/`, `properties/`, `support/`, plus root-level proof-routing, examples, and release-publication suites `[package.json:test]`
- brand/ — logo and lockup SVG/PNG assets plus its own `README.md`; no `EGM.md` on disk

## Local Interface & Invariants

- `package.json` is `private: true` at version `0.0.0`, pins `packageManager` to `bun@1.4.0`, and exposes `check`, `test`, `verify`, `typecheck`, per-example `example:*` entry points, plus `test:properties` and `test:e2e` `[package.json:scripts]`
- `justfile` defines the operator surface: site up/down/status/deploy, `status`, `check`, `typecheck`, `test`, `docs`, `verify`, `gate <id>`, `gates`, database lifecycle (`db-setup`, `db-up`, `db-migrate`, `db-backup`), and the live gates `remote-workspaces-live` and `sea-forge-live` `[justfile:gates]`
- `tsconfig.json` is a single no-emit config with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `types: ["bun"]`, and an `include` list covering `packages/*/src`, `packages/*/test`, `profiles/*`, `tests`, `scripts`, and `docs/.viewer/src` `[tsconfig.json:include]`
- `release-please-config.json` uses `release-type` `node`, `bump-minor-pre-major: true`, `include-component-in-tag: true`, and a `linked-versions` plugin grouping the `cognate SDK packages` so all components share one version `[release-please-config.json:plugins]`
- `.release-please-manifest.json` records every published package path at `0.8.0`, one entry per package directory `[.release-please-manifest.json:packages/a2a]`
- `bun.lock` is the single lockfile at the root beside `package.json`, whose `packageManager` field pins `bun@1.4.0` and is not git-ignored `[package.json:packageManager, .gitignore:node_modules/]`
- `LICENSE` is the Apache License, Version 2.0 `[LICENSE:Apache License]`
- `AGENTS.md` is the workspace operating contract, naming `.agents/CURRENT_STATUS.yaml` as current reality and `requirements/ledger.yaml` as the candidate requirement map `[AGENTS.md:Repository map]`

## Global Invariants

- Cross-package resolution goes through the workspace globs, not the registry: `packages/*`, `profiles/*`, `tests/e2e`, and two reconstruction packages `[package.json:workspaces]`
- Dependency direction is enforced mechanically by `tests/architecture/dependencies.test.ts`, which forbids listed edges via a `FORBIDDEN` map and pins each third-party dependency to an owning adapter via `OWNERS` `[tests/architecture/dependencies.test.ts:FORBIDDEN]`
- Upstream independence is also structural: `tests/architecture/invariants.test.ts` asserts, per spec §23, that no package imports or declares RxJS because streaming uses AsyncIterable/ReadableStream `[tests/architecture/invariants.test.ts:§23]`
- `scripts/check-substrate.ts` gates repository identity: it hashes the spec, requires a version 2 candidate ledger, requires named substrate files including `AGENTS.md`, `.agents/CURRENT_STATUS.yaml`, `.agents/OPEN_QUESTIONS.md`, and `.agents/DEBT.md`, and validates status history `[scripts/check-substrate.ts:specPath]`
- Status history is append-only and machine-checked: entries must be `---` plus one JSON-compatible object, revisions must strictly increase, and the latest snapshot's `revision` and `summary` must both appear in the human view (`**Status revision:** N` and `**Summary:** …`) `[scripts/check-substrate.ts:Human status view does not match the latest YAML snapshot]`
- Published manifests declare `"engines": { "bun": ">=1.4.0" }` and `license` `Apache-2.0`, matching the root `packageManager` pin `[packages/provider-anthropic-compatible/package.json:engines]`
- The ledger is explicitly a candidate, not a frozen contract, so no public requirement is frozen `[AGENTS.md:Architecture and boundaries]`

## Global Side Effects

- `.tmp/` is git-ignored scratch space used by setup recipes: the RealityTrace CLI installs to `.tmp/realitytrace`, the pg0 binary to `.tmp/pg0`, and OpenSSH to `.tmp/openssh` `[justfile:setup-realitytrace, justfile:setup-openssh, .gitignore:.tmp/]`
- `/graft/` is the graft code-graph cache; it is regenerable and not committed `[.gitignore:/graft/]`
- `.agents/CURRENT_STATUS.yaml` grows by two appended lines per update while `.agents/CURRENT_STATUS.md` is rewritten in place `[.agents/AGENTS.md:Workbench maintenance]`
- Local PostgreSQL instances persist under `~/.pg0/instances` and database dumps are written to `.tmp/backups/` by `db-backup` `[justfile:db-down, justfile:db-backup]`
- `node_modules/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, and `*.log` files are produced by installs, builds, and test runs and stay ignored `[.gitignore:node_modules/]`
- `landing/` mutates its own tree and a remote host: `site-deploy` runs `bun install`, `bun run build`, then `wrangler deploy` `[justfile:site-deploy]`

## System Verification

- Run: `just verify`
- Run: `just gates`
