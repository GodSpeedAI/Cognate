# @godspeedai/cognate

Convenience umbrella over `@godspeedai/cognate-runtime-bun` and
`@godspeedai/cognate-client`. Never add implementation here; add stable
re-exports only, and keep the heavy adapters (cognitive backends,
RealityTrace, DomainForge, transports, React) out of this dependency graph.
`test/cognate.test.ts` guards the documented surface.
