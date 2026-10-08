# @godspeedai/projections

Checkpointed, idempotent, rebuildable projections over the durable event log (spec §11).

`ProjectionRunner` reads committed events in `position` order in batches, applies a
`Projection`, and commits each batch's derived writes together with its checkpoint via
one `store.commitProjection` (CAS on `fromPosition`). On an apply failure it commits the
successful prefix, then records the error at the failing event via `failProjection` and
returns `status: "error"` — the failing event is never skipped.

- `catchUp()` — process new events; returns the stored error, unmodified, while a prior
  error is unresolved.
- `retry()` — clears an error by reattempting from the checkpoint.
- `rebuild()` — resets derived state and the checkpoint, then replays from position 0.
- A stored checkpoint version that differs from the projection's own version yields
  `rebuild_required` and is never reinterpreted.
- `start()` / `stop()` — live mode, following `store.onCommitted`; runs are serialized.
- `waitFor(position)` — resolves once the checkpoint reaches `position`.

Concurrent runners racing on the same projection resolve via `CheckpointConflictError`:
the loser re-reads the checkpoint and continues without double-applying.
