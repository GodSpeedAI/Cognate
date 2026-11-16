# packages/domainforge

Adapter only: `Graph.parse` -> `SemanticProjection`. Never throw; classify
errors by `.message` (DEBT-002). Flow id is derived, never the native UUID
(DEBT-001). Don't edit `test/`, fixtures, or the pinned `@godspeedai/domainforge`
version. Keep `mappingTable` covering all 13 kinds.

## Pin changes

The pin moves only as a stack-wide DomainForge lockstep bump that the owner has
approved. In that case the manifest pin, `BINDING` in `src/types.ts`, the binding
string in the projection fixture, the lockfile entries and `DOMAINFORGE_VERSION`
in CI move together in one change; nothing else in `test/` or the fixtures is
edited. The RealityTrace CLI pinned in the `justfile` (`setup-realitytrace`) is
part of the same lockstep: it must be a RealityTrace release whose own
DomainForge pin (`PINNED_DOMAINFORGE_VERSION`) equals the new version, so it
moves in the same change or, when that release does not exist yet, in a
follow-up recorded in the table. Record each approved bump here.

| Date | From | To | Approved by | Change |
|---|---|---|---|---|
| 2026-11-13 | 0.21.1 | 0.21.2 | owner | #77 (RealityTrace main and the DomainForge head were already on 0.21.2; readiness gate C01). Follow-up done in the row below |
| 2026-11-13 | RealityTrace CLI 0.3.0 | 0.4.0 | owner | this PR: closes the follow-up owed in #77; RealityTrace 0.4.0 carries DomainForge 0.21.2 |
| 2026-11-14 | 0.21.2 | 0.22.0 | owner (lockstep bump task) | this PR. RealityTrace CLI stays at 0.4.0 (carries DomainForge 0.21.2) until a RealityTrace release pinning 0.22.0 exists; follow-up owed |
| 2026-11-16 | 0.22.0 | 0.22.2 | owner (lockstep bump task) | this PR. 0.22.1 and 0.22.2 are packaging fixes only (no language or API change); 0.22.2 is the first release publishing native npm bindings for linux-arm64, darwin-arm64, darwin-x64 and win32-x64 (0.22.0 shipped linux-x64 only). RealityTrace CLI stays at 0.4.0 (carries DomainForge 0.21.2): no RealityTrace release pins 0.22.x (realitytrace 0.5.0 carries no `domainforge` crate in its Cargo.lock), so moving the CLI pin is a follow-up owed |
