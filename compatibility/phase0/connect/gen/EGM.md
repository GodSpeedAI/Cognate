# gen — generated protobuf output

## Overview
This tree is codegen output, not authored source. `buf.gen.yaml` runs the local
`protoc-gen-es` plugin over `proto/` with `target=ts` and writes the result here, and
the `generate` script wraps that invocation. Regenerating from a clean tree produced
byte-identical files.

## Subdirectories & Boundaries
- fixture: [./fixture/EGM.md](./fixture/EGM.md) — generated code mirroring the `fixture/v1` proto package

## Global Invariants
- Output is regenerated wholesale; hand edits here would be destroyed by `buf generate` `[compatibility/phase0/connect/buf.gen.yaml:out]`.
- The generator is `protoc-gen-es` resolved from `node_modules/.bin`, pinned as a dev dependency at 2.15.0 `[compatibility/phase0/connect/package.json:devDependencies]`.
- Regeneration is deterministic: two clean runs produced byte-identical output, verified with `sha256sum` `[compatibility/phase0/connect/API_NOTES.md:Codegen config]`.
- Generated files are imported with a `.js` specifier from TypeScript sources, so the emit must be consumable under the ESM resolution Bun uses `[compatibility/phase0/connect/src/client.ts:EchoService]`.

## Global Side Effects
- Codegen writes into this directory on disk `[compatibility/phase0/connect/buf.gen.yaml:plugins]`.

## Verification
- Regenerate: `cd compatibility/phase0/connect && bun run generate`
- Run: `cd compatibility/phase0/connect && bun test`
