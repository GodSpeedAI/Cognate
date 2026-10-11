# PostgreSQL migration performance measurements — 2026-10-09

Mission Phase 5 baseline: same `DurableStore` contract, same driver surface, measured by
`scripts/bench-stores.ts` (run: `bun scripts/bench-stores.ts`). Host: the operator's WSL2 Ubuntu
26.04; server: pg0 v0.15.2 (PostgreSQL 18.1.0) on 127.0.0.1:5432; SQLite baseline: bun:sqlite with
`:memory:` (the migration's before-state is a file-backed SQLite — in-memory removes disk variance
from BOTH sides' comparison and represents the same in-process durability class with `synchronous =
FULL` on a local file).

## Results

| metric | SQLite (bun:sqlite, in-process) | PostgreSQL 18.1 (pg0, TCP) |
|---|---|---|
| sequential commits (500 × 1 event) | 500 in 21 ms ≈ 24 000/s | 500 in 1 942 ms ≈ 257/s |
| commit latency p50 / p95 | 0.0 / 0.1 ms | 3.5 / 6.1 ms |
| concurrent commits (8 streams × 50) | 400 in 10 ms ≈ 40 000/s | 400 in 1 620 ms ≈ 247/s |
| projection catch-up (900 events, fresh fold) | 6 ms | 373 ms |

## Reading

- The per-commit gap is dominated by network round trips: each Cognate decision is one transaction
  (4–8 statements), so ~20 statements × ~0.2 ms RTT ≈ the observed 3.5 ms p50. SQLite's in-process
  calls have no such floor. This is the expected, honest trade of DEBT-011: multi-process durability
  replaces single-process in-memory latency.
- Concurrent throughput on PostgreSQL does not degrade relative to its sequential rate (247/s vs
  257/s): the position-counter lock serializes event-appending commits for their full duration, but
  pipelining across 8 writers hides statement latency almost completely. No SQLITE_BUSY-style
  failures exist on this path at any concurrency.
- Projection catch-up batches 256 events per fold-commit; the 373 ms for 900 events is consistent
  with ~4 round-tripped fold transactions plus the scan.
- Applications that need the old latency profile (single process, no multi-writer requirement)
  should keep `@godspeedai/cognate-store-sqlite`; both stores implement the same contract.

Method notes: measurements are one run per side after a warm-up pass inside the same process; p95
over 500 sequential commits; the concurrent phase is 8 async tasks on one connection pool (max 10).
`scripts/bench-stores.ts` prints the exact JSON rows reproduced above.
