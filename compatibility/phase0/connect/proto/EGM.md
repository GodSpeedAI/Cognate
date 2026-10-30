# proto — hand-written fixture proto sources

## Overview
The buf module input. Everything under `fixture/v1` is written by hand and is the
source of truth for the generated code in `connect/gen/`; `buf.gen.yaml` names this
directory as its only input. The message and RPC shapes here are chosen to exercise
unary, server-streaming, and client-streaming over Connect.

## Subdirectories & Boundaries
- fixture: [./fixture/EGM.md](./fixture/EGM.md) — the fixture package hierarchy

## Global Invariants
- `buf.yaml` declares this directory as the single module path, so it is the entire lint and generation root `[compatibility/phase0/connect/buf.yaml:modules]`.
- Linting uses the `STANDARD` rule set and breaking-change detection uses `FILE` `[compatibility/phase0/connect/buf.yaml:lint]`.
- Codegen reads this directory in place, with no copy or staging step `[compatibility/phase0/connect/buf.gen.yaml:inputs]`.

## Global Side Effects
- None.

## Verification
- Run: `cd compatibility/phase0/connect && bun run generate`
