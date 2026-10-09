# @godspeedai/cognate-protocol-connect

Maps the Cognate `RuntimeService` onto the generated Connect service (`cognate.v1.RuntimeService`), independent of any HTTP server. It provides the server-side route registration and a remote client that behaves like an in-process service.

**When to use this package:** install it when you host the Connect router yourself (any fetch-based server can drive it) or when you need a typed `RuntimeService` backed by a remote endpoint. If you serve from Bun, [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun) wraps this package with a ready-made `Bun.serve` transport, payload limits, and deadlines — install that instead and you get this one automatically.

## Installation

```sh
bun add @godspeedai/cognate-protocol-connect
```

Requires [Bun](https://bun.sh) >= 1.4.0. Depends on `@connectrpc/connect`, `@bufbuild/protobuf`, [`@godspeedai/cognate-proto`](https://www.npmjs.com/package/@godspeedai/cognate-proto), and the `RuntimeService`/`ServiceError` types from [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api).

## Quick start

Turn a Connect transport into a full remote `RuntimeService` — the returned object satisfies the same interface as an in-process runtime's service:

```ts
import { createConnectTransport } from "@connectrpc/connect-web";
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";

const service = createRemoteRuntimeService(
  createConnectTransport({ baseUrl: "http://127.0.0.1:3000" }),
  (caller) => issueToken(caller), // Bearer credential for this caller
);

const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const run = await service.startRun(caller, { agent: "agent.echo", input: { text: "hi" } });
for await (const event of service.events(caller, { runId: run.runId, follow: true })) {
  console.log(event.eventType);
}
```

Plain JSON works for `input` and other value-typed fields — the adapter converts to and from protobuf `Value` for you — and a `ServiceError` raised by the server arrives with the same code, so `service` is a drop-in for an in-process service.

On the server side, register the routes on a Connect router:

```ts
import { registerRuntimeService } from "@godspeedai/cognate-protocol-connect";

registerRuntimeService(router, runtime.service, {
  // Caller identity comes from request headers, never from message bodies.
  authenticate: (headers) => myBearerAuth(headers.get("authorization")),
  maxJsonDepth: 32, // reject over-deep JSON values from clients
});
```

A missing or invalid credential fails every route with `unauthenticated`. If you are serving from Bun, [`serveRuntime`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun) does this registration for you and adds body-size and deadline enforcement.

## API surface

- `registerRuntimeService(router, service, { authenticate, maxJsonDepth })` — server routes for every `RuntimeService` method.
- `createRemoteRuntimeService(transport, tokenFor)` — a client-side `RuntimeService` over any Connect transport; `tokenFor` supplies the Bearer credential for each caller.
- `errorCodes` — the `ServiceError` code to Connect code table (for example `not_found` → `NotFound`), exported so other transports can reuse the exact mapping.

## Limitations

- The service defines unary and server-streaming methods only; there are no client-streaming or bidirectional methods on the wire.
- Observation ingestion is an in-process mechanism: the remote client's `observe` always fails with `failed_precondition` rather than exposing it over the wire.
- Requests are bounded by your `authenticate` implementation and `maxJsonDepth` only; body-size limits and call deadlines are transport concerns (the Bun package adds both).

## Related packages

- [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun) — `Bun.serve` transport, limits, deadlines, and the fetch transport factory.
- [`@godspeedai/cognate-proto`](https://www.npmjs.com/package/@godspeedai/cognate-proto) — the generated messages and service descriptor this package maps to.
- [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api) — the `RuntimeService` contract and `ServiceError` type.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
