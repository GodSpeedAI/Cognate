# PostgreSQL as an authoritative DurableStore (DEBT-011, DEBT-014, DEBT-021) — 2026-10-09

## Decision

PostgreSQL joins SQLite as a supported authoritative `DurableStore` implementation
(`@godspeedai/cognate-store-postgres`, driver: `postgres` npm package — not `Bun.SQL`). The runtime
accepts an explicit store config: `{ postgres: { url, schema } }` for an external server or
`{ postgresPg0: ... }` for the pinned, checksum-verified pg0 distribution (PostgreSQL 18.1.0 +
pgvector 0.8.5; install via `just db-setup`, data via `just db-up/down/backup/restore/migrate`).
SQLite remains supported unchanged for single-process apps; the store contract is unchanged for
agents.

## Design decisions (and why)

1. **Position order equals commit order.** PostgreSQL sequences allocate outside transaction
   commit order. The store allocates store positions from a single counter row locked `FOR UPDATE`
   inside the committing transaction: allocation order is therefore commit order, aborted
   transactions roll their allocation back (positions stay dense, like SQLite's rowid), and only
   commits that append events serialize. Record writes, outbox claims (`FOR UPDATE SKIP LOCKED`),
   projection folds, and blob writes stay concurrent.
2. **Cross-process commit fan-out is notification-plus-log.** Each committing transaction queues
   one `pg_notify`; listeners drain the durable event log from their own cursor (poll safety net
   250 ms). A lost notification delays delivery; it can never skip it.
3. **Erasure semantics (spec §32) are honest about MVCC.** `erasePayload` deletes the payload row,
   tombstones the envelope, appends `erasure.recorded`, and — new — redacts idempotency result
   snapshots derived from the erased event or its stream (the `__erased` marker replaces recorded
   results on replay). Dead tuples and WAL retain bytes until vacuum/recycle; the README documents
   `VACUUM <schema>.payloads` as the operator action and backups as retaining content per
   retention policy. No physical-erasure claim is made beyond SQLite's `secure_delete` analogue.
4. **Projection reads carry their checkpoint.** `readProjection` (service, Connect protocol, client)
   now returns `{ rows, checkpoint }`, read consistently (single statement; the checkpoint is never
   ahead of the rows). The client re-reads at a bounded rate until the checkpoint covers the
   position of the event that triggered the refresh — the DEBT-021 stale-forever failure mode is
   closed by the checkpoint, not by sleeps.
5. **Derived data is never trusted across migration.** `migrateSqliteToPostgres` imports in one
   transaction, verifies canonical-JSON digests through the public store API, replays every
   idempotency key, and imports only provably consistent projection checkpoints (the rest are
   reported for rebuild). Dry-run writes nothing; double import is refused; the SQLite source is
   never modified.

## Consequences

- Multi-process runtimes are supported on one database (proven: `tests/integration/postgres-multiprocess.test.ts`,
  8 scenarios × repeated runs; commit-order properties in `packages/store-postgres/test/commit-order.test.ts`).
- Latency: each decision is one networked transaction (~3.5 ms p50 to a local pg0); throughput
  ~250 commits/s sequential and concurrent (pipelined). SQLite remains the low-latency single-process
  option. Measured: `.agents/evidence/2026-10-09-postgres-performance.md`.
- Known Bun quirk recorded as DEBT-027: Bun's fetch serves a frozen first response for repeated
  identical unary POSTs; the Bun Connect transport defaults to `cache: "no-store"`.
- The store's schema is lowercase-validated (unquoted DDL case-folds; quoted fragments do not —
  mixed-case names would silently split across two schemas), and the LISTEN channel folds into a
  deterministic hash when schema+suffix exceeds the 63-byte identifier limit.
- pg0 is the local/CI distribution (checksums pinned in `scripts/setup-pg0.ts`); RuVector's
  PostgreSQL extension cannot install into pg0's PostgreSQL 18 (supports 14–17) — pgvector 0.8.5
  (bundled) is the PG-native vector path if needed later
  (`.agents/evidence/2026-10-09-ruvector-postgres-pg0.md`).

## Compliance notes

- The design spec (§13) names SQLite as the v0 implementation; this ADR records the contract
  revision rather than editing the frozen spec: PostgreSQL implements the same §13/§10/§32 contract
  surface, enforced by the unchanged conformance kit (CG-EVT-008) plus the new multi-process and
  migration gates (CG-EVT-009, CG-EVT-010).
- Breaking API: `RuntimeOptions.store` widens to a discriminated config (string SQLite path still
  accepted); `RuntimeService.readProjection` returns `{ rows, checkpoint }`.
