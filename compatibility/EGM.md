# compatibility

## Overview
This directory holds Phase 0 dependency-proof fixtures. Each subdirectory is a
standalone Bun/npm project that pins one external dependency set and records what
that dependency actually does, rather than what its documentation claims. No
fixture is a workspace package; the framework that consumes these findings lives
under `packages/` and `profiles/`.

## Subdirectories & Boundaries
- phase0: [./phase0/EGM.md](./phase0/EGM.md) — per-dependency Bun compatibility fixtures, including the Connect/UI vertical slice

## Global Invariants
- Every fixture is a private package that pins exact dependency versions instead of ranges `[compatibility/phase0/connect/package.json:dependencies]`.
- Fixtures are not root workspace members; the workspace list names only `packages/*`, `profiles/*`, `tests/e2e`, and two validation paths `[package.json:workspaces]`.
- The root `test` script reaches into compatibility for exactly one file, so fixture suites run only from their own directories `[package.json:scripts.test]`.
- A fixture may record a failing behavior as the expected result; the client-streaming assertion expects a transport error `[compatibility/phase0/connect/connect.test.ts:client streaming]`.

## Global Side Effects
- Fixture suites bind real loopback TCP ports at runtime `[compatibility/phase0/connect/connect.test.ts:beforeAll]`.
- The UI fixture spawns a `bun run playwright-server.tsx` child process and talks to it on a fixed port `[compatibility/phase0/ui/pw-global-setup.ts:globalSetup]`.
- A browser bundle is written to disk by an explicit build step `[compatibility/phase0/ui/dist-client/client-entry.js]`.

## Verification
- Run: `bun test ./compatibility/phase0/sqlite.test.ts` (from the repo root; the only compatibility suite in the root test script)
