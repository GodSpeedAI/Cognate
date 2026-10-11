# PostgreSQL migration evidence (DEBT-011 resolution) — 2026-10-09

Mission mission scope: DEBT-011 (SQLite single-writer), DEBT-014 (erasure completeness),
DEBT-021 (projection staleness). Implementation on branch `feat/debt-011-postgres-store`.

## Versions and distribution

- pg0 **v0.15.2** (2026-09-14): bundled PostgreSQL **18.1.0** + pgvector **0.8.5**. Installed by
  `just db-setup` (`scripts/setup-pg0.ts`), which pins the binary's sha256 in-repo and verifies it
  on every install (the release publishes no signatures; the digest is the trust anchor).
- Driver: `postgres` npm 3.4.9 (pure JS, prepared statements, LISTEN/NOTIFY, transactional
  `sql.begin`). `Bun.SQL` was rejected per mission constraints.
- New package: `@godspeedai/cognate-store-postgres` (`openPostgresStore`, per-schema tables,
  versioned migrations, `resolvePg0Url` for the pg0-managed config).

## DEBT-011 — multi-process writers (Closed)

- Position allocation: counter row locked `FOR UPDATE` inside the committing transaction —
  allocation order is commit order across processes; aborts roll back (dense positions).
- Concurrency properties proven in-process (`commit-order.test.ts`, 6 tests): dense contiguous
  positions under 16 concurrent 5-event commits; aborted decisions leave no gaps; same-stream
  races produce one winner + typed ConcurrencyError; multi-stream atomicity; idempotency races
  (one commit, rest duplicate/mismatch); hard connection drop mid-transaction rolls back cleanly.
- Multi-process proof (`postgres-multiprocess.test.ts`, 8 scenarios, separate `bun` processes on
  one schema): independent commits with no loss/duplication; cross-process expected-version
  conflicts typed; idempotency across processes; disjoint outbox claims across workers; lease
  recovery after SIGKILL; foreign-commit notification through LISTEN/NOTIFY + cursor drain;
  kill-mid-commit all-or-nothing with dense continuation; restart reconstruction.
  Stability: 8/8 across 5 consecutive runs (after fixes below).
- Store defects the tests caught and fixed: serialized idempotency re-check (a same-key race
  previously surfaced as ConcurrencyError), append-loop position off-by-one, concurrent
  `CREATE SCHEMA IF NOT EXISTS` race (pg_namespace unique violation; schema creation now runs
  inside the migration advisory lock), lowercase-only schema validation (unquoted DDL case-folds
  vs quoted fragments), 63-byte LISTEN channel limit (deterministic hash fallback).
- Runtime integration: `runtimeServiceConformance` (28 tests) passes on PostgreSQL via
  `createRuntime({ store: { postgres: ... } })`, including the waiting-run restart test and a
  `postgresPg0` boot test. CI: verify.yml installs pg0 and runs the PG-backed suites
  (store-postgres, service-postgres, multiprocess, convergence, erasure) with `just db-up` before
  `just verify` (CG-SEC-001's gate needs the database).

## DEBT-014 — erasure completeness (Closed)

- Store-level (all three stores, conformance kit extended): `erasePayload` redacts idempotency
  result snapshots whose `event_ids` include the erased event or reference the same stream;
  results become `{"__erased": {...}}` and replay never re-discloses content.
- Continuation cascade (`ContinuationService.redactForRun`): continuation records tombstoned in
  place (`payload`, `resolution.input` → null; matching/timing metadata preserved),
  `continuation.redacted` appended, transition events erased (their idempotency snapshots redact
  via the store). A duplicate replay of a redacted transition returns the current redacted record.
- Runtime orchestration with durable resumable jobs (`erasures` collection): interrupted
  propagations resume on next erase or runtime start; cascade covers `run.resumed` copies and —
  transitively — recorded `run.recall` copies (recalling runs' recall events AND their terminal
  outputs, recursively, visited-run termination).
- Adversarial tests on PostgreSQL (`tests/integration/erasure.test.ts`): sensitive continuation
  payload + resolution, later-run recall, store- and service-level replay redaction, cognitive
  index rebuild, repeated erasure idempotency, restart-resume of an interrupted job, run-less
  observation erasure. Physical copies in dead tuples/WAL are documented (README) as an operator
  `VACUUM`/backup-retention matter, not claimed erased.

## DEBT-021 — projection reads carry their checkpoint (Closed)

- `readProjectionSnapshot` added to the store contract (optional; fallback composition provided);
  SQLite/PostgreSQL single-statement consistent snapshot; conformance kit pins "checkpoint never
  ahead of rows" per store.
- `readProjection` (RuntimeService + Connect proto + generated bindings + both transport
  directions) returns `{ rows, checkpoint }`.
- Client `ProjectionStore`: engine seeds a new store's convergence target with its observed
  position; first read publishes immediately; reads behind the target re-poll at a bounded ≤2 Hz
  until covered; errored projections stop the loop.
- Proofs without sleeps: gated-runner React test (mounted `useProjection` converges after the
  final materialising event; packages/react), in-process client test (packages/client), and a
  cross-process wire test (client in a second Bun process over Connect against a PG-backed
  runtime with the fold held behind a parent gate; 5/5 stable).

## SQLite → PostgreSQL migration

`migrateSqliteToPostgres`: VACUUM INTO backup first; preflight integrity + table inventory; one
transaction importing streams/events(+payloads)/idempotency/records/outbox(rowid order → seq)/
verifiable checkpoints/blobs; position counter continued; verification via public API (canonical-
JSON digests over the event log and records, idempotency replay of every key); projections import
only when provably consistent, else `projectionsToRebuild`; dry-run writes nothing; double import
refused; source untouched. Tests: rich-state round trip (4 tests).

## Reconstructed applications

- Both apps compose `storeConfigFor(home)`: `COGNATE_POSTGRES_URL` or pg0 (`cognate-dev`), schema
  derived from the data path (per-test isolation via mkdtemp; restart persistence via stable path).
- Live boots verified: copilot serves the console and completes AG-UI journeys
  (RUN_STARTED → TEXT_MESSAGE_* → RUN_FINISHED) durably in schema `cognate_copilot_*`; harness
  serves Connect (`StartRun` → durable events in `cognate_harness_tmp_cg_home`).
- Suites: harness 863/863, copilot journeys 12/12, copilot persistence+architecture 62/62.
  Timing/robustness fixes: per-test timeout 30 s (flag after the filter), poll budgets 5 s→20 s,
  projection reads settled via `runtime.idle()`/`waitForCondition` (async fold), seeding waits for
  the fold, secret scans query the PG schema, J-H run.waiting poll (record and marker commit in
  separate decisions).

## Performance

`.agents/evidence/2026-10-09-postgres-performance.md`: sequential ~257 commits/s (p50 3.5 ms,
p95 6.1 ms), concurrent ~247/s across 8 streams (no SQLITE_BUSY-class failures), projection
catch-up 900 events in 373 ms; SQLite in-process baseline ~24 000/s. The gap is network round
trips per decision; SQLite remains supported for the single-process latency profile.

## Remaining risks

- `runtime.idle()` under heavy parallel load can exceed its 10 s budget on PG (one intermittent
  flake in the copilot persistence suite; passes standalone and on immediate rerun). Candidate
  follow-up: fold-aware idle budget.
- Bun fetch unary-POST response caching (DEBT-027) affects any Bun consumer of connect-web that
  uses raw `createConnectTransport` without `cache: "no-store"`; the framework's Bun helper
  defaults to no-store.
