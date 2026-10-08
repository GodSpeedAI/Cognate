# @godspeedai/events

Durable state plane contract (spec §10, §11, §13).

- `NewEvent` / `StoredEvent` — canonical envelope with causal identity; `streamSequence` (per stream) and `position` (store-wide) are the ordering authority, never timestamps. `validateNewEvent` rejects incomplete envelopes and non-JSON payloads.
- `DurableStore` — one atomic `commit` per decision: stream appends with expected versions, CAS record writes, outbox intents, and an idempotency result (duplicate key → recorded result; different request → `IdempotencyMismatchError`). Also projection checkpoints committed with projection state, content-addressed blobs, and payload erasure with a `$erasures` tombstone.
- `OutboxDispatcher` — at-least-once delivery with bounded exponential backoff, poison items, and operator requeue.
- `@godspeedai/events/conformance` — `storeConformance` kit run by `store-memory` and `store-sqlite`.

Listings are ordered by key/id in code-point order so replay comparisons are store-independent (found by the replay property test).
