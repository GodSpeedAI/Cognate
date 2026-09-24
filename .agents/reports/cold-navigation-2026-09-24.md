# Cold navigation check — 2026-09-24

A fresh-context read-only agent started at the repository root and followed `AGENTS.md`. It found the normative spec and status in one routed step, the implementation plan and candidate ledger in two, package homes in spec §27, dependency direction in §28, the narrow Phase 0 proof in `just --list`, and evidence under `.agents/evidence/`.

Observed defects and repairs in this formation pass:

- The candidate ledger listed the spec as a frozen surface while `freeze_hash` was `candidate`. Changed those lists to empty; the spec remains normative and digest-bound, but no freeze is claimed.
- README's documentation section said root `AGENTS.md` was empty. Updated it to route to the populated guide and status.

The agent confirmed that `just verify` is scoped to the substrate and that AK-002–007 fail explicitly. A second fresh read-only walk confirmed both repairs and found two minor wording issues: an ambiguous README development sentence and abbreviated validator paths in the evidence record. Both were corrected. This was a navigation review, not an independent semantic critic or a product E2E test.
