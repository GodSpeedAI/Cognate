# Implementation route

The [specification](../specs/software-design-spec-cognate.-frameworkmd) owns behavior. This route sequences work without making untested dependencies into facts.

1. **Phase 0:** Run `just verify` for the local substrate and Bun SQLite fixture. Add the remaining real dependency fixtures under `compatibility/phase0/`, one per selected version tuple. Record exact versions, commands, outputs, and limitations in `.agents/evidence/`. Use `just gate-ak-*` for the current candidate obligations. Resolve the material questions in `OPEN_QUESTIONS.md` with evidence.
2. **Candidate convergence:** Extend `requirements/ledger.yaml` across the spec, add honest acceptance gates and an external-surface structural E2E, and conduct independent source/semantic/contradiction/evasion/proof criticism. Freeze only after all formation checks pass. There is no freeze or Wayfinder now.
3. **Phase 1:** Create `kernel-api` and its Cordis adapter only after the engine fixture passes. Prove dynamic activation, dependency loss, cleanup, scope isolation, and concurrent disposal through public contracts.
4. **Phases 2–3:** Add event contracts, memory/SQLite stores, replay, continuations, and outbox. Verify authoritative state survives restart and derived state can be rebuilt.
5. **Phases 4–5:** Add versioned protobuf and Connect transport; then DomainForge projection and optional RealityTrace delivery. Use real boundary fixtures, including reconnect, correlation, duplicate delivery, and failed delivery state.
6. **Phases 6–7:** Add cognitive API and memory implementation, then gated RuVector and optional RVF. Keep retrieval and adaptation subordinate to policy and SQLite truth.
7. **Phases 8–10:** Add headless client, React/Astryx, AG-UI, profiles, CLI, starter, examples, and the full user journey. Update the README availability claims only when the corresponding commands actually run.

Create packages only when they have a working contract and a proof home. `just verify` is the current baseline; it is not the future full-product acceptance command.
