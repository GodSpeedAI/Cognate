# Independent audit closure — 2026-09-25

The fresh-context critic ([report](../reports/independent-audit-2026-09-25.md)) found 0 critical, 3 major, 6 minor issues. Each finding was closed with a test written before (or alongside) the change, and a ledger requirement so the coverage is permanent.

| Finding | Change | Command | Result |
| --- | --- | --- | --- |
| F-01 major §9.2 append-only not proven | SQLite migration v2 adds `BEFORE DELETE` / `BEFORE UPDATE` triggers on `events` (only a single erasure may set erasure columns); new test | `bun test ./tests/integration/append-only.test.ts ./packages/store-sqlite ./tests/integration/{crash,erasure,rebuild}.test.ts` ×3 | 2 of 4 new tests RED first; then 31 pass ×3 (CG-EVT-007) |
| F-02 major §8.3 definition independence untested | Kernel kit contract case: one definition in two scopes + a second kernel | `bun test ./packages/kernel-cordis/test/contract.test.ts` | 13 pass (implementation already conformed; proof was missing) (CG-KRN-009) |
| F-03 major §31.4–31.7 failure isolation uncited | `tests/integration/failure-isolation.test.tsx` injects RVF snapshot failure, broken DomainForge source, RealityTrace outage, UI render crash | same ×3 | 4 pass ×3 (CG-FAIL-001) |
| F-04 minor §3.1/3.2/3.3/3.7/§23 uncited | `tests/architecture/invariants.test.ts` | `bun test ./tests/architecture/invariants.test.ts` | first run caught an over-broad check (`PolicyDecision` is a framework type), refined; 4 pass (CG-ARC-003) |
| F-06 minor concurrent gate runs cause spurious drift | `scripts/gate.ts` takes `.tmp/gates.lock` for `--all`/`--implemented`; concurrent run exits 3; stale lock taken over | `bun test ./tests/proof-routing.test.ts` ×2 | RED first; then 5 pass |
| F-08 minor no boundary-exact size test | limits test: exactly `maxBodyBytes` accepted, +1 byte rejected | `bun test ./packages/protocol-connect-bun` ×3 | 7 pass ×3 |
| F-05 informational, F-07 and F-09 minor | Observations, no defect: F-05 independently re-verified the fixed harness tenant leak; F-07 found the debt register accurate; F-09 found README claims appropriately hedged | — | — |
