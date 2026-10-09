# @godspeedai/cognate-protocol-connect-bun

Serves a Cognate `RuntimeService` over the Connect protocol on `Bun.serve` — with authentication, payload limits, and deadlines already wired — and provides the matching fetch-based client transport.

**When to use this package:** you expose a Cognate runtime over HTTP, or you call one from Bun, and you want the transport handled. It composes [`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect) (the transport-neutral route mapping); install this one when your server is Bun. For a different HTTP host, use `@godspeedai/cognate-protocol-connect` directly and register its routes on your own router.

## Installation

```sh
bun add @godspeedai/cognate-protocol-connect-bun
```

Requires [Bun](https://bun.sh) >= 1.4.0 (the server is a `Bun.serve` transport). Depends on `@connectrpc/connect`, `@connectrpc/connect-web`, and `@godspeedai/cognate-protocol-connect`.

## Quick start

Serve a runtime and call it from a second process:

```ts
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { devTokenAuthenticator, serveRuntime } from "@godspeedai/cognate-protocol-connect-bun";

const runtime = await createRuntime({
  store: "./app.sqlite",
  agents: [/* your AgentDefinitions */],
  policy, // kernel invocation policy
  actions, // action authorization
});

const server = serveRuntime({
  service: runtime.service,
  authenticate: devTokenAuthenticator, // dev helper; bring your own for production
  port: 3000,
  limits: { maxBodyBytes: 1_048_576, maxJsonDepth: 32, defaultDeadlineMs: 30_000 },
});

console.log(server.url); // http://127.0.0.1:3000
await server.stop();
```

On the client side, build a transport and a remote `RuntimeService`:

```ts
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { connectTransport, devToken } from "@godspeedai/cognate-protocol-connect-bun";

const service = createRemoteRuntimeService(
  connectTransport("http://127.0.0.1:3000", { useBinaryFormat: false }),
  devToken, // (caller) => "tenant:principal" Bearer token
);

const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const run = await service.startRun(caller, { agent: "agent.echo", input: { text: "hi" } });
```

## Request handling

Every request passes through the same gate, in order:

1. **Authentication** — `authenticate(headers)` resolves the caller; no caller means HTTP 401 with the Connect code `unauthenticated`.
2. **Body size** — a declared `content-length` over `maxBodyBytes` (default 1 MiB) is rejected with `resource_exhausted`.
3. **JSON depth** — values nested deeper than `maxJsonDepth` (default 32) are rejected with `invalid_argument`; malformed messages likewise.
4. **Deadline** — unary calls without a shorter client deadline are bounded by `defaultDeadlineMs` (default 30 s); an overrun surfaces as `deadline_exceeded`.

Errors are returned as Connect JSON (`{ code, message }`), and `ServiceError` codes from your service round-trip to Connect codes and back exactly.

## Development tokens

`devTokenAuthenticator` accepts `Authorization: Bearer <tenant>:<principalId>` and `devToken` renders a caller back to that form. They exist for development and tests — **this is not an authentication system**; swap in your own `authenticate` before exposing the server to anything real.

## Limitations

- HTTP/1.1 only, supporting unary and server-streaming calls; the protocol defines no client-streaming or bidirectional methods.
- The body-size check uses the declared `content-length` header.
- `serveRuntime` binds an ephemeral port when `port` is omitted; read the actual address from `server.url`.

## Related packages

- [`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect) — the transport-neutral route mapping and remote client this package builds on.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the runtime whose `.service` you serve.
- [`@godspeedai/cognate-ag-ui`](https://www.npmjs.com/package/@godspeedai/cognate-ag-ui) — an SSE endpoint for AG-UI clients that rides on the same service.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
