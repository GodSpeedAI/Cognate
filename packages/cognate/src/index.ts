// @godspeedai/cognate — the SDK's convenience entrypoint (spec §25/§31 public surface).
//
// Re-exports the reference runtime and the headless client so a consumer can
// start with one dependency. This package owns no implementation: every export
// is a re-export, so versioning, tree-shaking, and behavior stay with the
// owning `@godspeedai/cognate-*` package. Heavier adapters (cognitive backends,
// RealityTrace, DomainForge, protocol transports, React bindings) are
// deliberate opt-ins and are intentionally NOT re-exported here.
//
// Subpaths:
//   `@godspeedai/cognate`         — curated start-here surface (this module)
//   `@godspeedai/cognate/runtime` — the full reference runtime (`@godspeedai/cognate-runtime-bun`)
//   `@godspeedai/cognate/client`  — the full headless client (`@godspeedai/cognate-client`)

export { createRuntime } from "@godspeedai/cognate-runtime-bun";
export type { CognitionOptions, RuntimeOptions } from "@godspeedai/cognate-runtime-bun";
export { createClient } from "@godspeedai/cognate-client";
export type { CognateClient, ClientOptions, RunState, ThreadSharedState } from "@godspeedai/cognate-client";
export type { AgentDefinition, Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
