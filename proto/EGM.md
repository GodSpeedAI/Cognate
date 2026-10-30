# proto

## Overview
The canonical protobuf source tree for Cognate's wire protocol, versioned under `cognate/v1`. It holds declarations only: `packages/proto` points `buf` at this directory and generates the TypeScript bindings that the transport and runtime packages consume.

## Subdirectories & Boundaries
- cognate/: [./cognate/EGM.md](./cognate/EGM.md) — versioned schema tree and the only module path registered with `buf` (`modules[0].path = ../../proto`) `[packages/proto/buf.yaml:modules]`
- v1: [./cognate/v1/EGM.md](./cognate/v1/EGM.md) — the `cognate.v1` message set, one `.proto` file per framework concept

## Global Invariants
- The tree contains `.proto` files only; the architecture suite globs `proto` for `*.proto` and joins them into one schema to assert message names `[tests/architecture/invariants.test.ts:files("proto", /\.proto$/)]`
- No `.sea` file may be imported from any proto source `[tests/architecture/invariants.test.ts:expect(proto).not.toMatch(/import\s+"[^"]*\.sea"/)]`
- Generated bindings are never hand-edited; the package description states the generated files live in `packages/proto` and are regenerated, not patched `[packages/proto/package.json:description]`
- Codegen is pinned to a single local plugin (`protoc-gen-es` target=ts) with input `directory: ../../proto`, so this tree is the only input `[packages/proto/buf.gen.yaml:plugins]`

## Global Side Effects
- None in this directory: it is read as codegen input and never written `[packages/proto/buf.gen.yaml:inputs]`
- Codegen output is written to `packages/proto/src/gen` by `bun scripts/generate.ts`, invoked from the package directory `[packages/proto/package.json:scripts.generate]`

## Verification
- Run: `bun test ./packages/proto/test/codegen.test.ts`
