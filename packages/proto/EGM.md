# packages/proto — proto build package

## Overview

This package turns the canonical `proto/cognate/v1/*.proto` sources into TypeScript bindings under `src/gen`, using a pinned local `protoc-gen-es` binary driven by `buf generate` `[packages/proto/buf.gen.yaml:plugins]`. It declares the generated output as its published `src` payload and re-exports every generated module from a single hand-written barrel `[packages/proto/package.json:exports]`. It owns no runtime logic of its own: its dependency surface is the protobuf runtime plus build-time-only buf/protoc tooling `[packages/proto/package.json:dependencies]`.

## Interface

- `generate` script — `bun scripts/generate.ts`, the only package script `[packages/proto/package.json:scripts]`
- `@bufbuild/protobuf` 2.15.0 — sole runtime dependency `[packages/proto/package.json:dependencies]`
- `@bufbuild/buf` 1.73.0 and `@bufbuild/protoc-gen-es` 2.15.0 — dev-only codegen toolchain `[packages/proto/package.json:devDependencies]`
- `exports["."]` — `./src/index.ts`, the barrel consumers import `[packages/proto/package.json:exports]`
- `version: v2` / `modules: path: ../../proto` — the buf module root is the repo-level `proto/` directory `[packages/proto/buf.yaml:modules]`
- `lint.use: STANDARD` and `breaking.use: FILE` — buf lint/breaking policy for those sources `[packages/proto/buf.yaml:lint]`
- Subdirectories: [scripts](./scripts/EGM.md) — the codegen driver
- `src/`, `src/gen/` and `test/` — barrel plus generated bindings and the codegen proof
- `node_modules/` — installed buf/protoc-gen-es binaries invoked by the script
- Repo-level `proto/cognate/v1/` — the canonical `.proto` sources this package compiles: `artifact`, `capability`, `cognitive`, `component`, `continuation`, `event`, `execution`, `identity`, `runtime`, `trace`. Every file is `proto3` in `package cognate.v1`; `runtime.proto` declares `service RuntimeService` with unary and server-streaming RPCs only, and caller identity comes from transport authentication rather than a message field `[proto/cognate/v1/runtime.proto:RuntimeService]`. No contract file is written under `proto/` or under `src/gen/`: the codegen proof at `packages/proto/test/codegen.test.ts:36` compares a digest of the entire regenerated tree against `src/gen`, so any non-generated file placed in either location fails CG-WIR-001

## Invariants

- Generated files are never hand-edited; changes go to `proto/` followed by a regeneration `[packages/proto/package.json:description]`
- `src/index.ts` is the only hand-written file and must keep its re-exports in sync with the generated message/enum/service modules `[packages/proto/src/index.ts:1]`
- Two independent generations must be byte-identical and equal to the committed `src/gen` contents `[packages/proto/test/codegen.test.ts:27]`
- The regenerated tree is expected to contain at least ten files `[packages/proto/test/codegen.test.ts:34]`
- The generated `RuntimeService` may expose only `unary` and `server_streaming` methods `[packages/proto/test/codegen.test.ts:43]`
- Inputs are pinned to the local plugin binary `node_modules/.bin/protoc-gen-es`, not a downloaded one `[packages/proto/buf.gen.yaml:plugins]`

## Side Effects

- Spawns `node_modules/.bin/buf generate --template buf.gen.yaml -o <outDir>` with the package directory as cwd `[packages/proto/scripts/generate.ts:Bun.spawn]`
- Writes and overwrites `.ts` files in the output directory `[packages/proto/scripts/generate.ts:outDir]`
- Propagates the child exit code, aborting the generator on any buf failure `[packages/proto/scripts/generate.ts:exitCode]`

## Verification

- Run: `bun test ./packages/proto/test/codegen.test.ts`
