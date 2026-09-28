# Current status

**Status revision:** 11

**Stage:** Build v0 complete; Artifact Viewer documentation mode refined and verified.

**Summary:** The dirty Artifact Viewer now keeps its header and mode bar in view, shows only the selected projection, handles narrow screens, displays revision provenance accurately, and preserves unsaved edits during navigation. Eight purposeful Mermaid diagrams now appear across six canonical documentation pages. Hallmark and independent Impeccable reviews found and resolved material interface issues. No commit or documentation corpus restructure was made. See the [viewer evidence](evidence/2026-09-27-artifact-viewer-refinement.md).

**Verified:** `just verify` passed typecheck and 78/78 implemented gates. The viewer server and browser suites passed 56 tests with 518 assertions. Live Chromium covered J0–J11, including real Git history and revision rendering, Mermaid, search, compare, edit/save, recovery, desktop/tablet/mobile layouts, and zero console or page errors. `CG-DOC-001` passed. The previous [DeepSeek redesign evidence](evidence/2026-09-27-deepseek-harness-redesign-decision.md) remains valid.

**Limits:** Artifact Viewer remains local Documentation Mode; GitHub enrichment and other artifact types are deferred. DeepSeek approval, plan-review, streaming, and tool-call states had code review only; three Settings buttons and the Review toolbar remain untouched; disclosure UI is not one shared component; tablet range was not live tested; the parity report is stale by design. Framework limits remain: Connect unary/server streaming only (DEBT-004), single SQLite writer (DEBT-011), erasure copies (DEBT-014), polling loop (DEBT-015), unpublished packages (DEBT-016), Bun `toMatchObject` mutation (DEBT-017), intermittent RVF `FsyncFailed` (DEBT-018), and the scoped subagent resolver (DEBT-020). The ledger remains a candidate. See [the debt register](DEBT.md).

**Next:** Operator review of the dirty Artifact Viewer and DeepSeek UI changes; optionally finish the disclosed DeepSeek UI limitations and decide the ledger freeze (OPEN_QUESTIONS 3).
