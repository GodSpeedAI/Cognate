# Current status

**Status revision:** 22

**Stage:** DomainForge 0.18.2 pinned; RealityTrace installed from crates.io (DEBT-010 follow-up done)

**Summary:** `@godspeedai/domainforge` 0.18.2 is exact-pinned (adapter, BINDING, Phase 0 fixture, both lockfiles). It differs from 0.18.1 only in the native binary. The Phase 0 fixture, diagnostic goldens, and adapter gates pass unmodified; the single behavioral change is Policy expression rendering (`forall f in flows: ...` instead of `ForAll(...)`), absorbed by regenerating the golden through the adapter. DEBT-002 stays open (still one GenericFailure code; error line/column are JS call-site positions). Open question 1 rewritten for DomainForge. RealityTrace 0.3.0 is now published on crates.io: `just setup-realitytrace` installs it from the registry, the architecture invariant accepts the exact-version crates.io form, DEBT-010 and ADR-0007 record the follow-up, and AK-006 and CG-RT-002 pass against the registry build.

**Verified:** - Phase 0 domainforge fixture 3x 9/9; adapter+goldens+semantic-to-observation 3x 20/20
- check, typecheck, proof-routing pass
- gate.ts --implemented 75/78 in this container (68 before the RealityTrace install and phase0 scoped installs): AK-006, CG-RT-002, AK-002/005/007/009/011 now pass
- The 3 failures are environmental and identical across pins: AK-004 (Bun 1.3.14 segfault; repo targets 1.4.0), AK-010 and CG-E2E-001 (Playwright chromium build missing)

**Limits:** - Run `just verify` under Bun 1.4.0 with the Playwright browsers installed to confirm 78/78
- DomainForge CLI-version notes in skills (0.18.1) not re-verified against a 0.18.2 CLI
- bun install under 1.3.14 rewrites phase0 lockfiles; not committed

**Next:** Run `just verify` under Bun 1.4.0 with browsers; then DEBT-002 (extract SEA line:col from syntax-error messages) and re-test the CLI fmt forall issue against 0.18.2.

**Evidence:** - .agents/evidence/2026-10-01-domainforge-0.18.2.md
- .agents/evidence/2026-10-01-realitytrace-crates-io.md
- .agents/DEBT.md (DEBT-002 progress, DEBT-010 follow-up)
- docs/decisions/ADR-0002 and ADR-0007 (2026-10-01 addenda)

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** requirements/ledger.yaml

*This file is the human view of the latest snapshot only; the authoritative stream is
[.agents/CURRENT_STATUS.yaml](CURRENT_STATUS.yaml) (revision 22 is its last
line). Material uncertainty lives in [.agents/OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).*
