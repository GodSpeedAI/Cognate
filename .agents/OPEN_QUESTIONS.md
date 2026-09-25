# Open questions

1. **Dependency upgrades.** The pinned DomainForge 0.16.0 binding and other Phase 0 candidates have recorded fixture results. Which later releases preserve those results, especially DomainForge diagnostic messages (DEBT-002)? Re-run each named fixture and adapter gate before changing its pin (spec §§6, 37–39).
2. **Cordis lifecycle fit.** Does the pinned prerelease satisfy activation, dependency loss, partial setup rollback, and reverse disposal under Bun? If not, revise the engine behind the framework-owned kernel API (spec §37, Phase 0).
3. **Complete acceptance projection.** The candidate ledger covers the first Phase 0 gates only. The remaining spec requirements and architectural criteria need acceptance contracts, independent criticism, and a freeze decision before downstream implementation can claim settlement.
4. **Optional adapter support.** RVF and AG-UI have implemented gates; SONA, SemanticPack, and RealityTrace's structured correlation round-trip still need their named compatibility/behavior proof before a release claims those features (spec §37; DEBT-008, DEBT-009). Their absence does not block a minimal kernel/event runtime.
