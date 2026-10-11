# Current status

**Status revision:** 47

**Stage:** PostgreSQL becomes an authoritative DurableStore: DEBT-011/014/021 closed on feat/debt-011-postgres-store

**Summary:** The mission branch delivers @godspeedai/cognate-store-postgres (postgres.js driver; PostgreSQL 18.1 via pinned, checksum-verified pg0 v0.15.2): the unchanged store conformance kit passes on PG; position order equals commit order across processes via a counter-row FOR UPDATE lock; multi-process writers are proven by 8 separate-process scenarios; runtimeServiceConformance passes on PG (28 tests); a verified one-transaction SQLite→PG migration with canonical-JSON digests, idempotency replay, refuse-double-import and dry-run; erasure now reaches every derived copy (store-level idempotency-snapshot redaction, continuation cascade, transitive recall closure, durable resumable jobs) on all three stores; projection reads carry their checkpoint end-to-end (store snapshot → service → Connect proto → client) and the client converges without sleeps, proven in gated React/client tests and cross-process over the wire; both reconstruction apps run on PG with all their suites green (harness 863/863, copilot 12 + 62); CI gains a pg0-backed matrix step; performance measured (~250 commits/s on TCP vs ~24k in-process SQLite; the documented trade).

**Verified:**
- bun run check: 81 requirements (3 new PG gates CG-EVT-008/009/010), 0 blocked
- just verify: 81/81 gates (incl. CG-SEC-001 erasure on PG); PG-backed suites green in CI config
- packages/store-postgres: conformance 27/27, commit-order 6/6, migration 4/4, driver smoke 2/2
- tests/integration: postgres-multiprocess 8/8 (5 consecutive runs), projection-convergence 5/5 stable, erasure 3/3 on PG
- runtime service conformance on PG: 28/28 incl. restart; harness 863/863; copilot journeys 12/12 and persistence+architecture 62/62
- Live boots: copilot AG-UI journey RUN_FINISHED durably in schema cognate_copilot_*; harness Connect StartRun events in cognate_harness_tmp_cg_home
- bun run typecheck clean; check-readmes OK; docs map + decisions README register ADR-0013

**Limits:**
- PostgreSQL per-decision latency is TCP-bound (~3.5 ms p50, ~250 commits/s) vs in-process SQLite (~24k/s); SQLite stays supported for single-process apps (ADR-0013, evidence note)
- runtime.idle() under heavy parallel load can exceed its 10 s budget on PG (intermittent copilot persistence-suite flake; passes standalone and on rerun)
- Bun fetch caches repeated identical unary POSTs (DEBT-027); the framework's Bun transport defaults to cache: no-store
- RuVector's PostgreSQL extension cannot install into pg0's PostgreSQL 18 (supports 14-17); pgvector 0.8.5 bundled is the PG-native vector path (evidence note)
- Physical erasure on PG follows MVCC/WAL semantics: operator VACUUM + backup retention documented, no physical-erasure claim

**Next:** Operator review + PR merge; release-please lockstep picks up cognate-store-postgres (already in linked-versions)

**Evidence:**
- .agents/evidence/2026-10-09-postgres-migration.md
- .agents/evidence/2026-10-09-postgres-performance.md
- .agents/evidence/2026-10-09-ruvector-postgres-pg0.md
- docs/decisions/ADR-0013-postgresql-authoritative-store.md
