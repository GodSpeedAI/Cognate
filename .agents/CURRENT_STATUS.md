# Current status

**Status revision:** 85

**Stage:** WP-23 joined SEA-Cognate journey verified; lane hosted-green

**Summary:** Hosted verify run 45538335916 passed on lane head 88a6399 (live SEA admission suite 03fe68c and status 88a6399). The joined journey against a real sea-forge-server cell (sea-rs ac506217, hosted CI 45538331379) proves admission of the exact delegate; delegation itself, same-uid separation and SEA's AuthenticatedConnection channel remain out of scope.

**Verified:**

- Joined journey (sea-rs ac506217, crates/sea-forge-server/tests/conformance_fde_scenarios.rs, wp23_joined_cognate_journey_against_the_real_server): 1 passed on the real binary, running this repo's sea-admission.live.test.ts with WP23_JOINED_LIVE: 5 pass, 0 fail, 0 skip
- On the live cell the delegate's run completes with assignment (Brief and Budget) and link expiry equal to the served binding, and a case context composed from the served world_ref and episode_kind; a wrong link, another agent, the delegator itself, the same delegate under another tenant and a legacy row are denied with permission_denied and start nothing
- Against the unfixed SEA read (e118900b) the same provider denied the delegate's start: SEA served the binding without world_ref and episode_kind, which the provider treats as a malformed answer. SEA fixed the read in 431e1fc7; the provider is unchanged
- Provider tests (4) drive a real unix-socket SFWP stub: verify and lookup map the served binding into VerifiedAssignmentDelegation and ResolvedAssignment; the Connect startAssignedRun journey runs through registerRuntimeService; hidden, malformed, reissued-link, other-delegate and unreadable or deadline answers resolve undefined
- bun run typecheck clean; protocol-connect, protocol-connect-bun and runtime-api: 153 pass, 0 fail, 7 skip (the two live suites need an external binary or cell)
- Store suites on an isolated pg0 instance: store-postgres, store-sqlite and store-memory 118 pass, 0 fail
- just verify: the check, typecheck, docs, proof-routing and release-publication stages pass; the gate stage is 70/81, identical to revision 83. The 11 unmet gates are the nine AK fixture gates, CG-RT-002 and CG-E2E-001; the last two need the pinned RealityTrace CLI (just setup-realitytrace)
- Hosted verify 45538335916 on 88a6399: success (workflow_dispatch 375474909)

**Limits:**

- The provider reads with a configured principal and actor block over the cell's public socket, which SEA's identity gate resolves against the peer's operating-system uid. SEA's private AuthenticatedConnection channel (single-use, request-bound workload grants) is the S3 identity-issuance step and is not on this path; the delegate's identity is authenticated by Cognate at its Connect layer and is never seen by SEA
- The live suite uses an in-memory store, a permissive Cognate run policy and a test principal map; durable idempotency and Cognate governance are not exercised there
- SEA's driver stops at admission: its cell declares no agent endpoint, so SEA's delegate verb does not execute a delegation against Cognate; Cognate has no SEA-facing delegation endpoint yet
- The local full gate still requires separately installed Phase 0 package trees and the pinned RealityTrace CLI (pre-existing, unchanged by this work)

**Next:** Push and confirm hosted verify; then the Workbench operator journey (PR #40).

**Evidence:**

- packages/protocol-connect-bun/test/sea-admission.live.test.ts
- packages/protocol-connect-bun/src/sea-admission.ts
- https://github.com/GodSpeedAI/SEA-Forge/commit/431e1fc7

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** .agents/DEBT.md
