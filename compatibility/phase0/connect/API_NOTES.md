# Connect + Bun Phase 0 — API notes

Pinned tuple (verified installed, `bun install` in this directory):

| Package | Version |
| --- | --- |
| `@bufbuild/protobuf` | 2.15.0 |
| `@connectrpc/connect` | 2.2.0 |
| `@connectrpc/connect-web` | 2.2.0 (client transport, used from Bun) |
| `@connectrpc/connect-node` | 2.2.0 (reference only — not used at runtime; see below) |
| `@bufbuild/buf` | 1.73.0 |
| `@bufbuild/protoc-gen-es` | 2.15.0 |

There is **no separate Connect-ES generator plugin in v2**. `@connectrpc/protoc-gen-connect-es`
tops out at 1.7.0 on npm; `@bufbuild/protoc-gen-es` 2.15.0 alone emits a `GenService`
descriptor (`export const EchoService: GenService<...> = serviceDesc(...)`) directly
into `_pb.ts`. Confirmed by running codegen and reading `gen/fixture/v1/echo_pb.ts`.

There is no first-party Bun server adapter (no `@connectrpc/connect-bun`). This
fixture adapts `@connectrpc/connect`'s router to `Bun.serve()` itself, modeled on
`@connectrpc/connect-node`'s `connectNodeAdapter` (same dispatch-by-`requestPath`
pattern), but using the ready-made universal-handler↔fetch bridge instead of
hand-rolling Node req/res conversion.

## Codegen config

`buf.gen.yaml`:
```yaml
version: v2
plugins:
  - local: node_modules/.bin/protoc-gen-es
    out: gen
    opt:
      - target=ts
inputs:
  - directory: proto
```
`buf generate` run twice into a clean `gen/` produced byte-identical
`gen/fixture/v1/echo_pb.ts` (`sha256sum` compared).

## Server: Bun.serve() adapter

Exact imports (`src/connect-fetch-adapter.ts`):
```ts
import type { ConnectRouter, ConnectRouterOptions } from "@connectrpc/connect";
import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
```
`createFetchHandler` (from the `"@connectrpc/connect/protocol"` subpath, not the
package root) converts one `UniversalHandler` into `(req: Request) => Promise<Response>`.
Minimal adapter:
```ts
export function createConnectFetchHandler(options: {
  routes: (router: ConnectRouter) => void;
} & ConnectRouterOptions) {
  const router = createConnectRouter(options);
  options.routes(router);
  const handlersByPath = new Map<string, (req: Request) => Promise<Response>>();
  for (const uHandler of router.handlers) {
    handlersByPath.set(uHandler.requestPath, createFetchHandler(uHandler, { httpVersion: "1.1" }));
  }
  return async (req: Request) => {
    const handler = handlersByPath.get(new URL(req.url).pathname);
    return handler ? handler(req) : new Response("not found", { status: 404 });
  };
}
```
Wired to Bun: `Bun.serve({ port: 0, fetch: createConnectFetchHandler({ routes(r) { r.service(EchoService, impl); } }) })`.
`server.port` reports the bound ephemeral port.

## Client: transport usable from Bun

```ts
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
const transport = createConnectTransport({ baseUrl, useBinaryFormat: false });
const client = createClient(EchoService, transport);
```
`@connectrpc/connect-web`'s transport is plain `fetch()`-based with no DOM/browser
dependency, so it runs unmodified under Bun. `@connectrpc/connect-node`'s transport
(http/http2-based) was installed for comparison but not used, since the fetch-based
transport already satisfies "usable from Bun" and its documented limitation (below)
is itself the fixture's client-streaming evidence.

## Mode matrix (HTTP/1.1, `Bun.serve()` default — no TLS/h2c negotiated)

| Mode | Result | Evidence |
| --- | --- | --- |
| Unary | PASS | `connect.test.ts` "unary" (JSON + binary) |
| Server streaming | PASS, ordered | `connect.test.ts` "server streaming" |
| Server-stream cancellation (AbortSignal) | PASS, observed by handler via `context.signal` | `connect.test.ts` "AbortSignal cancellation" |
| Client streaming | **FAIL by design over fetch transport** — `connect-web`'s `createConnectTransport` throws synchronously for any non-server-streaming `stream()` call: `"The fetch API does not support streaming request bodies"` (`connect-transport.js:146-147`). Wrapped by `createClient`/`promise-client` into `ConnectError` `Code.Unknown` (`rawMessage` preserves the original string). | `connect.test.ts` "client streaming", asserts the exact code + rawMessage |
| Bidi streaming | **Not attempted, not claimed.** The fixture `.proto` defines no bidi RPC. Per the [Connect protocol](https://connectrpc.com/docs/protocol/), bidi requires HTTP/2; `Bun.serve()` here serves HTTP/1.1 with no h2c/TLS path exercised. Characterization only. | n/a |
| Timeout → `Code.DeadlineExceeded` | PASS | `connect.test.ts` "deadline" |
| Thrown `ConnectError(Code.PermissionDenied)` → client | PASS, code preserved | `connect.test.ts` "error mapping" |
| Server restart, same port, new call succeeds | PASS | `connect.test.ts` "server restart" |
| JSON content type | PASS | `useBinaryFormat: false` |
| Binary (proto) content type | PASS | `useBinaryFormat: true` |

Client streaming **would** need a duplex-capable transport (`@connectrpc/connect-node`'s
node-http2-based transport, or a raw HTTP/2 client) to succeed; that is a follow-up
spike, not proven here. Its failure above is real, not simulated.

## Error mapping notes

- Server throws `new ConnectError(message, Code.X)` → client receives a `ConnectError`
  with the same `Code` (`ConnectError.from(err).code`).
- A client `defaultTimeoutMs` shorter than the handler's work yields `Code.DeadlineExceeded`
  on the client; the handler's `context.signal` aborts and its pending work rejects with
  the abort reason.
- A transport-level synchronous `throw <string>` (not an `Error`) is coerced by
  `promise-client` into `ConnectError` `Code.Unknown`, with the original value at
  `.rawMessage` / `.cause`.

## Open questions

- HTTP/2 (h2c) under `Bun.serve()` was not spiked; client streaming and bidi over
  Connect remain unproven for this Bun version until that spike runs.
- `@connectrpc/connect-node`'s transport/adapter were installed and read but not
  exercised at runtime in this fixture; a follow-up could compare it directly for
  Node-vs-Bun parity.
