# @godspeedai/realitytrace

Optional observation adapter (spec §20): committed-outbox delivery of
Framework observations to RealityTrace (SXR), plus the SXR CLI port.

## Normal vs strict mode

**Normal mode** (default): `observationIntent` is committed in the same
decision as the event; `ObservationDelivery` drains the outbox at-least-once
in the background. A slow or unreachable SXR never blocks or rolls back
committed history — failures retry with backoff, then poison for operator
reconciliation (`unreconciled()`).

**Strict mode**: callers gate a specific operation on `isRecorded(eventId)`,
which is `true` only after SXR has `accepted` or already had (`duplicate`)
the observation. `queued`/`retrying` never satisfies the gate.

## What a receipt means — and does not mean

A `DeliveryReceipt` (`accepted`/`duplicate`) means SXR's ledger recorded (or
had already recorded) the observation bytes. It is **not** evidence and
**not** settlement — those are separate, later, explicit SXR commands
(`evidence create`, `settlement register`) outside this adapter's scope.

## Per-observation verifier design

`sxr ingest` dedupes by `(run_id, verifier)`, not by any caller-supplied id,
and mints a fresh `observation_id` on every call — even duplicates. This
port uses a unique verifier per observation (`cognate.<observationId>`) so
SXR's own idempotency key becomes, in effect, per-observation: retries land
on the same `ledger_position` and report `already_committed`.

## Structured correlation (RealityTrace ≥ 0.3.0)

`record()` passes Cognate's correlation fields to `ingest --extensions`, so
the committed record carries them as CEP `extensions.cognate`.
`readCorrelation(targetRef)` reads them back from that record via
`ledger export`, returning `null` when no record sits at that position. A
duplicate delivery keeps the first record's ids. Cognate still keeps the
authoritative event → observation → receipt mapping in its `observations`
store, keyed by `eventId`, and never treats a duplicate response's newly
minted SXR `observation_id` as the committed id.
