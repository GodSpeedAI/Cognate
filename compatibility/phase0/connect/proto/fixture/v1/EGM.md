# v1 — the `echo.proto` fixture source

## Overview
The single hand-written proto file in the repository's Connect fixture, declaring
package `cognate.fixture.v1` with one service and six messages. Its RPC set is
deliberately one of each streaming shape the Connect protocol distinguishes. It is an
input to codegen and is never written by a tool.

## Interface
- `EchoService` — the only service, with three RPCs `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:EchoService]`
- `Unary(EchoRequest) returns (EchoResponse)` — single request, single response `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:Unary]`
- `ServerStream(ServerStreamRequest) returns (stream ServerStreamResponse)` — ordered multi-message response stream `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ServerStream]`
- `ClientStream(stream ClientStreamRequest) returns (ClientStreamResponse)` — multi-message request stream, single response `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ClientStream]`
- `EchoRequest` / `EchoResponse` — each carries a single `string message = 1` `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:EchoRequest]`
- `ServerStreamRequest` — `string message = 1`, `int32 count = 2` `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ServerStreamRequest]`
- `ServerStreamResponse` — `string message = 1`, `int32 sequence = 2` `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ServerStreamResponse]`
- `ClientStreamRequest` — `string message = 1` `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ClientStreamRequest]`
- `ClientStreamResponse` — `string message = 1`, `int32 count = 2` `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ClientStreamResponse]`

## Invariants
- Syntax is `proto3`, so all fields are optional on the wire and there are no required fields `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:syntax]`.
- No RPC is declared `stream`-to-`stream`; bidirectional streaming is structurally absent `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:EchoService]`.
- `sequence` is distinct from `message` in `ServerStreamResponse` so stream ordering is assertable independently of payload `[compatibility/phase0/connect/proto/fixture/v1/echo.proto:ServerStreamResponse]`.

## Side Effects
- None.

## Verification
- Run: `cd compatibility/phase0/connect && bun run generate`
