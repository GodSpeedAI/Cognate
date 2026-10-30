# proto / src — generated protobuf bindings

## Overview

`index.ts` re-exports the generated TypeScript bindings for the canonical `proto/` sources and nothing else `[index.ts:1]`. `src/gen/cognate/v1/` holds the generated modules (`identity_pb`, `artifact_pb`, `capability_pb`, `continuation_pb`, `event_pb`, `execution_pb`, `component_pb`, `cognitive_pb`, `trace_pb`, `runtime_pb`), which are never edited by hand `[index.ts:3]`. Regeneration runs the pinned `protoc-gen-es` plugin via `bun scripts/generate.ts` into `src/gen` `[index.ts:2]`.

## Interface

- `./gen/cognate/v1/identity_pb.js` — identity messages `[index.ts:3]`
- `./gen/cognate/v1/artifact_pb.js` / `capability_pb.js` / `continuation_pb.js` — artifact, capability, and continuation messages `[index.ts:4]`
- `./gen/cognate/v1/event_pb.js` / `execution_pb.js` — event and execution messages `[index.ts:7]`
- `./gen/cognate/v1/component_pb.js` / `cognitive_pb.js` / `trace_pb.js` — component, cognitive, and trace messages `[index.ts:9]`
- `./gen/cognate/v1/runtime_pb.js` — the `RuntimeService` service descriptor the Connect adapter binds `[index.ts:12]`

## Invariants

- Files under `src/gen` are generated output and must never be edited by hand `[index.ts:1]`
- The only runtime dependency is `@bufbuild/protobuf`; `buf` and `protoc-gen-es` are dev-only
- `bun scripts/generate.ts` writes into `src/gen` by default and exits with the `buf` process code on failure
- Consumers import enums and service descriptors from this package rather than regenerating: `protocol-connect` binds `RuntimeServiceDesc` from `@godspeedai/cognate-proto` `[index.ts:12]`

## Side Effects

- None at import time. The `generate` script spawns `node_modules/.bin/buf` and writes files under `src/gen`

## Verification

- Run: `bun test ./packages/proto/test/codegen.test.ts`
