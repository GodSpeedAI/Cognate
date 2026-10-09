# ADR-0012 — SDK packages publish as `@godspeedai/cognate-<module>`

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
**Status:** Accepted (2026-10-09)

## Context
The SDK's first npm release briefly published the modules as `@godspeedai/<module>` (`@godspeedai/cli`, `@godspeedai/events`, …). Two problems surfaced. First, the `@godspeedai` scope also holds independent GodSpeed products — `@godspeedai/domainforge` is the external DomainForge package our adapter binds, and future products would compete for names with SDK modules. Second, npm identities have exactly two segments: `@godspeedai/cognate/store-memory` is not a package name, only an import subpath of a package named `@godspeedai/cognate`. Separately, `@cognate` — the scope the design spec originally assumed (§27) — is held by an unrelated npm user account and cannot be used for publication, and npm provenance attestations are unavailable from this private repository.

## Decision
Every Cognate-owned SDK module publishes as `@godspeedai/cognate-<module>` — the `cognate-` infix identifies the owning product inside the shared scope. Adapters read as the Cognate integration of an independent technology: `@godspeedai/cognate-domainforge` integrates the external `@godspeedai/domainforge`; `@godspeedai/cognate-realitytrace` integrates RealityTrace. Independent GodSpeed products keep their own names and are never republished by this repository. `@godspeedai/cognate` is an optional re-export-only umbrella (runtime + client + `/runtime`, `/client` subpaths); it adds no implementation. The CLI command stays `cognate` (bin of `@godspeedai/cognate-cli`).

The superseded `@godspeedai/<module>` 0.1.0 packages are deprecated with migration messages, never unpublished. Release Please tracks the new identities as fresh components (`cognate-<module>`) bootstrapped at 0.1.0, with the old tags left as history; publication is gated behind npm trusted publishing (OIDC) and the repository stays private, so packages ship without provenance attestations.

## Consequences
- The design spec's §27 package names (`@cognate/*`) now diverge from the published identities. The spec is a frozen ruler: this ADR is the recorded contract revision, and a future spec pass should adopt the `@godspeedai/cognate-*` names rather than editing history. Historical records (`.agents/` evidence, status history, captured logs) intentionally keep the old scope.
- DEBT-016 narrows: publication and the release process are done; what remains is `cognate create` generating an app from the registry without `--source <checkout>`, and the provenance half of the criterion, which a private repository cannot satisfy (an explicit decision to accept no-provenance is recorded here).
- Consumers typing against the SDK need `@types/bun` and `@types/node` (the packages ship Bun-native TypeScript source).
- Tag names change shape per component (`cognate-cli-v0.1.1`); the superseded `cli-v0.1.0`-style tags remain as historical record and cannot collide.
