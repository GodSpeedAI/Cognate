# packages

## Overview

The root `package.json` declares the private workspace `cognate-workspace`, whose `workspaces` glob includes `packages/*`, so every directory here is an independently named `@godspeedai/*` package at version `0.8.0` `[package.json:workspaces]`. Each child holds a `package.json` manifest whose `exports` map names the entry module, plus a `src/` implementation tree. Children are linked below only where a child `EGM.md` exists on disk at the time of writing; the remainder are named unlinked at the end of the list.

## Subdirectories & Boundaries

- a2a: [./a2a/EGM.md](./a2a/EGM.md) — A2A adapter publishing a runtime agent, with continuations as input-required tasks
- ag-ui: [./ag-ui/EGM.md](./ag-ui/EGM.md) — AG-UI 1.0.0 event projection, inbound action routing, and the SSE endpoint
- agent-discovery: [./agent-discovery/EGM.md](./agent-discovery/EGM.md) — read-only agent CLI, configuration, skill, extension, and hook discovery with provenance
- artifacts: [./artifacts/EGM.md](./artifacts/EGM.md) — durable content-hashed artifacts with access policy, retention, and tombstones
- capabilities: [./capabilities/EGM.md](./capabilities/EGM.md) — two-phase capability selection: deterministic eligibility, then contained adaptive ranking
- cli: [./cli/EGM.md](./cli/EGM.md) — `cognate create` starter generation and `cognate dev` runtime server
- client: [./client/EGM.md](./client/EGM.md) — the headless client: runs, reconnecting subscriptions, derived state, continuations, artifacts
- cognitive-api: [./cognitive-api/EGM.md](./cognitive-api/EGM.md) — the dependency-free `CognitiveIndex` contract, retrieval pipeline, and conformance kit
- cognitive-ruvector: [./cognitive-ruvector/EGM.md](./cognitive-ruvector/EGM.md) — the RuVector-backed reference cognitive index
- continuations: [./continuations/EGM.md](./continuations/EGM.md) — durable continuations and external commitments on the durable store
- events: [./events/EGM.md](./events/EGM.md) — event envelope, `DurableStore` port, and the store conformance kit
- execution-ssh: [./execution-ssh/EGM.md](./execution-ssh/EGM.md) — an SSH host as an execution world over SFTP and remote `exec`
- hook-interoperability: [./hook-interoperability/EGM.md](./hook-interoperability/EGM.md) — hook IR, CLI lifecycle adapters, and governed dispatch
- mcp: [./mcp/EGM.md](./mcp/EGM.md) — runtime capabilities exposed as MCP tools through the runtime's authorization path
- projections: [./projections/EGM.md](./projections/EGM.md) — checkpointed, idempotent, rebuildable projections over the durable event log
- protocol-connect: [./protocol-connect/EGM.md](./protocol-connect/EGM.md) and [./protocol-connect-bun/EGM.md](./protocol-connect-bun/EGM.md) — `RuntimeService` mapped onto the generated Connect service, and that service served on `Bun.serve`
- provider-anthropic-compatible: [./provider-anthropic-compatible/EGM.md](./provider-anthropic-compatible/EGM.md) — Anthropic Messages compatible model provider with SSE streaming
- provider-local: [./provider-local/EGM.md](./provider-local/EGM.md) — the deterministic rule-scripted offline model provider
- provider-openai-oauth: [./provider-openai-oauth/EGM.md](./provider-openai-oauth/EGM.md) — Sign in with ChatGPT credential adapter and governed subscription inference
- provider-typesafe: [./provider-typesafe/EGM.md](./provider-typesafe/EGM.md) — the native TypeSafe/System One typed decision provider with rankers
- react: [./react/EGM.md](./react/EGM.md) — React 19 bindings over the headless client
- runtime-api: [./runtime-api/EGM.md](./runtime-api/EGM.md) — the transport-independent `RuntimeService` contract and service conformance kit
- store-memory: [./store-memory/EGM.md](./store-memory/EGM.md) — in-memory `DurableStore` with SQLite-equivalent semantics
- store-sqlite: [./store-sqlite/EGM.md](./store-sqlite/EGM.md) — the authoritative `DurableStore` on `bun:sqlite`
- cognate: [./cognate/EGM.md](./cognate/EGM.md) — the SDK umbrella re-exporting the framework surface
- cognitive-memory: [./cognitive-memory/EGM.md](./cognitive-memory/EGM.md) — cognition memory plane
- cognitive-rvf: [./cognitive-rvf/EGM.md](./cognitive-rvf/EGM.md) — RVF-backed cognitive index
- domainforge: [./domainforge/EGM.md](./domainforge/EGM.md) — the pinned DomainForge `.sea` binding
- execution: [./execution/EGM.md](./execution/EGM.md) — the `ExecutionProvider` contract and local providers
- execution-wsl: [./execution-wsl/EGM.md](./execution-wsl/EGM.md) — the WSL execution provider
- kernel-api: [./kernel-api/EGM.md](./kernel-api/EGM.md) — the kernel port, policy, and compatibility contracts
- kernel-cordis: [./kernel-cordis/EGM.md](./kernel-cordis/EGM.md) — the Cordis-backed kernel implementation
- profile: [./profile/EGM.md](./profile/EGM.md) — the application profile contract
- proto: [./proto/EGM.md](./proto/EGM.md) — protobuf bindings generated from the canonical schemas
- provider-auth: [./provider-auth/EGM.md](./provider-auth/EGM.md) — provider credential and auth contracts
- provider-openai-compatible: [./provider-openai-compatible/EGM.md](./provider-openai-compatible/EGM.md) — OpenAI-compatible chat provider
- provider-openai-responses: [./provider-openai-responses/EGM.md](./provider-openai-responses/EGM.md) — OpenAI Responses API provider
- provider-wire: [./provider-wire/EGM.md](./provider-wire/EGM.md) — shared provider wire and SSE plumbing
- realitytrace: [./realitytrace/EGM.md](./realitytrace/EGM.md) — the optional RealityTrace evidence adapter
- runtime-bun: [./runtime-bun/EGM.md](./runtime-bun/EGM.md) — the reference Bun runtime implementing `RuntimeService`
- store-postgres: [./store-postgres/EGM.md](./store-postgres/EGM.md) — the PostgreSQL `DurableStore`
- ui-astryx: [./ui-astryx/EGM.md](./ui-astryx/EGM.md) — the Astryx presentation components

## Global Invariants

- Cross-package dependencies resolve through the `workspaces` glob (`packages/*`, `profiles/*`, `tests/e2e`, and two validation reconstructions), not the registry `[package.json:workspaces]`
- Dependency direction and third-party isolation are enforced mechanically: contract packages may not depend on engines or UI surfaces, and each third-party engine has exactly one owning adapter `[tests/architecture/dependencies.test.ts:FORBIDDEN, tests/architecture/dependencies.test.ts:OWNERS]`

## Global Side Effects

- None at workspace level; disk, network, and process effects are declared by each unit's own contract

## Verification

- Run: `bun run verify` (`bun run check` then `bun run test` over the compatibility fixture, `./tests`, `./packages`, and `./profiles`) `[package.json:scripts]`

