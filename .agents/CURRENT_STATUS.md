# Current status

**Status revision:** 4

**Stage:** Build v0: adapters and profiles implemented; regression baseline red

**Summary:** The candidate ledger records 66 implemented requirements, including the DomainForge and RealityTrace adapters. RealityTrace v0.2.0 has been published per the operator, while Cognate's gate still uses a local binary. The current workspace verification passes 52 of 66 implemented gates; AK-006 structured correlation and AK-008 SONA remain blocked.

**Verified:** `just check` passed: 73 requirements (66 implemented, 2 blocked, 5 candidate), with no freeze claimed. Typecheck and proof-routing tests passed during `just verify`. `just gate CG-SEM-002` passed 7/7 tests, including stable derived Flow identity. Earlier [M6 evidence](evidence/m6-semantics-evidence.md) records three passing runs of each adapter suite against pinned dependencies. Earlier [durable-state evidence](evidence/m3-durable-state.md) records crash atomicity, identical projection rebuilds, and deterministic replay. The local RealityTrace tag `realitytrace-v0.2.0` resolves to `6966fa4`, whose CLI manifest declares `realitytrace` 0.2.0.

**Limits:** `just verify` failed on 2026-09-25: 52/66 implemented gates passed; [the audit](evidence/2026-09-25-debt-doc-audit.md) lists all 14 failed IDs. CG-RT-002 currently stops at SXR repo enrollment with a read-only filesystem error, while its earlier M6 proof remains scoped to that environment. AK-006 still lacks a structured SXR correlation round-trip (DEBT-009); Cognate has not installed or run the released CLI on a clean worker (DEBT-010); AK-008 remains blocked (DEBT-008). DomainForge error classification still depends on messages (DEBT-002); kinds without Graph accessors remain an accepted V0 scope limit (DEBT-003). Connect client/bidi streaming, RVF import integrity, RuVector graph/temporal retrieval, and SQLite multi-process writing remain limited (DEBT-004, DEBT-006, DEBT-007, DEBT-011). Five requirements remain candidate; no contract is frozen. See [the debt register](DEBT.md).

**Next:** Investigate and restore the 14 failing implemented gates. Pin and install the released RealityTrace CLI in a clean-worker setup, then prove a documented structured correlation write/read path before closing AK-006. Add pinned DomainForge diagnostic goldens before upgrading its binding.
