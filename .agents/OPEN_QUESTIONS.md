# Open questions

1. **Exact dependency tuple.** Which releases of Cordis, DomainForge, Connect/protobuf/codegen, and RuVector pass the Phase 0 Bun fixtures? The spec names candidates, not a validated matrix (spec §§6, 37–39). Keep package creation and version claims conditional on observed runs.
2. **Cordis lifecycle fit.** Does the pinned prerelease satisfy activation, dependency loss, partial setup rollback, and reverse disposal under Bun? If not, revise the engine behind the framework-owned kernel API (spec §37, Phase 0).
3. **Complete acceptance projection.** The candidate ledger covers the first Phase 0 gates only. The remaining spec requirements and architectural criteria need acceptance contracts, independent criticism, and a freeze decision before downstream implementation can claim settlement.
4. **Optional adapter support.** RVF, SONA, SemanticPack, AG-UI, and RealityTrace delivery each require their named compatibility/behavior fixtures before release (spec §37). Their absence does not block a minimal kernel/event runtime.
