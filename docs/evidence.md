# Evidence: RealityTrace integration

## What a receipt means — and does not mean

RealityTrace (SXR) records execution evidence through its own existing mechanisms; Cognate does not change SXR (spec §3.3). The runtime exposes an implementation-independent `ObservationPort`:

```text
ObservationPort.record(observation) → delivery receipt
```

A `DeliveryReceipt` (`accepted`/`duplicate`) means SXR's ledger recorded, or had already recorded, the observation bytes. **It is not evidence and not settlement** — those are separate, later, explicit SXR commands (`evidence create`, `settlement register`) outside this adapter's scope. Framework execution never blocks on SXR by default.

## Normal vs. strict mode

- **Normal mode** (default): `observationIntent` commits in the same decision as the framework event; `ObservationDelivery` drains the outbox at-least-once in the background. A slow or unreachable SXR never blocks or rolls back committed history — failures retry with backoff, then poison for operator reconciliation (`unreconciled()`).
- **Strict mode**: a caller gates a specific operation on `isRecorded(eventId)`, true only after SXR has `accepted` or already had (`duplicate`) the observation. `queued`/`retrying` never satisfies the gate.

## What Cognate observations carry (spec §20)

Where available, an observation includes trace ID, event ID, causation ID, correlation ID, run ID, scope ID, component ID, fiber ID, capability ID, continuation ID, semantic reference, operation classification, input/output reference, and timestamp. Before submitting `observation.recorded`, the adapter binds the operation to an enrolled repository, snapshot, declared question and threshold, started run, and committed plan/target according to SXR's own workflow — it emits only schema-valid CEP fields and never inserts unknown properties into SXR's closed schemas.

## Adapter target: `realitytrace ingest` (formerly `sxr ingest`; [ADR-0007](decisions/ADR-0007-observations-realitytrace.md))

The first adapter targets RealityTrace's documented CLI workflow and CEP record schema at a pinned compatible commit — no generic SXR SDK or arbitrary-event ingestion API is assumed. The submission path is `sxr repo enroll → sxr question declare → sxr threshold declare → sxr run begin → sxr plan create → sxr ingest`; the daemon's Unix-socket wire format only queues the exact envelope the CLI itself would build, so it is not treated as a separate integration surface.

### Per-observation verifier design

`sxr ingest` dedupes by `(run_id, verifier)`, not by any caller-supplied id, and mints a fresh `observation_id` on every call — even duplicates. [`@cognate/realitytrace`](../packages/realitytrace/README.md) uses a unique verifier per observation (`cognate.<observationId>`), so SXR's own idempotency key becomes, in effect, per-observation: retries land on the same `ledger_position` and report `already_committed`.

## Known gap: correlation ids ([DEBT-009](../.agents/DEBT.md))

`sxr ingest` accepts only `--run/--verifier/--stdin-format/--spool/--async-mode`. The CEP schema has open `extensions`/`representations[].inline_content` fields, but no CLI surface submits a raw envelope, so Cognate correlation ids (event id, run id, correlation id) cannot be attached to a live SXR record today. Cognate's correlation mapping (event → observation → receipt) lives entirely in its own `observations` store, keyed by `eventId`, never inferred from SXR's response fields. `AK-006` is blocked on this gap; `CG-RT-002` and `CG-RT-003` (below) are proven against the real CLI but their correlation guarantee is bounded by Cognate's own store, not SXR's ledger. Exit criterion: SXR exposes a documented envelope/extension submission path and `AK-006` proves a correlated record round-trips.

## Status

Per [`requirements/ledger.yaml`](../requirements/ledger.yaml): `CG-RT-001` (ObservationPort with outbox delivery; receipt is not evidence) is `implemented` with no debt. `CG-RT-002` (SXR CLI adapter delivers correlated observations after workflow prerequisites) and `CG-RT-003` (correlation chain from DomainForge/SemanticRef through execution/event to queued observation) are `implemented`, both carrying [DEBT-009](../.agents/DEBT.md) — read that entry before relying on end-to-end correlation inside SXR's own ledger.

## Running the RealityTrace gates

`just setup-realitytrace` installs the pinned CLI (RealityTrace v0.2.0, tag `realitytrace-v0.2.0`, binary `realitytrace`) into `.tmp/realitytrace/`; AK-006 and CG-RT-002 use it by default, or `SXR_BIN` when set. The release has no binary assets and is not on crates.io, so the recipe builds from the tag with cargo ([`.agents/evidence/2026-09-25-releases.md`](../.agents/evidence/2026-09-25-releases.md); DEBT-010 closed).

## Related

- [semantics.md](semantics.md) — where the correlated `SemanticRef` comes from.
- [security.md](security.md) — observation payloads must not carry credentials or unredacted personal data.
