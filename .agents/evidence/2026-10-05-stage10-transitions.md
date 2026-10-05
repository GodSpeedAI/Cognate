# Stage 10 — world transitions, Cognate side (2026-10-05)

SEA-Forge half and the rules: sea-rs `.agents/specs/cep-world-ref-migration.spec.md` § Stage 10 and `.agents/reports/cep-world-migration/stage10-settlement.md`.

## What Cognate gained
- `buildTransitionRequest` and `SeaForgeAuthority.requestWorldTransition`: an `authority_request` pinned to the SOURCE world, `operation_kind: world_transition`, `resource_id` = the TARGET world (so an approval is for one move), claim in `extensions["godspeed.world_transition"]`.
- `SeaForgeAuthority.listTransitions`: reads SEA-Forge's recorded moves; malformed rows are dropped, failure is an empty list.
- Cognate never selects a world. An allow only means SEA-Forge recorded the move; the runtime's pinned world changes by reconfiguration.

## Results
- `bun run typecheck`: clean. `just verify`: 78/78.
- `bun test packages/runtime-bun/test/sea-forge-authority.test.ts`: 14 pass, 2 skipped without `CEP_REPO`; 16 pass with it (cep's validator accepts a transition request).
- Live against the real `sea-forge-server` with world refs from the real `domainforge` CLI: `sea-forge-live.test.ts` 12 pass (3 new: a meaning-preserving move is allowed, a semantic change escalates, the requester cannot approve, an operator can, the approved retry is allowed, both moves read back; an unregistered target is refused).
- `just sea-forge-live` (live + RealityTrace settlement + unit): 33 pass, 0 fail.

## Not verified
- Nothing moves Cognate's pinned world, in-flight runs or continuations. They stay in the old world, which remains valid.
- Compatibility is the sender's claim unless the two semantic closures are equal.
