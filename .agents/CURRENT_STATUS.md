# Current status

**Status revision:** 9

**Stage:** Build v0 complete; DeepSeek Harness reconstruction settled on branch cognate/harness

**Summary:** Rebuilt the DeepSeek Harness web app (pinned 477b4f4) on Cognate as a litmus test: journeys A–H pass on reference and Cognate, visual parity approved after 7 critic rounds, purity and reference-removal checks pass. The test surfaced framework changes D1 (emit-in-step replay drift), D2 (stream abort mapping), F3 (structured invocation failures) and G1 (new invocation progress channel for streaming); F2 recorded as DEBT-020. just verify 78/78; full suite 524 pass.

**Verified:** just verify 2026-09-27: 78/78 gates; bun run test 2026-09-27: 524 pass, 0 fail; reconstruction architecture tests: 62 pass; app tests 21/21; fixtures 20/20; Playwright journeys A–H: Cognate 11/11, reference 11/11 (2 flaky, pass on retry); clean reference-removal run: all steps PASS; critic round 6 APPROVE; round 7 finding fixed and verified; earlier: just verify 2026-09-26: 78 implemented, typecheck 0 errors, 78/78 gates; earlier: just gates 2026-09-26: 78/78; earlier: bun run test: 512 pass, 0 fail; earlier: bun scripts/gate.ts CG-SEM-001: 6 pass, 113 expects; earlier: accessor probe post-install: allPolicies/allMetrics/allMappings/allProjections/allDimensions/allUnits/allPatterns/allConceptChanges/allEntityInstances are functions at 0.18.1. Evidence: [DeepSeek Harness reconstruction](evidence/2026-09-27-deepseek-harness-reconstruction.md), [parity report](../validation/reconstructions/deepseek-harness/parity-report.md).

**Limits:** Connect unary + server streaming only (DEBT-004); single SQLite writer (DEBT-011); erasure copies remain in continuation records and recall steps (DEBT-014); polling runtime loop (DEBT-015); Packages unpublished (DEBT-016); Bun 1.4.0 toMatchObject mutation (DEBT-017); intermittent RVF FsyncFailed retried in the E2E app (DEBT-018); The ledger is a candidate: no contract is frozen; spawnSubagent completion resolver only inside createHarness (DEBT-020); reconstruction lives on branch cognate/harness, not main. See [the debt register](DEBT.md).

**Next:** Operator: review and merge cognate/harness (framework fixes D1/D2/F3/G1 plus validation/), decide DEBT-020; then the CopilotKit reconstruction on cognate/copilot; ledger freeze decision (OPEN_QUESTIONS 3) still open.
