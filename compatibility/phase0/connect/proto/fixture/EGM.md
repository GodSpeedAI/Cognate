# fixture — the fixture proto package hierarchy

## Overview
A version-scoped namespace holding exactly one hand-written `.proto` file. The
directory path mirrors the proto package (`fixture/v1` → `cognate.fixture.v1`) so the
generated output lands in a matching `gen/fixture/v1` tree. Nothing here is generated
or downloaded.

## Subdirectories & Boundaries
- v1: [./v1/EGM.md](./v1/EGM.md) — the `echo.proto` fixture source declaring `EchoService`

## Global Invariants
- The directory path and the declared proto package must correspond, which is what places generated output under `gen/fixture/v1/` `[compatibility/phase0/connect/buf.gen.yaml:out]`.
- Because breaking-change detection is `FILE`-scoped, a future `v2` would be a new file rather than an in-place edit `[compatibility/phase0/connect/buf.yaml:breaking]`.

## Global Side Effects
- None.

## Verification
- Run: `cd compatibility/phase0/connect && bun run generate`
