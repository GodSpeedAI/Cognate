# realitytrace — committed-outbox observation delivery

## Overview
This script commits an event, enqueues an observation intent in the same store, and
drains it through `ObservationDelivery` into an in-memory `ObservationPort`. It
checks that delivery is recorded separately from the event and that a receipt is
stored, illustrating delivery that survives target failure without rolling back.

## Interface
- `createMemoryStore` — store providing `commit({ appends, outbox })` `[examples/realitytrace/index.ts:createMemoryStore]`
- `event` — conformance event builder called as `event(type, data, { correlationId, runId })` `[examples/realitytrace/index.ts:event]`
- `observationIntent` — builds the outbox entry from a committed event plus `{ classification: "durable_fact", capabilityId: "refund.approve" }` `[examples/realitytrace/index.ts:observationIntent]`
- `ObservationDelivery` — constructed with `(store, { port, backoff: { baseMs, maxMs, maxAttempts }, now })` `[examples/realitytrace/index.ts:ObservationDelivery]`
- `ObservationPort` / `Observation` — the port interface (`id`, `record`) and its observation payload `[examples/realitytrace/index.ts:memoryPort]`
- `OBSERVATION_TOPIC` — imported from the package; not referenced elsewhere in this script `[examples/realitytrace/index.ts:OBSERVATION_TOPIC]`

## Invariants
- The port returns `status: "duplicate"` for an `observationId` it has already seen, via a `Set` of recorded ids `[examples/realitytrace/index.ts:record]`.
- `isRecorded(eventId)` must be false before draining and the drain result must include the event id in `delivered` `[examples/realitytrace/index.ts:drain]`.
- `status(eventId)` must report `state === "accepted"` after delivery `[examples/realitytrace/index.ts:status]`.
- The first commit uses `expectedVersion: 0` on stream `case-1`, so the append is optimistic-concurrency checked `[examples/realitytrace/index.ts:store.commit]`.
- The observation intent is committed in a second commit with `appends: []` rather than with the event `[examples/realitytrace/index.ts:store.commit]`.

## Side Effects
- Reads `process.env.SXR_BIN` but never launches it; the external `SxrCliPort` is deliberately not used `[examples/realitytrace/index.ts:usingSxrCli]`.
- Backoff is pinned to `baseMs: 5, maxMs: 5` and `now: () => 0`, so no wall-clock waiting occurs `[examples/realitytrace/index.ts:ObservationDelivery]`.

## Verification
- Run: `bun run example:realitytrace`
