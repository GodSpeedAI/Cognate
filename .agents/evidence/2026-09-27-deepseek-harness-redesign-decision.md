# Decision: retire pixel/behavior parity as the goal for validation/reconstructions/deepseek-harness

Date: 2026-09-27
Branch: `cognate/harness`
Scope: `validation/reconstructions/deepseek-harness/cognate` (the reconstructed app's UI only — not
the framework packages the reconstruction exercises).

## What changed

`.agents/CURRENT_STATUS.yaml` revision 9 recorded this reconstruction as Build v0's litmus test:
a from-scratch rebuild of the DeepSeek Harness web app (pinned reference commit `477b4f4`) whose
value was measured by how closely it matched that reference — behavioral parity
(`reference-behavior-matrix.md`) and pixel/visual parity (`diffs/`, `tests/visual/compare.ts`,
`parity-report.md`), with every intentional divergence logged in `DEVIATIONS.md`.

The operator explicitly requested a UI/UX design pass on this surface using the Hallmark
(structural/anti-slop) and Impeccable (diagnosis/refinement) skills, aimed at a coherent and
distinctive visual identity. That mandate is incompatible with the parity mandate: Hallmark's job
is to move a surface *away from* sameness with an existing product's visual language, which is the
opposite of what this fixture was scoring. Asked directly, the operator chose to retire parity as
this surface's goal rather than constrain the redesign to parity-preserving changes or fork the
work elsewhere.

## Consequence

- `parity-report.md`, `diffs/summary.md`, `diffs/desktop/*.png`, `diffs/laptop/*.png`, and
  `tests/visual/compare.ts`'s stored baselines are now **stale as of this commit** and will not be
  kept green. They remain as historical evidence that the reconstruction *did* achieve parity
  before this redesign — that result is not being retracted, only superseded as an ongoing target.
- `DEVIATIONS.md` continues to record deviations from the reference up to this point; new
  divergence introduced by the redesign is a deliberate product decision, not a tranche deviation,
  and is tracked instead in the new `DESIGN.md` this redesign introduces.
- Behavioral parity (the actual Cognate-framework proof: journeys A–H, the `test/` suite, the
  architecture tests under `tests/architecture/`) is **not** affected by this decision and is
  expected to keep passing — this is a visual/UX redesign, not a rebuild of the app's logic.
- `.agents/CURRENT_STATUS.yaml`'s next revision (recorded once the redesign's own verification pass
  completes) will describe this surface as a design-refinement exercise built on top of the settled
  reconstruction, and will link both this file and the redesign's own completion report.

## Who should read this

Anyone comparing `validation/reconstructions/deepseek-harness/cognate`'s current UI against
`reference/screenshots/` or `parity-report.md` and finding mismatches: the mismatches are expected
and intentional from this commit forward. The reconstruction's behavioral fidelity is unaffected.
