# @godspeedai/store-sqlite

Authoritative `DurableStore` on `bun:sqlite` (spec §13).

## Tables (spec §13.2)

`schema_versions` (migrations), `event_streams` (per-stream version), `events` (envelope only —
position, event_id, stream_id/sequence, type, timing, causality, semantic ref, metadata),
`payloads` (event_id → JSON payload, separate from the envelope so `erasePayload` can delete
content without touching causality), `idempotency` (scope+key → fingerprint/result/event_ids),
`records` (collection+id → version/JSON value, CAS), `outbox` (id, topic, payload, status,
attempts, `claimed_until` lease), `projection_checkpoints`, `projection_state`, `blobs`
(sha256-addressed bytes).

## Transaction boundary

`commit()` runs the entire decision — envelope validation, idempotency lookup, stream/record CAS,
event/record/outbox writes, idempotency recording — inside one `BEGIN IMMEDIATE` transaction.
Any failure throws and rolls back everything; `onCommitted` listeners fire only after `COMMIT`
returns. `commitProjection` and `erasePayload` are each their own single transaction. bun:sqlite
is synchronous and the store performs no `await` before entering a transaction, so concurrent
`commit()` calls in one process serialize naturally through the JS event loop — exactly one wins
a stream-version race, the rest see `ConcurrencyError`.

## Durability settings

`journal_mode=WAL`, `synchronous=FULL` (fsync on every commit — durability over speed, per spec
§31.2 "fail closed": a decision must never be reported committed before SQLite confirms it),
`foreign_keys=ON`, `busy_timeout=5000`. `secure_delete=ON` so `erasePayload` overwrites freed
pages instead of merely unlinking them; it also runs `PRAGMA wal_checkpoint(TRUNCATE)` so no
plaintext lingers in the WAL either.

## Limits

Single-process writer: correctness relies on one Node/Bun process holding the connection and on
bun:sqlite's synchronous API for in-process serialization, not on SQLite's file locking for
cross-process write concurrency. Multiple processes writing the same file concurrently will hit
`SQLITE_BUSY` after `busy_timeout` rather than being serialized by this store. Back up by copying
the `.sqlite` file plus its `-wal`/`-shm` siblings only after a checkpoint (or use the SQLite
backup API); a bare copy of the main file while WAL is active can miss committed data.
