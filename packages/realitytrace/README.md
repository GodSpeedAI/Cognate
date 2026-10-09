# @godspeedai/cognate-realitytrace

Cognate's adapter for RealityTrace (SXR), an independent observation-and-evidence tool driven
through its `sxr` CLI. This package moves observations of
your application's committed history to RealityTrace without ever blocking or rewriting that
history: an outbox-based delivery port, persisted per-observation receipts, a strict
"was it recorded?" gate, and typed envelopes for execution traces and evidence packets.

**When to use this package:** you want an external, independent ledger of what your Cognate
application actually did — recorded at-least-once from committed events, with correlation ids
that survive the trip — while keeping the adapter optional and RealityTrace unchanged.
Everything here degrades gracefully: if RealityTrace is slow or down, your app keeps running.

## Installation

```sh
bun add @godspeedai/cognate-realitytrace
```

Requires [Bun](https://bun.sh) >= 1.4.0, a
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events)
store, and the external RealityTrace CLI:

- The `sxr` binary must be installed on the machine; you pass its path to the port.
- A working directory the tool can enroll as its repository (the adapter initializes it with
  git on first `prepare()`).
- RealityTrace >= 0.3.0 for structured correlation readback (`readCorrelation`).

The SDK ships Bun-native TypeScript source, so add `@types/bun` and `@types/node` as dev
dependencies when typechecking your project.

## Quick start

```ts
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import {
  createSxrCliPort,
  ObservationDelivery,
  observationIntent,
} from "@godspeedai/cognate-realitytrace";

const store = openSqliteStore({ path: "./app.sqlite" });

// One-time enrollment of the external tool (repo, question, threshold, run):
const port = createSxrCliPort({ bin: "/usr/local/bin/sxr", repoDir: "./sxr-repo" });
const workflow = await port.prepare({ title: "Runtime behaves as declared" });

const delivery = new ObservationDelivery(store, {
  port,
  backoff: { baseMs: 1_000, maxMs: 30_000, maxAttempts: 8 },
});

// When committing an event whose observation matters, include the observation intent
// in the SAME commit — the observation can then never refer to an event that may not exist:
await store.commit({
  appends: [/* your event */],
  outbox: [observationIntent(event, { classification: "durable_fact", capabilityId: "refund.approve" })],
});

// From a background loop, drain deliveries. A slow or unreachable tool never blocks
// committed history: failures retry with backoff, then park for operator attention.
await delivery.drain();

// Normal mode: check on delivery. Strict mode: gate an operation on it.
const status = await delivery.status(eventId); // queued | accepted | duplicate | retrying | failed
const stuck = await delivery.unreconciled();   // deliveries needing operator attention
if (await delivery.isRecorded(eventId)) {
  // the tool has accepted (or already had) this observation
}
```

The CLI port (`createSxrCliPort`) also offers `readCorrelation(targetRef)` — your observation's
correlation ids read back from the tool's committed record — plus `deriveEvidence` and
`readEvidence` for the tool's own evidence derivation, and `executionTraceEnvelope`,
`governedTraceFor`, and `evidencePacketEnvelope` for typed record envelopes at the boundary.

## What a receipt means — and does not mean

A delivery receipt (`accepted` or `duplicate`) means RealityTrace's ledger recorded — or had
already recorded — the observation. It is **not evidence** and **not settlement**: deriving
evidence and settling questions are separate, explicit steps of the external tool, invoked
through this adapter but decided by it. Delivery is idempotent per observation (retries land
on the same ledger position and report as `duplicate`), and the authoritative event →
observation → receipt mapping stays in your store, keyed by event id.

## Limitations

- The port holds the enrollment workflow in memory: call `prepare()` once per process before
  recording, and again after a restart if the process is long-lived.
- Delivery is at-least-once; the external tool deduplicates by run and verifier.
- Every delivery shells out to the `sxr` binary — budget for that process cost in hot paths.
- If deliveries exhaust their retries they are poisoned for operator reconciliation; nothing
  deletes or rewrites committed events in the meantime.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) —
  the store and outbox machinery deliveries are driven from.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime whose events this adapter observes.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
