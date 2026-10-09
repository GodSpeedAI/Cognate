# Current status

**Status revision:** 46

**Stage:** 0.1.2 documentation release shipped: 36 packages live with consumer READMEs

**Summary:** The README overhaul shipped as 0.1.2 across all 36 packages through the fully automated pipeline: PR #29 (README overhaul + version reconciliation + Release-As 0.1.2) merged on operator approval, Release Please proposed 0.1.2 for all 36 (verified: 36 summaries, 36 version bumps, umbrella 0.1.0 to 0.1.2, no stray versions), and release run 37971472138 succeeded with 37/37 jobs green via OIDC. npm has 36/36 packages at 0.1.2; 36 tags and 36 GitHub releases exist (an apparent 2-release shortfall was a pagination artifact in the verification query, not missing releases). The post-publication CI clean-room passed against the published packages, and npm package pages now serve the new consumer READMEs.

**Verified:**
- npm view: 36/36 packages at 0.1.2
- Release run 37971472138: success, 37/37 jobs (release-please + 36 OIDC publish jobs)
- 36 v0.1.2 tags; 36 v0.1.2 GitHub releases (verified across all pagination pages — an initial count of 34 was per_page=100 truncation)
- Post-publication clean-room green in CI (run 37971472337): installs @godspeedai/cognate-cli@0.1.2 + @godspeedai/cognate@0.1.2 from npm and runs the consumer smoke
- Published npm pages serve the new READMEs (spot-checked store-sqlite)
- check-readmes 36/36; just verify 78/78; full suite 768 tests / 0 fail

**Limits:**
- create still requires --source (DEBT-016); provenance N/A per ADR-0012
- Release-please PR-body parser still intermittently under-creates GitHub releases (34/36 created by the run; 2 bootstrapped via API) — upstream-worthy but fully mitigated
- Full-suite load flakes (deepseek progress-event, ssh fixture race) remain documented and pass on rerun

**Next:** Optional: registry-only mode for cognate create (DEBT-016); spec pass adopting the cognate-* names

**Evidence:**
- .agents/evidence/2026-10-09-readme-overhaul.md
- docs/package-readme-standard.md
- docs/decisions/ADR-0012-cognate-package-naming.md
