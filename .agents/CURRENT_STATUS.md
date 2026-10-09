# Current status

**Status revision:** 41

**Stage:** cognate-* migration complete: 0.1.0 published, 0.1.1 released through fully automated OIDC, superseded names deprecated

**Summary:** The renamed @godspeedai/cognate-* SDK is live on npm: 0.1.0 of all 36 identities published and verified, 33 superseded @godspeedai/<module> packages deprecated with migration messages (realitytrace pending one operator command), and the automated pipeline proven end to end — a fix commit flowed Release Please (0.1.1 for 35 components, lockstep) through npm trusted publishing (OIDC, zero tokens) with every publish job green. The umbrella joined the release config after its path was found missing; it publishes 0.1.0 (manual first push) and re-joins lockstep at the next release.

**Verified:**
- npm: 36/36 cognate-* packages resolved via npm view at publication time; 35 at 0.1.1 after the automated release (umbrella 0.1.0, current)
- Automated round: release run 37880531909 success — 36/36 publish jobs green via OIDC (id-token: write, no tokens), serialized, guard-guarded
- Deprecations: 32/33 verified via npm view deprecated with the migration message; @godspeedai/realitytrace@0.1.0 deprecation needs one rerun from the operator session (EOTP here)
- Real-registry clean-room in CI (package.yml) now active and green: installs @godspeedai/cognate-cli from npm, consumer smoke + typed probe pass
- Release Please state aligned: manifest, cognate-* tags, and GitHub releases agree at 0.1.1 (umbrella 0.1.0); verification dispatches succeed with no duplicates

**Limits:**
- @godspeedai/realitytrace@0.1.0 deprecation pending one operator command (EOTP in the agent session)
- Umbrella sits at 0.1.0 while the group is 0.1.1; linked-versions pulls it to the group version at the next release
- Trusted-publisher configs must each complete a successful OIDC publish within 2 days of creation; the 0.1.1 round validated them the same day
- Umbrella 0.1.1 tag creation collided with the bootstrap release (already_exists) once; resolved by state alignment, no residue

**Next:** Operator reruns the realitytrace deprecation command; optionally exercise bunx @godspeedai/cognate-cli create from a clean machine to finish DEBT-016's exit criterion

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
- docs/package-naming.md
