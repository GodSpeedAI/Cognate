# Current status

**Status revision:** 43

**Stage:** migration follow-ups closed: ADR-0012 records the naming contract, DEBT-016 narrowed with published-CLI evidence

**Summary:** The two follow-ups from the cognate-* migration are done. ADR-0012 records the package-naming contract revision (the frozen spec keeps its @cognate names; the ADR is the canonical why, with the spec divergence and the provenance-is-N/A decision recorded). DEBT-016 is narrowed to its true remaining gap: the published CLI (bun x @godspeedai/cognate-cli@0.1.1) was exercised from a clean consumer context and generates a working vendored app, so the debt is now only registry-only app generation without --source, plus the provenance half accepted as N/A for the private repository.

**Verified:**
- bun run check, just verify 78/78 gates, full suite 768 tests / 0 fail with the ADR and DEBT changes
- Published-CLI exercise: bun x @godspeedai/cognate-cli@0.1.1 create my-app --profile copilot --source <checkout> from a clean context vendors 26 cognate-* tarballs; the generated app installs and passes its own test
- ADR-0012 registered in docs/decisions/README.md and the documentation map (twelve records)

**Limits:**
- cognate create still requires --source <checkout>; a registry-only mode is the remaining DEBT-016 exit criterion (or an ADR accepting vendoring)
- Spec §27 still names @cognate/*; ADR-0012 is the recorded contract revision, spec text unchanged by design
- Umbrella @godspeedai/cognate remains at 0.1.0 until the next lockstep release

**Next:** Optional product follow-up: registry-only mode for cognate create (closes DEBT-016); spec pass adopting the cognate-* names

**Evidence:**
- .agents/evidence/2026-10-08-release-0.1.0-prep.md
- docs/decisions/ADR-0012-cognate-package-naming.md
- docs/package-naming.md
