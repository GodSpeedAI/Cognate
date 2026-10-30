# protocol-connect / src — Connect service mapping

## Overview

`registerRuntimeService` binds every `RuntimeService` method to a route on a Connect router and maps `ServiceError` codes to Connect codes `[index.ts:registerRuntimeService]`. `createRemoteRuntimeService` is the mirror: a `RuntimeService` implemented over a Connect transport whose per-caller credential comes from `tokenFor` `[index.ts:createRemoteRuntimeService]`. Caller identity always comes from the transport's authenticator, never from a message body `[index.ts:1]`.

## Interface

- `registerRuntimeService` — server routes for `startRun`, `getRun`, `cancelRun`, `streamEvents`, continuations, projections, state, remote offers, and observations `[index.ts:registerRuntimeService]`
- `createRemoteRuntimeService` — remote `RuntimeService` over a `Transport` `[index.ts:createRemoteRuntimeService]`
- `errorCodes` — the exported `ServiceErrorCode` to Connect `Code` table `[index.ts:errorCodes]`
- `HandlerOptions` — `authenticate(headers)` plus `maxJsonDepth` `[index.ts:HandlerOptions]`
- `decodeValue` — internal `google.protobuf.Value` decoder enforcing the depth bound `[index.ts:decodeValue]`
- `requireCaller` — internal guard turning a missing caller into `Code.Unauthenticated` `[index.ts:requireCaller]`

## Invariants

- `errorCodes` covers all nine `ServiceErrorCode` variants, and the inverse map is built from it, so a code round-trips in both directions `[index.ts:errorCodes]`
- A JSON value deeper than `maxJsonDepth` is rejected with `Code.InvalidArgument` before reaching the service `[index.ts:decodeValue]`
- An absent `Value` or one with no oneof case decodes to JSON `null` instead of raising `@bufbuild/protobuf`'s value error `[index.ts:valueToJson]`
- `uint64` wire fields convert through `BigInt` and back, so positions above `Number.MAX_SAFE_INTEGER` never silently truncate on encode `[index.ts:toBigInt]`
- A request with no authenticated caller fails with `Code.Unauthenticated` before any service call `[index.ts:requireCaller]`
- Aborting a `streamEvents` signal ends the remote iteration without raising `[index.ts:createRemoteRuntimeService]`
- An unrecognized `ResolveOutcome` falls back to `transitioned` when decoding `resolveContinuation` `[index.ts:createRemoteRuntimeService]`

## Side Effects

- RPC calls over the supplied `Transport` on the client path `[index.ts:createRemoteRuntimeService]`
- Reading the `authorization` request header through the `authenticate` callback `[index.ts:requireCaller]`
- Abort-signal listeners registered per handler call so an aborted request rejects the pending work `[index.ts:withDeadline]`

## Verification

- Run: `cd packages/protocol-connect && bun test`
