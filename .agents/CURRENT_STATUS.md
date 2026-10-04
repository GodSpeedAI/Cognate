# Current status

**Status revision:** 32

**Stage:** CEP/world_ref migration Stage 5: GovernedOperation choke point in @cognate/runtime-bun; DomainForge 0.19.0 pinned

**Summary:** Every consequential runtime decision (14 action sites in service/executor plus kernel capability invocation) now passes through one Governor (packages/runtime-bun/src/governed-operation.ts). Modes are sea-forge and off only. In sea-forge mode an injected GovernanceAuthority decides against a validated immutable world_ref and local policy must also allow (authority is not capability); only disposition allow proceeds, and deny/escalate/unknown/constrained_allow/boundary/degraded, authority errors and unrecognized dispositions all refuse. Misconfiguration fails at createRuntime. The default remains off until the SEA-Forge CEP authority loop is wired (Stage 6). @godspeedai/domainforge is pinned to 0.19.0 (revision 31).

**Verified:**
- bun test packages/runtime-bun: 70 pass, 0 fail (10 new in governed-operation.test.ts, including a structural test that no source outside governed-operation.ts calls local policy)
- tsc -p tsconfig.json exit 0
- Full bun test: 948 pass, 77 fail, identical 77 failures on the pre-change baseline (938 pass, 77 fail)

**Limits:**
- Governance default is off; sea-forge mode has no real authority implementation until Stage 6
- constrained_allow, boundary and degraded are refused, not honored, until constraint handling exists
- escalate is refused; durable continuation on escalation is Stage 7
- 77 pre-existing failing tests in the full suite (AG-UI interop, E2E, J-* journeys) are unchanged and not investigated here

**Next:** Stage 6: implement GovernanceAuthority as the CEP authority_request/authority_decision loop against SEA-Forge

**Evidence:**
- .agents/evidence/2026-10-05-governed-operation-stage5.md
