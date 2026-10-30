# Current status

**Status revision:** 75

**Summary:** The first push of the EGM bootstrap failed two of the repository's own gates, and both failures were real: the bootstrap had placed contract files where repo tooling assumes generated output or a package directory. packages/proto/test/codegen.test.ts:36 digests the entire regenerated tree against src/gen, so contracts under proto/, proto/cognate/, and packages/proto/src/gen/** failed CG-WIR-001; tests/architecture/docs.test.ts:37 and .github/workflows/package.yml:72 both iterate every entry of packages/ and profiles/ expecting a directory with README.md and AGENTS.md, so packages/EGM.md and profiles/EGM.md failed CG-DOC-001 and the pack job with ENOTDIR. The workspace and profile blueprints moved into the root EGM.md, the proto surface moved into packages/proto/EGM.md, and the generated-boundary contracts were removed, leaving 166 contracts. just verify now passes all 81 gates, and the two CG-SEC-001 and CG-EVT-008 failures seen in the first local run were a stopped local PostgreSQL instance, not the change.

The EGM bootstrap added one contract file per directory rather than replacing the existing
pages. `target_filename` was set to `EGM.md`, so `README.md` was never a target. That
mattered: `scripts/check-readmes.mjs` enforces a mechanical standard over the 45 published
package READMEs, and the bootstrap has no business rewriting a landing page whose audience
is a developer arriving from npmjs.com. The 173 new files sit beside the READMEs and
describe code boundaries instead of install instructions.

The scope came from the skill's own pruning rules, not from a hand-picked list. Breadth-
first discovery skipped `.git`, `node_modules`, build output, and test-only directories;
what remained was 107 directories holding their own source plus 70 intermediate blueprint
directories. Every contract grounds its `Interface`, `Invariants`, and `Side Effects` in
cited source locations rather than in directory names, which is the only property that
makes the tree worth keeping.

The first version of this work failed two of the repository's own gates, and both failures
were instructive. `packages/proto/test/codegen.test.ts:36` digests the entire regenerated
tree and compares it against `src/gen`, so a contract file placed anywhere under `proto/`
or `packages/proto/src/gen/` makes CG-WIR-001 fail. And both
`tests/architecture/docs.test.ts:37` and `.github/workflows/package.yml:72` iterate every
entry of `packages/` and `profiles/` expecting a package directory, so a file dropped
directly in either one fails CG-DOC-001 and breaks packing with `ENOTDIR`. Six contract
files moved or disappeared to respect those boundaries: the workspace and profile blueprints
folded into the root `EGM.md`, the proto surface folded into `packages/proto/EGM.md`, and the
generated-tree contracts were deleted rather than left where no tool expects them.

A drift audit of 12 contracts against source found 7 issues. Six were real and are fixed:
the root blueprint misdescribed `examples/`, `actualize/`, and what `check-substrate.ts`
enforces about the human status view; the workspace blueprint called 18 packages unlinked
when all 18 have contracts; `packages/events/EGM.md` denied a child contract that exists;
and `packages/ui-astryx/EGM.md` claimed `src/` had no contract. The seventh was an arithmetic
error in the audit itself and is recorded as withdrawn. A repo-wide sweep additionally
linked 13 blueprints that had left an existing child unlinked. Both sweeps now report zero.

What this does not claim: only 12 of 166 contracts were audited at claim level, no
`## Verification` command inside a contract was executed, and nothing yet ranges over these
files mechanically. Until `just verify` covers them, `EGM.md` and the code can drift apart
again without a gate noticing.

Next: decide whether the contracts join `just verify`, and either audit the remaining 154 at
claim level or delete the ones the team will not maintain. Ledger freeze remains an operator
decision.
