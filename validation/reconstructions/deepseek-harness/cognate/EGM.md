# deepseek-harness/cognate — Cognate Console reconstruction app

## Overview

This is an independent third-party reconstruction: a Cognate app that rebuilds the DeepSeek Harness
Web UI's first-use surface plus tool execution, approvals, delegation, plan mode, remote
workspaces, cognitive navigation, and the capability-native Workbench. The tree's own docs establish
that purpose and the tranche/journey breakdown (`[validation/reconstructions/deepseek-harness/cognate/README.md]`, `[validation/reconstructions/deepseek-harness/cognate/DESIGN.md]`, `[validation/reconstructions/deepseek-harness/cognate/PRODUCT.md]`,
`[validation/reconstructions/deepseek-harness/cognate/BINDINGS.md]`, `[validation/reconstructions/deepseek-harness/cognate/WORKBENCH-PLAN.md]`, all at the tree root); the surrounding evidence file
`[validation/reconstructions/deepseek-harness/architecture-evidence.md]` records the architectural-purity results for that reconstruction.
The code is one Bun process composing a runtime from the workspace packages, with the domain model
loaded in place from `.sea`.

## Interface

- `scripts.test` — `bun test ./test --timeout=30000`; `scripts.dev` serves on `PORT=3180` `[validation/reconstructions/deepseek-harness/cognate/package.json:scripts]`
- Runtime packages consumed: `-runtime-bun`, `-kernel-api`, `-projections`, `-execution` (+`-ssh`, `-wsl`), providers, `-realitytrace`, `-ui-astryx` `[validation/reconstructions/deepseek-harness/cognate/package.json:dependencies]`
- `cognate.config.ts` — app metadata only; `profile: "harness"` and an `instructions` string, explicitly not consumed by the server `[validation/reconstructions/deepseek-harness/cognate/cognate.config.ts]`
- Subdirectories: [src](./src/EGM.md) — server, agents, capabilities, cognitive modules, projections, workbench domain, UI
- `domain/` — the in-place `.sea` loader and gate functions, a sibling of `src` `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`

## Invariants

- No DeepSeek Harness, `@deepseek-ai/*`, or `dsh-*` package is a dependency; the reconstruction is a plain Cognate workspace `[validation/reconstructions/deepseek-harness/cognate/package.json:dependencies]`
- The `.sea` interaction model is read in place at startup, never copied or symlinked, and a parse failure throws `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:loadDomain]`
- Binding groups assert their exact expected contract count and throw on mismatch rather than binding partially `[validation/reconstructions/deepseek-harness/cognate/domain/index.ts:bindTranche5]`
- The evidence file records that the app still works after the reference checkout is removed `[validation/reconstructions/deepseek-harness/architecture-evidence.md]`

## Side Effects

- `bun run dev` / `bun run start` bind loopback HTTP and open a PostgreSQL-backed runtime `[validation/reconstructions/deepseek-harness/cognate/package.json:scripts]`
- Boot creates `$COGNATE_HARNESS_HOME` (default `.data`) and a `secrets.json` store there `[validation/reconstructions/deepseek-harness/cognate/src/server.ts:startServer]`
- RealityTrace delivery spawns the pinned SXR CLI when a binary is found `[validation/reconstructions/deepseek-harness/cognate/src/observations.ts:wireObservations]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test`
