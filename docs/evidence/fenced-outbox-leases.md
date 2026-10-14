# Fenced outbox lease implementation evidence

## Plan

1. Define an additive lease contract before implementation in [fenced-outbox-leases.md](../contracts/fenced-outbox-leases.md).
2. Add conformance cases for expiry, reclaim, requeue, and concurrent claims; add dispatcher tests for legacy compatibility, bounded delivery, heartbeat, and lost-lease abort.
3. Implement the same optional fenced API in memory, SQLite, and PostgreSQL stores, retaining the existing API for adapters that have not upgraded.
4. Run the focused built-in store/dispatcher suites and the PostgreSQL suite against isolated schemas; record failures and scope.

## Results

- Test-first check: before dispatcher changes, the new concurrency and lost-claim tests failed on both memory and SQLite (sequential delivery and no renewal-triggered cancellation); the store conformance tests passed after their adapters were implemented.
- `bun test ./packages/events/test/outbox-dispatcher.test.ts ./packages/store-memory/test/conformance.test.ts ./packages/store-sqlite/test/conformance.test.ts` — 73 passed, 0 failed. This covers fenced expiry, generation advancement after reclaim/requeue, disjoint concurrent claims, mixed legacy/fenced API rejection, legacy adapter fallback, heartbeat renewal, lost-claim abort, overlapping drains sharing capacity, immediate slot refill, and maximum simultaneous deliveries.
- `bun test ./packages/store-postgres/test/conformance.test.ts` with the local pg0 server and isolated test schemas — 29 passed, 0 failed. This exercises the PostgreSQL migration and the same fenced conformance cases, including mixed legacy/fenced API rejection.
- `bun run typecheck` — passed.
- `git diff --check` — passed.

## Limits

Lease timestamps use the dispatcher-supplied clock so adapters share deterministic semantics; clock skew can cause early or late reclaim. Fencing prevents stale store settlement, but cannot revoke a request already received by an external target, so delivery remains at least once and targets must deduplicate by stable item ID. Legacy adapters remain serial and single-dispatcher-process only. Fenced mode shares a local concurrency cap across overlapping drain calls; cross-process run ownership remains unsolved. This API leases outbox rows; it does not fence run execution or provide an inbox/commitment model.
