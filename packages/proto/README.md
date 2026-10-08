# @godspeedai/proto

Generated TypeScript bindings for the canonical `proto/` sources (spec §21). Generated code
(`src/gen/**`) is committed and never edited by hand; `src/index.ts` re-exports `RuntimeService`,
every message and enum.

Regenerate with `bun scripts/generate.ts [outDir]` (default `src/gen`). It runs `buf generate`
against `buf.gen.yaml`, using the pinned local `protoc-gen-es` binary from `node_modules/.bin`,
`target=ts`, reading `../../proto` (the canonical sources) via `buf.yaml`. Generation is
deterministic: two runs into separate directories are byte-identical to each other and to the
committed `src/gen`.

## Supported mode matrix

| Concern | Support |
| --- | --- |
| Message/enum codegen | Full (all `proto/cognate/v1/*.proto`) |
| `RuntimeService` methods | Unary + server-streaming only (DEBT-004); no client/bidi streaming methods exist in the schema |
| Wire formats | JSON and binary (protobuf-es `Message` supports both; format choice is a transport concern) |
| Codegen determinism | Verified by `test/codegen.test.ts` (two fresh generations + committed output, byte-for-byte) |
