# Current status

**Status revision:** 6

**Stage:** Build v0 complete: all 77 candidate requirements implemented; no upstream blocks

**Summary:** AK-006 and AK-008 are implemented, so all 77 ledger requirements pass. RealityTrace v0.3.0 (ingest --extensions) carries Cognate's correlation ids in the committed record and the adapter reads them back; the adaptive ranker is Cognate-owned UCB1, replacing the rejected SONA. just verify and just gates pass 77/77, including the §36 journey against RealityTrace v0.3.0.

**Verified:** just verify 2026-09-25: substrate check (77 implemented, 0 blocked), typecheck (0 errors), 77/77 implemented gates; just gates 2026-09-25: 77/77 gates pass, including the §36 Playwright journey with RealityTrace v0.3.0; RealityTrace PR #2 (--extensions, envelope builder fix, release workflow publish fix): cargo fmt/clippy/test pass, CI pass; released as realitytrace-v0.3.0; AK-006: live write/read round-trip and duplicate delivery at the same ledger position (11 pass); CG-RT-002 adapter readCorrelation (16 pass); AK-008: UCB1 ranker contract written first (failed 2/6 on the greedy ranker), then 6/6 with capabilities and containment tests (14 pass). Evidence: [RealityTrace correlation](evidence/2026-09-25-realitytrace-correlation.md), [UCB1 ranker](evidence/2026-09-25-ucb1-ranker.md), [audit closure](evidence/2026-09-25-audit-closure.md), [releases](evidence/2026-09-25-releases.md), [profiles, CLI, examples, E2E](evidence/m9-profiles.md), [wire and client](evidence/m8-wire-client.md), [independent audit](reports/independent-audit-2026-09-25.md).

**Limits:** Connect unary + server streaming only (DEBT-004); single SQLite writer (DEBT-011); erasure copies remain in continuation records and recall steps (DEBT-014); polling runtime loop (DEBT-015); Packages unpublished (DEBT-016); Bun 1.4.0 toMatchObject mutation (DEBT-017); intermittent RVF FsyncFailed retried in the E2E app (DEBT-018); The ledger is a candidate: no contract is frozen; crates.io upload of realitytrace 0.3.0 hit the new-crate rate limit; the git-tag install Cognate uses is unaffected. See [the debt register](DEBT.md).

**Next:** Operator decision: freeze the ledger (OPEN_QUESTIONS 3) or revise it; re-run the RealityTrace publish job after the rate limit clears; then release process (DEBT-016).
