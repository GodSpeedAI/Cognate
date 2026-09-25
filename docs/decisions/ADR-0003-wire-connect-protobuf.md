# ADR-0003: Wire format and RPC — Protobuf + Connect over Bun.serve()

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
Status: Accepted for Phase 0 (fixture-scoped). Not yet a repository-wide dependency pin.

## Context

Spec §21–§23, §37 (Connect bullet) and §38 (Development) require Phase 0 to pin and
test a Protocol Buffers + Connect toolchain against Bun 1.4, proving unary, server
streaming, and client streaming request/response behavior, cancellation, deadlines,
error mapping, and reconnection semantics over the supported HTTP mode, before any
tuple is adopted as a framework dependency. Bidirectional streaming must not be
advertised until an HTTP/2 path is demonstrated.

A Phase 0 fixture was built at `compatibility/phase0/connect/` (own `package.json`,
own `bun install`, isolated from root dependencies) to answer this without committing
the rest of the repository to unverified versions.

## Decision

Pin, for Phase 0 evidence purposes:

- `@bufbuild/protobuf` 2.15.0
- `@connectrpc/connect` 2.2.0
- `@connectrpc/connect-web` 2.2.0 — client transport, fetch-based, runs unmodified
  under Bun
- `@bufbuild/buf` 1.73.0
- `@bufbuild/protoc-gen-es` 2.15.0

`@connectrpc/connect-node` 2.2.0 was installed and its source read as a reference
implementation pattern (see below) but is **not** part of the runtime path; Bun has
no first-party Connect server adapter package, so this fixture defines its own
`Bun.serve()` bridge modeled on `connect-node`'s dispatch-by-`requestPath` approach,
using `createFetchHandler` from `@connectrpc/connect/protocol` for the actual
universal-handler↔fetch conversion instead of hand-rolled byte handling.

Confirmed: in Connect v2, `protoc-gen-es` alone generates service descriptors
(`GenService` / `serviceDesc(...)`) consumed directly by `router.service(...)` and
`createClient(...)`. The formerly separate `@connectrpc/protoc-gen-connect-es` plugin
is not needed and is not part of this tuple (it also caps at 1.7.0 on npm, i.e. it was
never released compatible with Connect v2's package major).

## Evidence

Full command log, exit codes, and per-behaviour results: `.agents/evidence/phase0-connect.md`.
Generator config, adapter/client code snippets, and the mode matrix: `compatibility/phase0/connect/API_NOTES.md`.

Summary of the mode matrix (HTTP/1.1, `Bun.serve()` default, no TLS/h2c negotiated):

| Mode | Status |
| --- | --- |
| Unary (JSON + binary) | Proven |
| Server streaming, ordered | Proven |
| Server-stream cancellation via `AbortSignal` | Proven, observed at the handler |
| Timeout → `Code.DeadlineExceeded` | Proven |
| `ConnectError` code mapping to client | Proven |
| Server restart, same port, next call succeeds | Proven |
| Client streaming | **Fails over the fetch-based transport by design** — recorded as an observed, asserted failure (`ConnectError` `Code.Unknown`, `rawMessage: "The fetch API does not support streaming request bodies"`), not worked around |
| Bidirectional streaming | **Not attempted, not claimed.** Requires HTTP/2, which this fixture's `Bun.serve()` does not negotiate. Fixture proto defines no bidi RPC. |

## Consequences

- The reference profile MAY claim unary and server-streaming Connect support over
  `Bun.serve()` with the pinned tuple above.
- The reference profile MUST NOT claim client-streaming or bidirectional-streaming
  Connect support under Bun 1.4 with this tuple and transport. Any future claim
  requires a separate HTTP/2 (h2c) spike proving a duplex-capable transport pairing
  (e.g. a node-http2-based transport, or another client library) against Bun's
  server, plus its own fixture and evidence record.
- Root `package.json` / `bun.lock` are unchanged by this ADR. Adopting this tuple
  repository-wide is a separate, explicit dependency-PR decision per spec §39.
- `packages/proto/` generation SHOULD follow the same `buf.gen.yaml` shape verified
  here (`protoc-gen-es` with `target=ts`, no separate Connect-ES plugin) when Phase 4
  implements the canonical schemas.

## Open follow-ups

- HTTP/2 (h2c) under `Bun.serve()` is unspiked; client streaming and bidi remain
  unproven, not merely slow.
- `@connectrpc/connect-node`'s transport was not exercised at runtime for
  Node-vs-Bun parity comparison; only its adapter source was used as a modeling
  reference for the Bun fetch bridge.
