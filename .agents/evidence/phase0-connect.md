# Phase 0 Connect/protobuf/Bun compatibility fixture — evidence

Date: 2026-09-24
Environment: Bun 1.4.0, Linux (WSL2), repo `/home/sprime01/projects/cognate`, fixture at
`compatibility/phase0/connect/`.

## Pinned tuple (installed via `bun install` inside the fixture directory)

| Package | Pinned version | Role |
| --- | --- | --- |
| `@bufbuild/protobuf` | 2.15.0 | wire runtime |
| `@connectrpc/connect` | 2.2.0 | Connect runtime (router, client, protocol helpers) |
| `@connectrpc/connect-web` | 2.2.0 | client transport (fetch-based, used from Bun) |
| `@connectrpc/connect-node` | 2.2.0 | installed for reference/comparison only; not used at runtime |
| `@bufbuild/buf` | 1.73.0 | codegen CLI |
| `@bufbuild/protoc-gen-es` | 2.15.0 | codegen plugin (also emits Connect v2 service descriptors) |

`bun.lock` for this exact set lives in `compatibility/phase0/connect/`, scoped to that directory only.

## Commands and exit codes

| Command | Cwd | Exit code | Result |
| --- | --- | --- | --- |
| `bun install` | `compatibility/phase0/connect` | 0 | 12 packages installed |
| `node_modules/.bin/buf generate` | `compatibility/phase0/connect` | 0 | `gen/fixture/v1/echo_pb.ts` written |
| `rm -rf gen && node_modules/.bin/buf generate` (second run) | `compatibility/phase0/connect` | 0 | `sha256sum` of `gen/fixture/v1/echo_pb.ts` identical to the first run |
| `bun test connect.test.ts` (3 consecutive runs) | `compatibility/phase0/connect` | 0 each run | 8 pass / 0 fail / 19 `expect()` calls each run, no flakiness observed |

## Verified claim: Connect v2 services come from `protoc-gen-es`, not a separate plugin

`@connectrpc/protoc-gen-connect-es` (the old dedicated Connect-ES generator plugin)
tops out at `1.7.0` on the npm registry (`npm view @connectrpc/protoc-gen-connect-es versions`).
Generating `proto/fixture/v1/echo.proto` with only `@bufbuild/protoc-gen-es@2.15.0`
produced `gen/fixture/v1/echo_pb.ts` containing:
```ts
export const EchoService: GenService<{...}> = /*@__PURE__*/ serviceDesc(file_fixture_v1_echo, 0);
```
No second plugin was installed or invoked. This confirms the spec's open question:
in Connect v2 / protobuf-es v2, `protoc-gen-es` alone generates the service descriptor
consumed by `@connectrpc/connect`'s `router.service(EchoService, impl)` and
`createClient(EchoService, transport)`.

## Per-behaviour results

| Behaviour | Result | Notes |
| --- | --- | --- |
| Unary (JSON) | PASS | `client.unary({message})` round-trips |
| Unary (binary/proto) | PASS | `useBinaryFormat: true` round-trips |
| Server streaming, ordered multi-message | PASS | 5-message stream received in order `[0,1,2,3,4]` |
| AbortSignal cancellation mid server-stream, observed by handler | PASS | Handler polls `context.signal.aborted` between 20ms-spaced yields; `serverStreamCancellation.observedByHandler` flips to `true` after client-side `AbortController.abort()` |
| Client streaming over HTTP/1.1 (fetch transport) | **FAILS by design — recorded, not faked** | `@connectrpc/connect-web`'s transport throws synchronously (`connect-transport.js:146-147`): `"The fetch API does not support streaming request bodies"` for any non-server-streaming `stream()` call. `promise-client` wraps this bare string throw into `ConnectError` `Code.Unknown` (`rawMessage` preserves the original string). Test asserts exactly this: `observed: fetch-based transport rejects streaming request bodies over HTTP/1.1`. |
| Timeout → `Code.DeadlineExceeded` | PASS | Client `defaultTimeoutMs: 50` against a handler that deliberately waits 500ms |
| Thrown `ConnectError(Code.PermissionDenied)` maps to client | PASS | `ConnectError.from(err).code === Code.PermissionDenied` |
| Server restart on same port, new call succeeds | PASS | `server.stop(true)` then a fresh `Bun.serve({ port: boundPort, ... })`; verified `server.port === boundPort` before the follow-up call |
| JSON content type | PASS | covered by the unary(JSON) case above |
| Binary content type | PASS | covered by the unary(binary) case above |
| Bidirectional streaming | **Characterized only — never claimed working** | The fixture `.proto` defines no bidi RPC. Per the Connect protocol spec, bidi requires HTTP/2; `Bun.serve()` here serves plain HTTP/1.1 with no h2c/TLS negotiated. No test exercises it. |

## Limits of this fixture

- No HTTP/2 (h2c) path was spiked under `Bun.serve()`. Client streaming and bidi
  therefore remain unproven, not merely "slow," for this Bun/Connect combination.
- `@connectrpc/connect-node`'s transport and Node adapter source were read (to model
  the Bun fetch adapter's dispatch-by-path pattern) but never executed; no claim is
  made about Node-vs-Bun parity beyond the pattern being structurally equivalent.
- The cancellation test observes handler-side cancellation via polling
  `context.signal.aborted` between spaced yields, not push-based instant cancellation;
  a tighter loop was not attempted since 20ms spacing was sufficient to make the
  observation deterministic across repeated runs.
- Only one small `EchoService` schema was exercised; larger messages, repeated/map
  fields, and reflection were not tested.

## Open questions

- Whether an HTTP/2 (h2c) transport pairing (e.g. `@connectrpc/connect-node`'s
  node-http2 transport against a Bun HTTP/2-capable listener, if one exists) can
  unlock client streaming and bidi under Bun 1.4 is unresolved.
- Whether Bun's own `fetch()` client (used indirectly through `connect-web`) has any
  Bun-specific deviation from browser/undici fetch behavior relevant to Connect's
  streaming-detection code path was not separately isolated; the observed failure
  message matches the transport's own hard-coded string, suggesting no Bun-specific
  deviation, but this was not proven independently of the transport's own check.

## Decision

See `docs/decisions/ADR-0003-wire-connect-protobuf.md`.
