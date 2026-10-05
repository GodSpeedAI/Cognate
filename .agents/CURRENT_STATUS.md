# Current status

**Status revision:** 33

**Stage:** CEP/world_ref migration Stage 6: Cognate <-> SEA-Forge CEP authority loop (SeaForgeAuthority, constraint enforcers)

**Summary:** SeaForgeAuthority (packages/runtime-bun/src/sea-forge-authority.ts) implements GovernanceAuthority over SEA-Forge's Unix-socket authority_request verb: it builds a CEP authority_request for each GovernedOperation and accepts only a decision envelope that is demonstrably for this request and this world (kind, profile, world_ref, request_ref, operation_id, lineage, known disposition, constraints and basis present for constrained dispositions); any transport or validation defect is unknown and is refused. The Governor now honors boundary/constrained_allow/degraded only when every constraint (and, for degraded, every compensating control) has a registered enforcer that reports it enforced; none are registered by default. Verified live against a real sea-forge-server with the world pinned by the real DomainForge CLI.

**Verified:**
- bun test packages/runtime-bun: 88 tests, 0 fail, 8 skipped only when SEA_FORGE_SERVER_BIN/CEP_REPO are unset; with both set: 86 pass 0 fail (live loop 5, CEP profile conformance 1)
- tsc -p tsconfig.json exit 0; just verify 78/78
- Live loop: DomainForge CLI world_ref equals the world SEA-Forge registered independently; real policy allowed an action, escalated a capability (provider never ran); unregistered world and unreachable SEA-Forge both refused; decisions committed to the cell ledger
- Cognate-built authority_request validates under the cep repo's own validator for action and capability operations

**Limits:**
- Default governance is still off; production wiring (host config choosing sea-forge mode, socket path, world) is not yet set in the harness profile
- No enforcers are registered, so boundary/degraded decisions are refused in practice; timeout_secs is the obvious first enforcer
- Evaluated actor is the verified service identity; per-end-user policy is not expressible (engine rules key on role and operation kind)
- The live loop tests are skipped unless SEA_FORGE_SERVER_BIN is set; a skip is not a pass
- escalate is refused; durable continuation is Stage 7
- Full-suite baseline of 77 pre-existing failures is unchanged

**Next:** Stage 7: escalation and durable continuation (escalate -> approval -> revalidated resume)

**Evidence:**
- .agents/evidence/2026-10-05-cep-authority-loop-stage6.md
