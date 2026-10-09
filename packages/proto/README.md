# @godspeedai/cognate-proto

Generated TypeScript bindings for Cognate's canonical protobuf schemas (the `cognate.v1` package), produced with [buf](https://buf.build) and [protobuf-es](https://protobuf-es.buf.build).

**When to use this package:** you need the typed `RuntimeService` service descriptor and the generated message and enum classes for Cognate's wire format — for a custom transport, a gateway in another stack, or message-level tooling. Applications that simply call a Cognate runtime should use [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) or the protocol adapters instead; they build on these bindings and handle the wire details for you.

## Installation

```sh
bun add @godspeedai/cognate-proto
```

Requires [Bun](https://bun.sh) >= 1.4.0. The package depends on `@bufbuild/protobuf`; calling a runtime over HTTP additionally needs a Connect transport (`@connectrpc/connect`, plus `@connectrpc/connect-web` or the convenience exports of [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun)).

## What it exports

The entry point re-exports everything generated from the canonical `cognate/v1` schemas:

- the `RuntimeService` service descriptor (run start/get/cancel/list, event streaming, continuations, capability invocation, artifacts, projections, shared state, remote capability offers);
- message types and their schemas — `Event`/`EventSchema`, `Run`, `Continuation`, `StateUpdate`, `RemoteCapabilityOffer`, `SemanticRef`, and the rest of the family;
- the enums `RunStatus`, `ContinuationStatus`, `ContinuationAction`, and `ResolveOutcome`.

## Quick start

Messages are ordinary protobuf-es values — create them from JSON, then serialize to canonical JSON or binary protobuf:

```ts
import { fromJson, toJson } from "@bufbuild/protobuf";
import { EventSchema } from "@godspeedai/cognate-proto";

const event = fromJson(EventSchema, {
  eventId: "e-1",
  streamId: "s-1",
  streamSequence: "1", // uint64 fields are strings in canonical JSON
  position: "1",
  eventType: "run.started",
  schemaVersion: 1,
  occurredAt: new Date().toISOString(),
  recordedAt: new Date().toISOString(),
  tenant: "tenant-a",
  correlationId: "c-1",
  scopeId: "workspace-1",
});

const json = toJson(EventSchema, event); // canonical JSON
const bytes = event.toBinary(); // binary protobuf
```

To call a served runtime with a typed client, hand the service descriptor to a Connect transport:

```ts
import { createClient } from "@connectrpc/connect";
import { connectTransport } from "@godspeedai/cognate-protocol-connect-bun";
import { RuntimeService } from "@godspeedai/cognate-proto";

const client = createClient(RuntimeService, connectTransport("http://127.0.0.1:3000"));
const run = await client.getRun({ runId: "<run id>" });
```

Prefer [`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect)'s `createRemoteRuntimeService` when you call the runtime yourself: the generated client does not coerce plain JSON for `google.protobuf.Value` fields (such as the run `input`), and that adapter performs the conversion and maps error codes in both directions.

## Regeneration

The generated files (`src/gen/**`) are committed and never edited by hand. Regeneration happens in the Cognate repository, not downstream: running `bun run generate` in this package executes `buf generate` with a pinned `protoc-gen-es` plugin against the canonical `proto/` sources. Consumers of the published package never run codegen — they import the committed output like any other module.

Generation is deterministic: two runs into separate directories are byte-identical to each other and to the committed output, and the package's own test suite keeps that true.

## Limitations

- The generated `RuntimeService` declares unary and server-streaming methods only; the schema has no client-streaming or bidirectional methods.
- protobuf-es can serialize every message as JSON or binary; choosing a wire format is a transport decision, not something this package configures.
- Message and field shapes change only through a new release of this package, since there is no downstream codegen path.

## Related packages

- [`@godspeedai/cognate-protocol-connect`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect) — transport-neutral server routes and a remote `RuntimeService` built on these bindings.
- [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun) — serves the service on `Bun.serve` and provides the fetch transport.
- [`@godspeedai/cognate-client`](https://www.npmjs.com/package/@godspeedai/cognate-client) — the high-level client most applications should use instead.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
