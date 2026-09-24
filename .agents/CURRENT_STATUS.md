# Current status

**Status revision:** 1

**Stage:** Phase 0 project substrate

**Summary:** The draft architecture has a validated project substrate; no Cognate runtime package, CLI, UI, or published API exists.

**Verified:** `just verify` passed the candidate-ledger routing check and two Bun tests. The SQLite fixture covered commit, thrown-error rollback, stale-revision rejection, and reopen persistence. The topology scaffold and requirement-ledger validators passed. See [the observation record](evidence/2026-09-24-substrate.md).

**Limits:** Process-crash recovery, the full structural E2E, Cordis, DomainForge, Connect, RuVector, and optional adapters remain unverified. The [Phase 0 ledger](../requirements/ledger.yaml) is a candidate slice; no contract is frozen or settled.

**Next:** Run and record remaining Phase 0 fixtures, pin the tested dependency matrix, then create the first runtime packages. Expand and independently criticize the ledger before freezing. Follow the [implementation route](plans/implementation.md) and [design spec](specs/software-design-spec-cognate.-frameworkmd).
