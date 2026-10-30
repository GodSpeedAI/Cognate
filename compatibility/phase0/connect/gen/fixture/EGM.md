# fixture — generated package mirror

## Overview
Codegen intermediate level that reproduces the proto package hierarchy under `gen/`.
Its only purpose is to hold the version-scoped generated directory so the import path
`../gen/fixture/v1/echo_pb.js` resolves. Nothing in this directory is maintained by
hand.

## Subdirectories & Boundaries
- v1: [./v1/EGM.md](./v1/EGM.md) — generated `echo_pb.ts` for `cognate.fixture.v1`

## Global Invariants
- The path shape is dictated by the `.proto` package declaration and the plugin's `out` root, not chosen here `[compatibility/phase0/connect/buf.gen.yaml:version]`.
- Sources import through this path directly, so renaming it would break the server without any compile-time guard other than the import itself `[compatibility/phase0/connect/src/server.ts:EchoService]`.

## Global Side Effects
- None.

## Verification
- Regenerate: `cd compatibility/phase0/connect && bun run generate`
