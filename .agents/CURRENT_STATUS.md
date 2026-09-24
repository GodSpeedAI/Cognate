# Current status

**Status revision:** 2

**Stage:** Build v0: Phase 0 characterized; durable state plane implemented

**Summary:** Phase 0 fixtures characterized all core boundaries; the durable state plane (events, memory and SQLite stores, projections) passes its contracts; kernel, continuations, cognition, wire, UI, and profiles are in progress.

**Verified:** just verify: 16/16 implemented gates pass (AK-001..005, AK-007, CG-EVT-001..006, CG-PRJ-001..003, CG-ARC-001); SQLite store survives SIGKILL mid-decision with all-or-nothing visibility; Derived projection state deleted from SQLite rebuilds identically; replay deterministic across stores (fast-check). Evidence: [durable state](evidence/m3-durable-state.md) and the `evidence/phase0-*.md` records.

**Limits:** AK-006 RealityTrace and AK-008 SONA are blocked (DEBT-008, DEBT-009); Connect supports unary and server streaming only (DEBT-004); RVF lacks import integrity (DEBT-006); RuVector supports vector search only (DEBT-007); SQLite store assumes a single writer process (DEBT-011); 53 requirements remain candidate; nothing is frozen. See [the debt register](DEBT.md).

**Next:** Land kernel-cordis, continuations/commitments, capabilities/artifacts, cognition; then wire (proto/Connect), adapters, client/UI, profiles, CLI, E2E per .agents/plans/build-v0.md.
