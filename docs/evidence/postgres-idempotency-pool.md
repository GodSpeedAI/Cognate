# PostgreSQL idempotency replay pool deadlock

Workbench's six concurrent Team membership updates reproduced an intermittent 30-second timeout.
During the stall, `pg_stat_activity` showed nine transactions waiting for the position-counter row
and its owner idle in a transaction after the idempotency lookup. The owner's duplicate-receipt
path called `eventsByIds` through the global pool while still holding its transaction and counter
lock. All other pooled connections could be waiting for that owner: a pool starvation deadlock.

`eventsByIds` now accepts the current SQL executor; `readIdempotencyRecord` passes its transaction
executor through. No extra connection is acquired while replaying a serialized duplicate.
Transaction order, idempotency identity and recorded receipt content are unchanged.

`bun test packages/store-postgres/test/idempotency-pool.test.ts` failed before the fix with
`Saturated idempotency replay deadlocked`. After the fix,
`bun test --rerun-each 3 packages/store-postgres/test/idempotency-pool.test.ts` passed three tests,
zero failures, twelve assertions in 921 ms. Each iteration uses twenty same-key commits and a
two-connection PostgreSQL pool, asserting one commit, nineteen identical logical replays and one
event. This is an upstream source fix; consumers need a supported published SDK release.
