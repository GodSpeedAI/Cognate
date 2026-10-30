# packages/proto/scripts — codegen driver

## Overview

A single executable module that regenerates the TypeScript bindings by shelling out to the package's pinned `buf` binary. It contains no schema logic and no codegen templates: it resolves the package directory and output directory, spawns `buf generate` against `buf.gen.yaml`, and forwards the exit status `[packages/proto/scripts/generate.ts:fileURLToPath]`. The emitted files land in `src/gen` by default, which is what the committed bindings were produced from `[packages/proto/buf.gen.yaml:inputs]`.

## Interface

- `packageDir` — resolved to the parent of this script's own URL, i.e. `packages/proto` `[packages/proto/scripts/generate.ts:packageDir]`
- `outDir` — `resolve(process.cwd(), argv[2] ?? "src/gen")`; the first CLI argument overrides the output directory `[packages/proto/scripts/generate.ts:outDir]`
- Process entrypoint — top-level `Bun.spawn` plus `await proc.exited`; nothing else is exported `[packages/proto/scripts/generate.ts:Bun.spawn]`
- Invoked by `package.json` as `bun scripts/generate.ts` `[packages/proto/package.json:scripts]`
- Invoked by tests as `bun scripts/generate.ts <outDir>` with `cwd: packages/proto` `[packages/proto/test/codegen.test.ts:22]`

## Invariants

- The template is always the checked-in `buf.gen.yaml`; the script passes it explicitly with `--template` `[packages/proto/scripts/generate.ts:Bun.spawn]`
- The generation output is deterministic: the same template and pinned plugin must reproduce the committed tree byte for byte `[packages/proto/test/codegen.test.ts:27]`
- The plugin is the local binary recorded in the template, so generation needs no network install `[packages/proto/buf.gen.yaml:plugins]`
- `outDir` is expressed relative to the caller's working directory, not the package directory, so a test override redirects output without touching `src/gen` `[packages/proto/scripts/generate.ts:outDir]`

## Side Effects

- Spawns a child process with `stdout`/`stderr` inherited, so buf output appears on the caller's streams `[packages/proto/scripts/generate.ts:Bun.spawn]`
- Creates or overwrites generated `.ts` files in `outDir` `[packages/proto/scripts/generate.ts:outDir]`
- Terminates the process with the child's non-zero exit code `[packages/proto/scripts/generate.ts:exitCode]`

## Verification

- Run: `bun test ./packages/proto/test/codegen.test.ts`
