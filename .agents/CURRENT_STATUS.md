# Current status

**Status revision:** 44

**Stage:** building-with-cognate skill updated for the published cognate-* SDK

**Summary:** The building-with-cognate skill no longer claims the CLI is unpublished. references/cli.md flips to the published distribution (bunx @godspeedai/cognate-cli, 0.1.x line) with the --source requirement stated as DEBT-016's remaining gap; references/cognate-api.md and references/idm-to-cognate.md now cite installed package paths (@godspeedai/cognate-*/src/...) instead of monorepo source files, so the skill works without a Cognate checkout, with docs/*.md links marked as repository-relative supplements; SKILL.md's tooling line and the stale DomainForge 0.18.x binding claims are corrected to 0.19.0.

**Verified:**
- bun run check passes; just verify 78/78 gates; full suite 768 tests / 0 fail (one transient load-family flake on the first run, clean on rerun)
- Whole-skill audit: zero packages/<dir> source citations and zero 0.18.x claims remain; every citation resolves to an installed npm package path or a marked repository-relative docs link
- Published-CLI evidence carried over: bun x @godspeedai/cognate-cli@0.1.1 create works from a clean context (DEBT-016 exercise)

**Limits:**
- create still requires --source <checkout> (DEBT-016 registry-only mode)
- docs/*.md links in the skill remain repository-relative supplements (private repo); the npm package READMEs are the public equivalent

**Next:** Optional: registry-only mode for cognate create (DEBT-016); spec pass adopting the cognate-* names

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
- docs/decisions/ADR-0012-cognate-package-naming.md
