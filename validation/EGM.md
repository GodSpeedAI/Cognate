# validation — reconstruction validation root

## Overview
The upper of two validation trees. It contains only `reconstructions/`; there is no code, config or test file at this level. Its purpose is to hold third-party reconstruction exercises that are validated against pinned external references, kept outside the workspace's `packages/` and `profiles/` trees.

## Subdirectories & Boundaries
- `reconstructions`: [./reconstructions/EGM.md](./reconstructions/EGM.md) — the two independent reconstruction exercises and their shared method

## Global Invariants
- Validation is organized by reconstruction target, so each exercise owns its own reference pin, parity report and purity tests rather than sharing one `[validation/reconstructions/copilot/reference-manifest.json:1]`
- The two reconstruction apps are real workspace members, declared explicitly in the root workspaces list `[package.json:workspaces]`
- Nothing in this tree is a product package; the root test script does not include it `[package.json:scripts.test]`

## Global Side Effects
- None.

## Verification
- Run: `bun run check`
