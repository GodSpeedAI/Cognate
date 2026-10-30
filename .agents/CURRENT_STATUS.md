# Current status

**Status revision:** 74

**Summary:** The egm-bootstrap skill was run over the repository with target_filename=EGM.md, leaving every existing README untouched because the npm README gate (docs/package-readme-standard.md, scripts/check-readmes.mjs) owns those files. The pruned BFS map produced 172 code-bearing or blueprint directories; with the repository-root blueprint that is 173 EGM.md contracts, one per directory, each citing real source locations for its Interface, Invariants, and Side Effects. A drift report at .agents/reports/egm-drift-2026-10-30.md audited 12 of them claim-by-claim against source and found 7 issues; 6 were corrected in the contracts, 1 was withdrawn as an error in the report itself, and a repo-wide link sweep additionally fixed 13 blueprints that had left an existing child contract unlinked. bun run check, bun scripts/check-readmes.mjs, and bun run typecheck all pass.

The EGM bootstrap added one contract file per directory rather than replacing the existing
pages. `target_filename` was set to `EGM.md`, so `README.md` was never a target. That
mattered: `scripts/check-readmes.mjs` enforces a mechanical standard over the 45 published
package READMEs, and the bootstrap has no business rewriting a landing page whose audience
is a developer arriving from npmjs.com. The 173 new files sit beside the READMEs and
describe code boundaries instead of install instructions.

The scope came from the skill's own pruning rules, not from a hand-picked list. Breadth-
first discovery skipped `.git`, `node_modules`, build output, and test-only directories;
what remained was 107 directories holding their own source plus 65 intermediate blueprint
directories, and the repository-root blueprint made 173 files. Every contract grounds its
`Interface`, `Invariants`, and `Side Effects` in cited source locations rather than in
directory names, which is the only property that makes the tree worth keeping.

Two defects are worth reading if you touch this tree later. First, contracts written
concurrently cannot see each other, so any "child contract does not exist" sentence is only
true at the instant it is written; a post-pass sweep now reports zero children whose
`EGM.md` their parent blueprint fails to link. Second, the drift audit is what caught the
rest. It read 12 contracts claim by claim against source and found 7 issues, of which 6 were
real and are fixed; the seventh was an arithmetic error in the audit itself, recorded as
withdrawn rather than silently dropped.

What this does not claim: only 12 of 173 contracts were audited at claim level, no
`## Verification` command was executed, and nothing yet ranges over these files mechanically.
Until `just verify` covers them, `EGM.md` and the code can drift apart again without a gate
noticing.

Next: decide whether the contracts join `just verify`, and either audit the remaining 161 at
claim level or delete the ones the team will not maintain. Ledger freeze remains an operator
decision.
