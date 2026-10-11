# RuVector-Postgres investigation against pg0 (mission DEBT-011 §1.7) — 2026-10-09

Question: can the RuVector PostgreSQL extension serve as (or contribute to) the vector capability of
the new PostgreSQL-backed store, installed into pg0's bundled server?

## Verdict

**No.** ruvector-postgres cannot be installed into pg0's bundled PostgreSQL, so Cognate keeps its
existing RuVector/RVF adapters unchanged, and pg0's bundled **pgvector 0.8.5** is the verified
in-database vector capability on PostgreSQL. This does not block DEBT-011: authoritative event
storage and derived cognitive indexes remain separate (spec §3, §15).

## Findings (verified against upstream sources on 2026-10-09)

1. **PostgreSQL major-version incompatibility (decisive).** The ruvector-postgres README documents
   support for "PostgreSQL 14, 15, 16, or 17" and builds through cargo-pgrx 0.12.9 (`cargo pgrx
   init --pg16 …`). pg0 v0.15.2 bundles **PostgreSQL 18.1.0** (verified locally: `SELECT version()`
   → "PostgreSQL 18.1 on x86_64-pc-linux-gnu"). Building the extension against pg0's PG 18 headers
   is unsupported upstream, and the mission forbids loading an extension compiled for an
   incompatible PostgreSQL major. No prebuilt extension binaries are published (a Docker image and
   npm CLI exist; a source build needs cargo-pgrx plus matching server development headers, which
   pg0 does not ship — it distributes a self-contained server, not a -dev environment).
2. **The historically reported native-index defect with parameterized vector queries is real and
   was fixed upstream.** Issue #141, "Critical: HNSW Index Segmentation Fault with Parameterized
   Queries", filed and closed 2026-01-28 by PR #142 ("fix(hnsw): resolve segfault with
   parameterized queries"). The mission required exercising the exact pinned version with real
   integration tests before trusting the fix; that is moot here because (1) prevents any install
   into pg0 at all.
3. **Maintenance posture.** Last commits touching `crates/ruvector-postgres`: 2026-08-12; repo
   reports 139 open issues / 176 open PRs; MIT license; no pinned release tag for the extension
   itself among recent releases (recent tags target wasm/crates/npm artifacts).

## Consequences

- `packages/cognitive-ruvector` and `packages/cognitive-rvf` adapters stay exactly as they are
  (DEBT-006/DEBT-007 unchanged by this mission).
- On PostgreSQL, a future PG-native cognitive index path exists through pgvector 0.8.5 (bundled in
  pg0; `CREATE EXTENSION vector` verified working on the dev instance). A small pgvector-backed
  `CognitiveIndex` adapter — with tenant filtering as ordinary WHERE predicates and deterministic
  ordering via explicit tie-breaks — is recorded as candidate follow-up work, not part of this
  mission.
- RuVector must never become an unverified source of durable business truth; this investigation
  changes nothing about that rule.

Sources: github.com/ruvnet/RuVector (tree README of crates/ruvector-postgres; issues #141, #142;
commits API for crates/ruvector-postgres; releases list), pg0 v0.15.2 release notes, and the local
pg0 dev instance (PostgreSQL 18.1.0 + pgvector 0.8.5, live-verified).
