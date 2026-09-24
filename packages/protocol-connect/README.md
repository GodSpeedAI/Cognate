# @cognate/protocol-connect

Maps `RuntimeService` (runtime-api) to the generated Connect service `cognate.v1.RuntimeService` (`@cognate/proto`), independent of the HTTP server.

- `registerRuntimeService(router, service, { authenticate, maxJsonDepth })` — server routes. The caller comes from request headers via `authenticate`, never from message bodies (§32). `google.protobuf.Value` inputs are depth-checked.
- `createRemoteRuntimeService(transport, tokenFor)` — a `RuntimeService` over any Connect transport; ServiceError codes round-trip exactly.
- `errorCodes` — ServiceError ↔ Connect code table.

Proof: `test/service.test.ts` runs the same service conformance kit as the in-process runtime, over JSON and binary encodings (CG-WIR-003, §40.G).

Mode matrix (DEBT-004): unary and server streaming only; client/bidi streaming are not offered.
