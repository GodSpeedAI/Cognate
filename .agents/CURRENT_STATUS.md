# Current status

**Status revision:** 83

**Summary:** seaAssignmentAdmission (e2ec279) resolves assigned starts from SEA's authoritative assignment_binding_get over the SFWP unix channel; hosted verification passed.

**Verified:**

- Provider tests (4) drive a real unix-socket SFWP stub: verify and lookup map the served binding (assignment, link, world, kind) into VerifiedAssignmentDelegation and ResolvedAssignment; the Connect startAssignedRun journey runs through registerRuntimeService with the provider, and a hidden SEA answer is denied before any run
- Fail-closed matrix: wrong tenant and non-agent caller never reach SEA (0 requests); hidden, malformed, reissued-link, other-delegate and unreadable/deadline answers all resolve undefined
- All focused suites green: protocol-connect + protocol-connect-bun + runtime-api assignment 153 passed / 0 failed; store-postgres 49/0 on an isolated pg0 instance (port 5434); store-sqlite + store-memory 69/0; bun run typecheck clean
- just verify: check, typecheck, docs, proof-routing and release-publication stages passed; the gate stage remains 70/81 — identical without this change (Phase-0 fixture gates need separately installed package trees, a known local-env limit recorded at revision 81)
- Hosted verify run 45107103046 passed on e2ec279 (feat/wp23-verified-assignment-start)

**Limits:**

- The provider authenticates its SFWP reads with a configured principal and actor block; workload-grant identity (SEA's private AuthenticatedConnection) is the S3 identity-issuance step and is not wired here
- The local full gate still requires separately installed Phase 0 package trees and the pinned RealityTrace CLI (12 pre-existing gate failures, unchanged by this work)
- The joined production-producer journey (real SEA cell serving assignment_binding_get to a real Cognate server) is the next step with the Workbench operator journey

**Next:** Drive the joined SEA-Cognate journey against a real sea-forge cell; then Workbench PR #40 through the operator journey.
