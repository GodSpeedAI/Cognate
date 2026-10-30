# protocol-connect — RuntimeService on the Connect wire

## Overview

`package.json` declares `@godspeedai/cognate-protocol-connect`, which maps `RuntimeService` onto the generated Connect service as server routes and a remote client, transport-agnostically. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`. Server hosting and the Bun fetch transport live in the separate `@godspeedai/cognate-protocol-connect-bun` package, which is a dev-only dependency here.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `registerRuntimeService`, `createRemoteRuntimeService`, the `ServiceError` to Connect code table, and the wire mappers

## Global Invariants

- The package depends on `@godspeedai/cognate-proto` for the generated service descriptor and on `@connectrpc/connect` for the router and client types `[packages/protocol-connect/package.json:dependencies]`
- `@godspeedai/cognate-protocol-connect-bun` and `@godspeedai/cognate-runtime-bun` are dev-only, so the mapping layer stays transport-independent `[packages/protocol-connect/package.json:devDependencies]`

## Global Side Effects

- None at package load; authentication is delegated to the caller-supplied `authenticate` option at request time `[packages/protocol-connect/package.json:exports]`

## Verification

- Run: `cd packages/protocol-connect && bun test`
