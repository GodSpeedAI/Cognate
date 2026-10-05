# Current status

**Status revision:** 37

**Stage:** CEP/world_ref migration Stage 10: world transitions

**Summary:** Cognate can ask SEA-Forge to move work between two immutable semantic worlds and read the recorded moves back. It never picks a world: an allow only means SEA-Forge recorded the move, and a move across a semantic change always needs a human approval.

**Verified:**
- bun run typecheck clean; just verify 78/78
- sea-forge-authority unit tests: 16 pass with CEP_REPO (cep's validator accepts a transition request)
- Live against the real sea-forge-server with DomainForge-derived world refs: sea-forge-live 12 pass; just sea-forge-live 33 pass, 0 fail

**Limits:**
- Nothing moves Cognate's pinned world, in-flight runs or continuations; they stay in the old world
- Compatibility is the sender's claim unless the two semantic closures are equal
- AK-006 flake and the environment-dependent full-suite failures remain uninvestigated

**Next:** Stage 11

**Evidence:**
- .agents/evidence/2026-10-05-stage10-transitions.md
