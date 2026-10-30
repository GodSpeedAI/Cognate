# connect — Phase 0 Connect RPC fixture

## Overview
A self-contained Connect RPC app proving the Connect stack runs under Bun. A
hand-written `.proto` fixture is compiled to TypeScript by `buf generate`, and a
`src/` layer serves it through `Bun.serve()`. `connect.test.ts` drives a real server on
an ephemeral port through a client that holds only a fetch transport.

## Interface
- `generate` — the codegen entrypoint, `buf generate` `[compatibility/phase0/connect/package.json:scripts.generate]`
- `test` — `bun test connect.test.ts` `[compatibility/phase0/connect/package.json:scripts.test]`
- `modules` — the buf module rooted at `proto`, with `STANDARD` lint and `FILE` breaking rules `[compatibility/phase0/connect/buf.yaml:modules]`
- Codegen wiring: `protoc-gen-es` with `target=ts` writing to `gen` from `proto` `[compatibility/phase0/connect/buf.gen.yaml:plugins]`
- Subdirectories: [./src/EGM.md](./src/EGM.md) — client, server, and the Bun fetch adapter
- Subdirectories: [./proto/EGM.md](./proto/EGM.md) — hand-written `.proto` fixture sources
- Subdirectories: [./gen/EGM.md](./gen/EGM.md) — generated code produced from `proto/`

## Invariants
- The generated package name is `cognate.fixture.v1`, so every message and service lives under that namespace `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:package]`.
- Generated output is a pure function of the `.proto`; running codegen twice produced byte-identical output `[compatibility/phase0/connect/API_NOTES.md:Codegen config]`.
- There is no separate Connect-ES generator: `protoc-gen-es` emits the `GenService` descriptor into the `_pb.ts` file `[compatibility/phase0/connect/API_NOTES.md:There is no separate Connect-ES]`.
- The fixture defines no bidirectional RPC, so bidi is neither tested nor claimed `[compatibility/phase0/connect/connect.test.ts:Bidirectional streaming]`.
- Client streaming is asserted to fail with `Code.Unknown` and the exact transport message, not worked around `[compatibility/phase0/connect/connect.test.ts:client streaming]`.

## Side Effects
- Tests bind an ephemeral loopback port via `Bun.serve({ port: 0 })` and stop it in `afterAll` `[compatibility/phase0/connect/connect.test.ts:beforeAll]`.
- One test restarts the server on the previously bound port `[compatibility/phase0/connect/connect.test.ts:server restart]`.
- `buf generate` writes files into `gen/` on disk `[compatibility/phase0/connect/buf.gen.yaml:plugins]`.

## Verification
- Run: `cd compatibility/phase0/connect && bun test`
- Regenerate: `cd compatibility/phase0/connect && bun run generate`
