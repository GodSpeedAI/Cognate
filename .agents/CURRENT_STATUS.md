# Current status

**Status revision:** 21

**Stage:** DomainForge pin moved to 0.18.2; Phase 0 and adapter gates preserved

**Summary:** `@godspeedai/domainforge` 0.18.2 is exact-pinned (adapter, BINDING, Phase 0 fixture, both lockfiles). It differs from 0.18.1 only in the native binary. The Phase 0 fixture, diagnostic goldens, and adapter gates pass unmodified; the single behavioral change is Policy expression rendering (`forall f in flows: ...` instead of `ForAll(...)`), absorbed by regenerating the golden through the adapter. DEBT-002 stays open (still one GenericFailure code; error line/column are JS call-site positions). Open question 1 rewritten for DomainForge.

**Verified:** - Phase 0 domainforge fixture 3x: 9/9
- packages/domainforge + semantic-to-observation 3x: 20/20; example:domainforge ok
- check, typecheck, proof-routing pass; gate.ts --implemented 68/78 here, with the identical 10 failures on 0.18.1 (git stash comparison): missing scoped phase0 installs (cordis etc.) and no SXR binary in this container. Not a regression from the pin. The earlier 78/78 baseline was not reproducible in this environment (Bun 1.3.14, no just).

**Limits:** - Not re-run here: gates needing the SXR binary or scoped phase0 installs (AK-002/004/005/006/007/009/010/011, CG-RT-002, CG-E2E-001); re-run in the full environment before committing.
- DomainForge CLI-version notes in skills (0.18.1) were not re-verified against a 0.18.2 CLI.
- Nothing committed.

**Next:** Re-run `just verify` in the full environment; then DEBT-002 (consider extracting SEA line:col from the message for syntax errors) and the DEBT/doc staleness items listed in the session report.

**Evidence:** - .agents/evidence/2026-10-01-domainforge-0.18.2.md
- docs/decisions/ADR-0002-semantic-binding-domainforge.md (2026-10-01 addendum)
- .agents/DEBT.md (DEBT-002 progress)

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** requirements/ledger.yaml

*This file is the human view of the latest snapshot only; the authoritative stream is
[.agents/CURRENT_STATUS.yaml](CURRENT_STATUS.yaml) (revision 21 is its last
line). Material uncertainty lives in [.agents/OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).*
