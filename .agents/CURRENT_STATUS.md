# Current status

**Status revision:** 45

**Stage:** published-README overhaul: standard, mechanical gate, 36 consumer READMEs, 0.1.2 release prepared

**Summary:** Every published package README is now consumer documentation per docs/package-readme-standard.md: exact-name H1, install line, Bun-only requirements, a quick start derived from real exports, plain-language limitations, related packages, and Apache-2.0. The mechanical gate scripts/check-readmes.mjs (banned internal identifiers, stale publication claims, install-name existence, relative-link resolution, license statement) runs in just docs/verify and CI. Repository README publication claims corrected. Discovered and queued for reconciliation: the umbrella release PR had silently reverted 35 package.json versions to 0.1.0 on main while npm has them at 0.1.1 — the release branch restores the published versions and triggers a 0.1.2 documentation release via a Release-As footer.

**Verified:**
- check-readmes: 36/36 packages OK (zero internal identifiers, stale claims, unresolved links, unknown package names)
- just verify: 78/78 gates; full suite 768 tests / 0 fail on a clean run (two transient families observed under load: the documented deepseek progress-event flake and an execution-ssh fixture race that passes in isolation and on clean runs)
- Pack inspection: tarballs carry the package README (existing inspect-npm-tarballs gate)
- README examples derive from each package's src/tests; the CI clean-room executes the umbrella quick start flow against published packages
- Repository README: status banner, getting-started, and workspace-package intro corrected for publication

**Limits:**
- create still requires --source (DEBT-016); provenance N/A for the private repository (ADR-0012)
- Three transient full-suite failures observed and reproduced as environment/load flakes, not code regressions (ssh fixture race passes 24/24 in isolation twice; two runs were killed by command timeout mid-suite and misread as failures)
- Release PR preparation stops at the approval boundary: merging and publishing require operator approval

**Next:** On approval: merge the README-overhaul PR, merge the resulting Release Please release PR (proposes 0.1.2 for all 36 via Release-As + linked-versions), and let the release workflow publish via OIDC

**Evidence:**
- .agents/evidence/2026-10-09-readme-overhaul.md
- docs/package-readme-standard.md
