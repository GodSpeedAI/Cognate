# Fenced outbox lease contract (proposal)

This extension lets a store-backed dispatcher tell whether it still owns an outbox delivery after a lease expires or an operator requeues the item. It does not make the external side effect exactly once: a delivery may have reached its target before the worker lost its lease, so targets must still deduplicate by the stable outbox item ID.

## Compatibility

The existing `claimOutbox`, `settleOutbox`, and `requeueOutbox` methods remain supported. Stores may additionally expose the fenced methods. `OutboxDispatcher` uses fencing when the store exposes the complete fenced method set, and retains legacy behavior for older adapters. Thus a 0.3 adapter remains usable, but does not gain stale-worker protection until it implements the extension. The legacy path is for one dispatcher process only; multiple processes require the fenced methods.

## Fenced claim

Each fenced claim supplies an owner ID, a caller-observed epoch-millisecond `now`, batch limit, and lease duration. Every returned item contains the owner ID, a store-incremented lease generation, and lease expiration. The store changes the generation and owner atomically when it claims an item. A later claim, including after expiration, receives a strictly greater generation.

## Renew and settle

Renewal and settlement require the exact item ID, owner ID, and generation returned by the claim. They also require the caller-observed `now`. The operation succeeds only while the matching owner and generation are current and the lease has not expired (`expiresAt > now`). A failed conditional operation returns `false` and does not modify the item. A successful renewal extends the lease from the supplied `now`; a successful settlement records delivered, retry, or poisoned state and clears ownership.

Manual requeue clears the owner and advances the generation, immediately fencing every earlier worker, even before another worker claims the item. Reclaim after expiration likewise replaces the owner and advances the generation. A worker that loses renewal must abort its delivery signal and must not settle that claim.

Generation zero marks a row that has never entered the fenced protocol. Once a row has a positive generation, that is a persistent enrollment marker: requeue advances it rather than resetting it. Legacy claims only select generation-zero rows, and legacy settlement rejects enrolled rows even after requeue clears the owner. This prevents an old adapter from bypassing a fenced claim's ownership check. Legacy-only rows retain the prior claim and settlement behavior.

That compatibility protection describes the upgraded adapter's legacy API methods. An old binary
that issues the previous SQL directly cannot enforce the new enrollment rule. Do not mix old and
new delivery processors against the same outbox. Database-backed worker-version admission remains
a prerequisite for supported mixed-process execution; this extension does not supply it.

The common store API accepts `now` to keep memory, SQLite, and PostgreSQL behavior deterministic and conformance-testable. The dispatcher supplies its local clock. This is not authoritative wall time across machines; clock skew may cause premature or delayed reclaim. Fencing still prevents an old generation from settling after a newer claim or manual requeue. A future cross-adapter authoritative-time contract requires a store-time abstraction and is outside this slice.

## Delivery guarantees and boundary

Fenced settlement prevents stale local acknowledgements, but cannot revoke an external request already in flight. Delivery remains at least once and target-side idempotency remains required. This mechanism leases outbox rows only; it does not claim ownership or fencing for run execution, commitments, inbox processing, or arbitrary external operations.

The dispatcher's concurrency limit is shared across overlapping `drain()` calls on that dispatcher instance. It reserves capacity before an asynchronous claim and claims one item per slot, so completed deliveries can refill capacity without waiting for a whole batch. The limit is process-local; each runtime instance needs its own run-ownership strategy if multiple instances may execute the same run.
