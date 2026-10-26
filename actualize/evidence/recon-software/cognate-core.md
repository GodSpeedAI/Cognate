# Cognate core: software reconnaissance (commit dd13c84)

Scope: read-only recon of `/home/sprime01/projects/cognate` at HEAD `dd13c84` (branch `main`). No files were modified except this output file. No git fetch/pull/reset was run.

Citation key:
- `path:line` = read in source at dd13c84 (GitHub: `https://github.com/GodSpeedAI/Cognate/blob/dd13c84/<path>#L<line>`; remote is `origin https://github.com/GodSpeedAI/Cognate.git`).
- `test:<command> exit=N` = command was run in this session.
- `npm view` = registry query run in this session.
- "read, not run" = read only.

Grade key used in Proposed claims: VERIFIED = run in this session; OBSERVED = read in source (not run); REPORTED = only stated in README/docs.

---

## 1. Package inventory (`packages/`)

46 packages, all `private: false`, all at version `0.5.0` in `package.json` (sample: `packages/cli/package.json` version field). All 46 names resolve on npm at `0.5.0` (`npm view <name> version`, run for every package, all returned `0.5.0`; no failures). Root package `cognate-workspace` is `private: true`, version `0.0.0` (`package.json:3`).

| Dir | npm name | One-line purpose (source header or export) | Source |
|---|---|---|---|
| a2a | @godspeedai/cognate-a2a | Publishes a runtime agent as an A2A (`@a2a-js/sdk`) endpoint | a2a/src/index.ts:1 |
| ag-ui | @godspeedai/cognate-ag-ui | AG-UI 1.0.0 interop adapter; projects durable events to AG-UI events | ag-ui/src/index.ts:1-2 |
| agent-discovery | @godspeedai/cognate-agent-discovery | Passive inspection of agent environment (no subprocesses, no network) | agent-discovery/src/index.ts:1-3 |
| artifacts | @godspeedai/cognate-artifacts | Content-addressed artifact service (bytes written before record) | artifacts/src/index.ts (service header) |
| capabilities | @godspeedai/cognate-capabilities | Judgment/model contracts, candidate selector, outcome ranker | capabilities/src/selector.ts:22, judgment.ts:28, model.ts:89 |
| cli | @godspeedai/cognate-cli | `cognate create` (scaffold from profile) and `cognate dev` (run app) | cli/src/bin.ts:2 |
| client | @godspeedai/cognate-client | Headless client over runtime service; reconnect from cursor | client/src/index.ts:1 |
| cognate | @godspeedai/cognate | SDK convenience entrypoint (re-exports) | cognate/src/index.ts:1 |
| cognitive-api | @godspeedai/cognate-cognitive-api | Cognitive index API (indexer, retrieval, fallback) | packages/cognitive-api/test/*.test.ts names; no header comment |
| cognitive-memory | @godspeedai/cognate-cognitive-memory | In-memory cognitive index, cosine similarity | cognitive-memory/src/index.ts:26 |
| cognitive-ruvector | @godspeedai/cognate-cognitive-ruvector | RuVector-backed index; similarity accelerator only | cognitive-ruvector/src/index.ts:6-7 |
| cognitive-rvf | @godspeedai/cognate-cognitive-rvf | RVF-backed portable index with Cognate-owned manifest | cognitive-rvf/src/index.ts:9-10 |
| continuations | @godspeedai/cognate-continuations | Durable suspension/resume records, commitments | continuations/src/continuations.ts:37, types.ts:4 |
| domainforge | @godspeedai/cognate-domainforge | Adapter from DomainForge `.sea` model to semantic objects and bindings | domainforge/src/index.ts:20 |
| events | @godspeedai/cognate-events | Durable event store contracts, outbox dispatcher | events/src/types.ts:164, dispatcher.ts:42 |
| execution | @godspeedai/cognate-execution | Execution-world contracts (no transport types) | execution/src/index.ts:1 |
| execution-ssh | @godspeedai/cognate-execution-ssh | SSH host as execution world (SFTP + exec); refuses unverified host keys | execution-ssh/src/index.ts:1, hostKeys |
| execution-wsl | @godspeedai/cognate-execution-wsl | WSL distribution as execution world | execution-wsl/src/index.ts:1 |
| hook-interoperability | @godspeedai/cognate-hook-interoperability | Hook IR; discovery is inert (no shell, no fetch) | hook-interoperability/src/index.ts:1-3 |
| kernel-api | @godspeedai/cognate-kernel-api | Kernel contracts: capability, requirement, component, scope, policy | kernel-api/src/types.ts:31-233 |
| kernel-cordis | @godspeedai/cognate-kernel-cordis | Kernel implementation over Cordis (registry, leases, fibers, scopes) | kernel-cordis/src/index.ts:1 |
| mcp | @godspeedai/cognate-mcp | Runtime capabilities exposed as MCP tools, authorized per caller | mcp/src/index.ts:1 |
| profile | @godspeedai/cognate-profile | Named selections of component factories (composition) | profile/src/index.ts:1 |
| projections | @godspeedai/cognate-projections | Projection (read-model) runtime | no header; test: projections/test/projections.test.ts |
| proto | @godspeedai/cognate-proto | Generated TS bindings from `proto/` (never hand-edited) | proto/src/index.ts:1 |
| protocol-connect | @godspeedai/cognate-protocol-connect | Maps RuntimeService onto Connect | protocol-connect/src/index.ts:1 |
| protocol-connect-bun | @godspeedai/cognate-protocol-connect-bun | Serves RuntimeService on Bun.serve with auth and limits | protocol-connect-bun/src/index.ts:1 |
| provider-anthropic-compatible | @godspeedai/cognate-provider-anthropic-compatible | Anthropic-compatible model provider | no header; test anthropic.test.ts |
| provider-auth | @godspeedai/cognate-provider-auth | Credential leasing contract (never persisted into events/logs) | provider-auth/src/index.ts:1-3 |
| provider-local | @godspeedai/cognate-provider-local | Local deterministic (scripted) model provider | provider-local/src/index.ts:4 |
| provider-openai-compatible | @godspeedai/cognate-provider-openai-compatible | OpenAI-compatible provider (id `openai-compatible:<id>`) | provider-openai-compatible/src/index.ts:6 |
| provider-openai-oauth | @godspeedai/cognate-provider-openai-oauth | OpenAI provider via OAuth session | no header; test oauth.test.ts |
| provider-openai-responses | @godspeedai/cognate-provider-openai-responses | OpenAI Responses API provider | provider-openai-responses/src/index.ts:12 |
| provider-typesafe | @godspeedai/cognate-provider-typesafe | Typesafe provider (judgment, ranker) | provider-typesafe/src/index.ts:7 |
| provider-wire | @godspeedai/cognate-provider-wire | Shared provider wire layer (no upstream error echo) | provider-wire/src/index.ts:9 |
| react | @godspeedai/cognate-react | React 19 hooks over headless client | react/src/index.tsx:1 |
| realitytrace | @godspeedai/cognate-realitytrace | Adapter for RealityTrace (SXR) observations and evidence envelopes | realitytrace/src/index.ts:11, godspeed.ts:41 |
| runtime-api | @godspeedai/cognate-runtime-api | Transport-independent RuntimeService and types | runtime-api/src/types.ts:53 (RunContext) |
| runtime-bun | @godspeedai/cognate-runtime-bun | Bun-native runtime (`createRuntime`) | runtime-bun/src/runtime.ts (createRuntime at runtime-bun/src/index.ts:111) |
| store-memory | @godspeedai/cognate-store-memory | In-memory DurableStore with SQLite semantics | store-memory/src/index.ts:109 |
| store-postgres | @godspeedai/cognate-store-postgres | PostgreSQL DurableStore (multi-process) | store-postgres/src/index.ts:1 |
| store-sqlite | @godspeedai/cognate-store-sqlite | bun:sqlite DurableStore (single-process writer) | store-sqlite/src/index.ts:1 |
| ui-astryx | @godspeedai/cognate-ui-astryx | Reference Astryx UI surfaces over react package | ui-astryx/src/index.tsx:1 |

Caveat: "npm published" was checked by name and version only. Tarball contents were not inspected.

---

## 2. Component / capability model

Key types and functions:

- Capability contract: `packages/kernel-api/src/types.ts:31-39` (`CapabilityContract` with `id`, `version` MAJOR.MINOR.PATCH, `attributes`, `semanticRef`).
- Requirement: `packages/kernel-api/src/types.ts:41-46` (`capability`, optional `version`, optional `attributes`).
- Compatibility: `packages/kernel-api/src/compat.ts:13-20` (`isCompatible`: same id, same major, provider minor/patch >= required).
- Component (declares `requires`, `provides`, `activate`): `packages/kernel-api/src/types.ts:167-176`.
- Scope (child scopes may narrow, never gain, principal): `packages/kernel-api/src/types.ts:193-208`.
- Registry resolution (first eligible publication, self then ancestor scopes): `packages/kernel-cordis/src/registry.ts:50-56` (`find`).
- Undeclared-capability guard: `packages/kernel-cordis/src/fiber.ts:381`.
- Binding a semantic model to a capability: `packages/domainforge/src/types.ts:65-68` (`CapabilityBinding` with `semanticId` and `capability`).
- Authorization types: `packages/kernel-api/src/types.ts:69-88` (`AuthorizationRequest`, `PolicyDecision`, `Policy`; comment "The default is deny (spec §32)").
- Default-deny policy helpers: `packages/kernel-api/src/policy.ts:4` (`denyAll`), `:24` (`allowCapabilities`).
- Invocation path (authorize, emit, then run handler): `packages/kernel-cordis/src/lease.ts:44-75`; authorize call at `:66`, invocation event at `:67`, denied return at `:68`.
- Runtime-level action policy (default deny): `packages/runtime-bun/src/index.ts:15-16`.

Excerpts (each under 20 lines):

Declaring a capability contract (`packages/kernel-api/src/types.ts:31-39`):
```ts
/** A capability contract a provider publishes (spec §8.2). */
export interface CapabilityContract {
  /** Stable capability identity, e.g. `customer.read`. */
  readonly id: string;
  /** Semantic version of the contract, `MAJOR.MINOR.PATCH`. */
  readonly version: string;
  readonly attributes?: Attributes;
  readonly semanticRef?: SemanticRef;
}
```

Implementing a provider / component (`examples/mcp/index.ts:15-21`, read; run via `example:mcp`):
```ts
const runtime = await createRuntime({
  store: ":memory:",
  policy: { authorize: (r) => (r.actor.id === "mallory" ? { allow: false, policyId: "p", reason: "denied" } : { allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
  agents: [],
  components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0" }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0" }, (i) => ({ total: (i as { amount: number }).amount * 2 })) }],
});
```

Binding / composing into an app (`packages/domainforge/src/types.ts:65-68` for the binding shape; app-level composition in `templates/starter/copilot/cognate.config.ts:1-6`):
```ts
export interface CapabilityBinding {
  /** SemanticRef id the application binds, e.g. `billing::Refund`. */
  readonly semanticId: string;
  readonly capability: Omit<CapabilityContract, "semanticRef">;
}
```
```ts
import type { CognateConfig } from "@godspeedai/cognate-cli";
export default {
  profile: "copilot",
  instructions: "You are a small starter assistant. Be concise and helpful.",
} satisfies CognateConfig;
```

Invoking at runtime (`packages/kernel-cordis/src/lease.ts:56-68`, read):
```ts
  const request: AuthorizationRequest = {
    operation: "invoke",
    actor: context.actor,
    tenant: callerTenant,
    scopeId: provider.scopeId,
    capability: provider.contract,
    providerId: provider.providerId,
    correlationId: context.correlationId,
  };
  const decision = await policy.authorize(request);
  emit({ type: "invocation", capability: provider.contract.id, providerId: provider.providerId, correlationId: context.correlationId, decision });
  if (!decision.allow) return { ok: false, failure: { kind: "denied", decision } };
```

Verification of the component path: `examples/mcp` ran end to end (see section 3 and gate table). The mcp example prints `ok: MCP client listed [billing_quote] and invoked billing_quote through runtime policy -> total 42`.

Observed caveat: the `Component` interface has `requires` and `provides`, but the mcp example only uses `provides` (`examples/mcp/index.ts:20`). The `requires` path was not exercised in this recon.

---

## 3. Runtime concepts

| Concept | Implementation | Test that exercises it | Run? |
|---|---|---|---|
| Durable events / log | `packages/events/src/types.ts:7` (`NewEvent`), `:164` (`DurableStore`); SQLite impl `packages/store-sqlite/src/index.ts:1` | `packages/events/test/envelope.test.ts`, `packages/store-sqlite` conformance (`storeConformance`, `events/src/conformance.ts:28`); `tests/integration/append-only.test.ts` | read, not run |
| Outbox delivery | `packages/events/src/types.ts:65-83` (`OutboxIntent`, `OutboxItem`, lease); `packages/events/src/dispatcher.ts:42` (`OutboxDispatcher`) | `packages/events/test/outbox-dispatcher.test.ts` | read, not run |
| Continuations (durable suspension) | `packages/continuations/src/continuations.ts:37` (`ContinuationService`), `:59` `open`, `:128` `resume`, `:176` `cancel`, `:256` `expireDue`, `:304` `dispatchResumes`; status set at `continuations/src/types.ts:4` | `packages/continuations/test/lifecycle.test.ts`, `packages/continuations/test/commitments.test.ts`, `tests/integration/continuation-restart.test.ts` | read, not run |
| Waiting on continuation in a run | `packages/runtime-api/src/types.ts:53` (`RunContext.waitFor`) | `examples/human-approval` (see below) | example run: exit 0 |
| Human approval / authority | Governance escalation in executor: `packages/runtime-bun/src/executor.ts:164-195` (`run.governance.escalated` at `:186`, approval gate at `:190-195`); authority interface `packages/runtime-bun/src/sea-forge-authority.ts` | `packages/runtime-bun/test/governance-escalation.test.ts`, `packages/runtime-bun/test/governed-operation.test.ts`; `packages/kernel-cordis/test/authority.test.ts` | VERIFIED: `bun test` on governance-escalation + kernel-cordis authority, exit 0, 12 pass |
| Recoverability (restart / recovery) | Recovery epoch and reconciliation: `packages/runtime-bun/src/runtime.ts:146-150`, `:219-230`; delivery admission reused by recovery: `packages/runtime-bun/src/execution-slots.ts:1` | `packages/runtime-bun/test/shutdown-recovery.test.ts`, `tests/integration/crash.test.ts`, `tests/integration/continuation-restart.test.ts` | read, not run |
| Evidence / traces | RealityTrace envelopes: `packages/realitytrace/src/godspeed.ts:41` (`executionTraceEnvelope`), `:93` (`evidencePacketEnvelope`); evidence receipt type `packages/runtime-bun/src/sea-forge-authority.ts:259`; policy text "receipt is not evidence": `docs/evidence.md:11` | `packages/realitytrace/test/godspeed.test.ts`, `packages/realitytrace/test/sxr-cli.test.ts`; `examples/realitytrace` | read, not run; example not run |
| Concurrent runs (bounded) | Admission counter: `packages/runtime-bun/src/runtime.ts:43-48`; explicit execution option `packages/runtime-bun/src/index.ts:67-71` (`maxConcurrentRuns`; "defaults to serial compatibility") | `packages/runtime-bun/test/concurrency.test.ts:11` ("bounded independent native runs"), `packages/runtime-bun/test/async-admission.test.ts`, `tests/integration/postgres-multiprocess.test.ts` (needs Postgres) | read, not run |

Example runs (VERIFIED):
- `bun run example:human-approval` exit 0. Output: `ok: run suspended on a human-approval continuation and resumed with output {"amount":75,"approved":true,"status":"refunded"}`. Source: `examples/human-approval/index.ts:13-18` (waitFor), `:39` (resolveContinuation).
- `bun run example:mcp` exit 0. Output: `ok: MCP client listed [billing_quote] and invoked billing_quote through runtime policy -> total 42`.

Test-run evidence (VERIFIED): `bun test packages/runtime-bun/test/governance-escalation.test.ts packages/kernel-cordis/test/authority.test.ts` exit 0; `12 pass, 0 fail`.

Not run: concurrency tests, recovery tests, and Postgres tests. Concurrency and recovery are OBSERVED in source only.

---

## 4. CLI (`packages/cli`)

- Bin: `packages/cli/package.json` `bin: { "cognate": "./src/bin.ts" }`. Published `files` field is `["src"]` only (no `templates/` or `profiles/`).
- Shebang: `packages/cli/src/bin.ts:1` is `#!/usr/bin/env bun`. The bin is TypeScript, so it needs Bun, not Node.
- Commands (`packages/cli/src/bin.ts:53-54`): `create <dir> --profile copilot|harness --source <path> [--with a,b]` and `dev [--port N]`. Usage line comes from the header comment `packages/cli/src/bin.ts:2`.
- `create` requires `--source` (`packages/cli/src/bin.ts:31-35`). It reads `templates/starter` from the source checkout (`packages/cli/src/index.ts:96-97`) and vendors `@godspeedai/*` packages by `bun pm pack` from that checkout (`packages/cli/src/index.ts:3`, `:16`, `:45-71`). The index comment states "packages are not on npm; DEBT-016" (`packages/cli/src/index.ts:3`), which is stale given the npm results in section 1.
- `dev` runs an app directory: loads `cognate.config.ts`, parses `domain/*.sea`, creates the runtime on `.cognate/app.sqlite`, serves `/health`, Connect, AG-UI (`packages/cli/src/index.ts:193` `dev()`; header at `:1`-`:5`).

Commands run (VERIFIED):
- `bun packages/cli/src/bin.ts --help` exit=1. Output: `cognate: usage: cognate create <dir> --profile copilot|harness --source <path> [--with a,b] | cognate dev [--port N]`. There is no `--help` flag; the usage error is the output.
- `bun packages/cli/src/bin.ts dev --help` exit=1. Output: `cognate dev: cognate dev: no cognate.config.ts in /home/sprime01/projects/cognate` (run in repo root, which has no app).

Not run: `npx`/`bunx` invocation from npm. Reason: `bunx @godspeedai/cognate-cli@0.1 create ...` would download and install; it was not run. Observed: because the bin is `.ts` with a bun shebang, `npx` (Node) would not run it without Bun, and `create` cannot find `templates/starter` from the published tarball (`files: ["src"]`). Both are read, not run.

Profiles and templates:
- `profiles/copilot` (README, CHANGELOG, src/index.tsx, test/copilot.test.tsx) and `profiles/harness` (src/index.ts, test/harness.test.ts). Both are workspace packages (root `package.json` workspaces `profiles/*`).
- `templates/starter/{copilot,harness,common}`. Each profile template has `cognate.config.ts` and `package.json`. Common layout is `domain/`, `src/`, `test/`.

---

## 5. Release state

- Root `package.json:3` version `0.0.0`, name `cognate-workspace`, `private: true`. Packages are at `0.5.0` (section 1).
- `.release-please-manifest.json`: every `packages/*` entry at `0.5.0`.
- `release-please-config.json`: `release-type: node`, `initial-version: 0.1.0`, linked-versions plugin group "cognate SDK packages", `bump-minor-pre-major: true`, `include-component-in-tag: true`.
- `packages/cognate/CHANGELOG.md:3` latest entry `0.5.0` (2026-10-15), then `0.4.0` (2026-10-14), `0.3.0` (2026-10-12), `0.2.0` (2026-10-11), `0.1.2` (2026-10-09), `0.1.0` (2026-10-09). Entries are "Miscellaneous Chores: Synchronize cognate SDK packages versions" (read, not run).
- No root `CHANGELOG.md` exists.
- `docs/releases.md:1-3`: "One SDK release, many npm packages". Describes one public GitHub release `vX.Y.Z` from the `packages/cognate` umbrella, with component tags as internal markers and OIDC trusted publishing (read, not run).
- npm `versions` for `@godspeedai/cognate-cli`: `0.0.0-stage, 0.1.0, 0.1.1, 0.1.2, 0.2.0, 0.3.0, 0.4.0, 0.5.0`. `dist-tags.latest` = `0.5.0`. `npm view @godspeedai/cognate-cli@0.1 version` resolves to `0.1.2`.

---

## 6. Verification gates

`just --list` (VERIFIED, exit 0; recipes): `check`, `copilot-up/down`, `harness-up/down`, `db-*` (pg0 PostgreSQL), `docs`, `gate <id>`, `gates`, `remote-workspaces-live`, `sea-forge-live`, `setup`, `setup-openssh`, `setup-realitytrace`, `show-documents`, `status`, `test`, `typecheck`, `verify`.

- `just verify` (`justfile:33-35`, read): runs `check`, `typecheck`, `docs`, then `bun test ./tests/proof-routing.test.ts` and `bun scripts/gate.ts --implemented`. Not run in full.
- `just gates` (`justfile:42-43`, read): `bun scripts/gate.ts --all`. Reports every ledger gate PASS/FAIL and exits non-zero while unmet. Not run.
- Root `package.json` scripts (read): `check`, `test` (`bun test ./compatibility/phase0/sqlite.test.ts ./tests ./packages ./profiles`), `verify`, `typecheck`, 15 `example:*` scripts, `test:e2e` (Playwright).

Runs in this session:
- `bun run typecheck` (`tsc -p tsconfig.json`): exit 0, ~2.8 s.
- `bun test` on two small files: exit 0, 12 pass, 0 fail (section 3).
- `bun run example:mcp`: exit 0. `bun run example:human-approval`: exit 0.

Not run: `just verify`, `just gates`, full `bun run test`, Postgres and live gates, e2e.

---

## 7. Examples (`examples/`)

Each example has one `index.ts`. Run with `bun run example:<name>` (root `package.json` scripts).

| Example | Demonstrates | Run |
|---|---|---|
| ag-ui | Run projected as AG-UI SSE event stream over HTTP | read, not run |
| artifact-workbench | Agent produces durable, content-addressed artifact and reads it back | read, not run |
| autonomous-harness | Reference harness looping model -> tool -> model | read, not run |
| capability-hot-swap | Capability provider replaced live, no downtime for callers | read, not run |
| cognitive-memory | Index facts and recall by semantic similarity | read, not run |
| connect | RuntimeService served and consumed over Connect RPC | read, not run |
| copilot | Support copilot as composition of runtime components | read, not run |
| domainforge | DomainForge model becomes semantic objects, then explicit capability binding | read, not run |
| generative-ui | Agent emits `ui.render` events rendered to HTML | read, not run |
| human-approval | Agent suspends on durable continuation until human resolves it | VERIFIED exit 0 |
| mcp | Runtime capabilities exposed as MCP tools, authorized per caller | VERIFIED exit 0 |
| multi-agent | Parent durably spawns and awaits child run (subagents) | read, not run |
| realitytrace | Committed-outbox observation delivery; receipts recorded, not evidence | read, not run |
| rvf-branching | Branched RVF index diverges from parent | read, not run |
| shared-state | Agent publishes app state the client derives via JSON Patch | read, not run |

Headers: `examples/<name>/index.ts:1-2`. The `examples/README.md` file also exists (read, not run).

---

## 8. Current README.md

Headings (`README.md`, 1541 lines), in order:
Status line at `:5`. Then `# Cognate`, `## Why Cognate?` (`:40`), `## Quick Start` (`:62`), `# What You Can Build` (`:105`), `# One Application, Many Representations` (`:180`), `# Architecture` (`:225`), `# Semantics First` (`:275`), `# Everything Is a Capability` (`:313`), `# Components Are Alive` (`:354`), `# Effects Undo Themselves` (`:392`), `# Not Everything Is Reversible` (`:420`), `# Events Are Truth` (`:458`), `# Cognition Is Not Truth` (`:500`), `# Learning Cannot Grant Authority` (`:553`), `# Portable Cognition with RVF` (`:586`), `# RealityTrace Observations and Evidence` (`:635`), `# Continuations: Work That Is Not Done Yet` (`:676`), `# Agent-Native UI` (`:717`), `# Frontend Capabilities` (`:764`), `# Shared State` (`:787`), `# Artifacts Are First-Class` (`:810`), `# Protocols Are Adapters` (`:851`), `# AG-UI Compatibility` (`:884`), `# Protobuf + Connect` (`:907`), `# Bun Native` (`:929`), `# Any Model` (`:957`), `# Providers Can Be Replaced Live` (`:991`), `# Profiles` (`:1013`), `# Build Your Own Profile` (`:1071`), `# Packages` (`:1098`), `# Built In, Not Locked In` (`:1149`), `# Failure Is Part of the Model` (`:1174`), `# Security` (`:1208`), `# Testing the Substrate` (`:1228`), `# Agent-Friendly by Design` (`:1272`), `# Examples` (`:1302`), `# Cognate vs. an Agent Framework` (`:1333`), `# Cognate vs. a Frontend Agent SDK` (`:1355`), `# Cognate vs. a Memory Framework` (`:1365`), `# Cognate vs. a Workflow Engine` (`:1381`), `# The Design Rule` (`:1389`), `# Documentation` (`:1407`), `# Development` (`:1429`), `# Contributing` (`:1455`), `# Architecture Lineage` (`:1473`), `# Philosophy` (`:1493`), `# License` (`:1539`).

Install and version claims versus package.json:
1. `README.md:5` says the packages are "published on npm under the `@godspeedai/cognate-*` names". VERIFIED true (46/46 at 0.5.0).
2. `README.md:68` quick start: `bunx @godspeedai/cognate-cli@0.1 create my-app --profile copilot --source ./cognate`. STALE: latest is `0.5.0`. The `@0.1` range resolves to `0.1.2`. Pinned to an old line.
3. `README.md:69` says "no Cognate checkout needed to generate an app". CONTRADICTED by `packages/cli/src/bin.ts:31-35` and `packages/cli/src/index.ts:3,16,96-97`: `--source` is required and must be a checkout that contains `templates/starter`. The README's own next paragraph (`:72-74`) says a checkout is needed. Internal inconsistency.
4. `README.md:604` snippet uses `frameworkVersion: "0.0.0"`. Root package is `0.0.0` (`package.json:3`) but published packages are `0.5.0`. Ambiguous; flag for review.
5. `README.md:1100` says every package in the list is published on npm. VERIFIED true for all 46.
6. `README.md:1431-1436` says "Clone Cognate and install with Bun": `bun install`. Not run.
7. `README.md:637` says RealityTrace adapter is "version-pinned (v0.3.0)". Not verified against `packages/realitytrace/package.json`; read, not run.

---

## Proposed claims

| # | Claim (plain language, marketing-safe) | Grade | Source |
|---|---|---|---|
| 1 | Cognate publishes 46 `@godspeedai/cognate-*` packages on npm at version 0.5.0. | VERIFIED | `npm view` for all 46 names; `packages/*/package.json` |
| 2 | Cognate has a single CLI, `cognate`, with `create` and `dev` commands. | VERIFIED | `bun packages/cli/src/bin.ts --help` exit 1 (usage text); `packages/cli/src/bin.ts:53-54` |
| 3 | The CLI is TypeScript run by Bun (`#!/usr/bin/env bun`). | OBSERVED | `packages/cli/src/bin.ts:1`; `packages/cli/package.json` bin |
| 4 | Apps are scaffolded from one of two starter profiles, `copilot` or `harness`. | OBSERVED | `packages/cli/src/bin.ts:27`; `templates/starter/{copilot,harness}` |
| 5 | A capability is a versioned contract (`id`, `version`) that a provider publishes. | OBSERVED | `packages/kernel-api/src/types.ts:31-39` |
| 6 | Consumers declare requirements, and the kernel matches providers by major version and minor compatibility. | OBSERVED | `packages/kernel-api/src/types.ts:41-46`; `packages/kernel-api/src/compat.ts:13-20` |
| 7 | A component declares what it requires and provides, then activates. | OBSERVED | `packages/kernel-api/src/types.ts:167-176` |
| 8 | Every capability invocation goes through a policy check. The default is deny. | OBSERVED | `packages/kernel-cordis/src/lease.ts:66-68`; `packages/kernel-api/src/types.ts:86-88`; `packages/runtime-bun/src/index.ts:15` |
| 9 | A capability can be exposed as an MCP tool, and each caller is authorized per call. | VERIFIED | `bun run example:mcp` exit 0 (`billing_quote` listed and invoked, total 42); `examples/mcp/index.ts:17,20,23` |
| 10 | A running agent can suspend on a durable continuation and resume after a human decides. | VERIFIED | `bun run example:human-approval` exit 0; `examples/human-approval/index.ts:13-18,39` |
| 11 | Continuations are stored and resumed by a service with open, resume, cancel, expire, and dispatch operations. | OBSERVED | `packages/continuations/src/continuations.ts:59,128,176,256,304` |
| 12 | Governance escalation writes an approval gate into the run's event log. | VERIFIED | `packages/runtime-bun/test/governance-escalation.test.ts` pass (`bun test` exit 0, 12 pass with kernel-cordis authority); `packages/runtime-bun/src/executor.ts:186` |
| 13 | Run state is durable events, not in-memory state. | OBSERVED | `packages/events/src/types.ts:7,164`; `packages/store-sqlite/src/index.ts:1` |
| 14 | Events go through a transactional outbox with lease-based delivery and poisoning. | OBSERVED | `packages/events/src/types.ts:65-83`; `packages/events/src/dispatcher.ts:42` |
| 15 | The runtime recovers in-flight work after restart, with reconciliation and fresh intent IDs. | OBSERVED | `packages/runtime-bun/src/runtime.ts:146-150,219-230`; test `packages/runtime-bun/test/shutdown-recovery.test.ts` (not run) |
| 16 | Concurrent runs are bounded by an explicit capacity, defaulting to serial. | OBSERVED | `packages/runtime-bun/src/index.ts:67-71`; `packages/runtime-bun/src/runtime.ts:43-48`; test `packages/runtime-bun/test/concurrency.test.ts:11` (not run) |
| 17 | Evidence is kept separate from delivery receipts: a receipt is not evidence. | REPORTED | `docs/evidence.md:11` (the code path is `packages/realitytrace/src/godspeed.ts:41,93`) |
| 18 | Cognate runs on Bun and uses SQLite by default, with Postgres as an option. | OBSERVED | `packages/store-sqlite/src/index.ts:1`; `packages/store-postgres/src/index.ts:1`; `README.md:` (Bun Native section, `:929`) |
| 19 | Typecheck passes across the workspace. | VERIFIED | `bun run typecheck` exit 0, ~2.8 s |
| 20 | The repo ships 15 runnable examples, each wired to a root `example:*` script. | VERIFIED | root `package.json` scripts (15 `example:` keys); `examples/*/index.ts` |
| 21 | Model providers are pluggable: OpenAI-compatible, OpenAI Responses, Anthropic-compatible, local, and Typesafe. | OBSERVED | `packages/provider-*/src/index.ts`; `packages/provider-*/test/*.test.ts` (not run) |
| 22 | Providers can be replaced at runtime (capability hot swap). | REPORTED | `examples/capability-hot-swap/index.ts` header (not run); `docs/concepts.md` |
| 23 | Provider credentials are leased per request and not written into events or logs. | OBSERVED | `packages/provider-auth/src/index.ts:1-3` |
| 24 | Artifacts are content-addressed: bytes are written before the record. | OBSERVED | `packages/artifacts/src/index.ts` (service header) |
| 25 | An AG-UI 1.0.0 interoperability adapter is included. | OBSERVED | `packages/ag-ui/src/index.ts:1` |
| 26 | Cognate exposes a RuntimeService that can be served over Connect RPC. | OBSERVED | `packages/runtime-api/src/types.ts`; `packages/protocol-connect-bun/src/index.ts:1`; `bun run example:connect` (not run) |
| 27 | React 19 hooks over the headless client are provided. | OBSERVED | `packages/react/src/index.tsx:1` |
| 28 | The package is at v0 and early, and says so. | REPORTED | `README.md:5` ("Status: v0 — published, early") |
| 29 | Every package has its own README and AGENTS guide. | REPORTED | `README.md:1100` (not checked file by file) |
| 30 | Releases use one linked version across the SDK, managed by Release Please. | OBSERVED | `release-please-config.json` (linked-versions plugin); `.release-please-manifest.json` (all `0.5.0`); `docs/releases.md:1-3` |
| 31 | The latest release is 0.5.0, dated 2026-10-15. | OBSERVED | `packages/cognate/CHANGELOG.md:3`; `npm view @godspeedai/cognate-cli version` = `0.5.0` |
| 32 | The shortest path to a running app is `create`, then `bun dev`. | VERIFIED (partial) | `packages/cli/src/bin.ts:53-54`; `packages/cli/src/index.ts:193`; `README.md:62-104` (end-to-end create not run) |
| 33 | Quick-start install command uses `@0.1`, not the current release. | VERIFIED | `README.md:68`; `npm view @godspeedai/cognate-cli@0.1 version` = `0.1.2` |
| 34 | `cognate create` needs a Cognate source checkout today; it is not a standalone `npx` scaffold. | OBSERVED | `packages/cli/src/bin.ts:31-35`; `packages/cli/src/index.ts:3,96-97`; `packages/cli/package.json` `files: ["src"]` |
| 35 | Cognate's own gates (`just verify`, `just gates`) are the regression baseline. | OBSERVED | `justfile:33-35,42-43` (not run) |
| 36 | The repo carries a debt register of known gaps, stated openly. | REPORTED | `README.md:5` (links `.agents/DEBT.md`) |
| 37 | Erasure of some payloads is not yet complete across all derived stores. | REPORTED | `README.md:5` (text: "erasure does not yet reach every der...") |

---

## Unknowns

1. `npx` / `bunx` from npm: whether `@godspeedai/cognate-cli@0.5.0` actually installs and runs as the README describes. Not run. Two risks observed in source: the bin needs Bun, and the published `files` list omits `templates/` so `create` cannot find the starter without `--source`.
2. "Agent-built, agent-operated, agent-extensible" positioning: no code or test in this recon directly evidences the "agent-built" or "agent-operated" claims beyond the examples and MCP exposure. Treat as framing, not proven.
3. `just verify` and `just gates`: pass/fail status of the full ledger. Not run.
4. Full `bun run test` and the Postgres/live gates (`tests/integration/postgres-multiprocess.test.ts`, `just remote-workspaces-live`, `just sea-forge-live`). Not run.
5. Recovery and concurrency behavior under real crash or load. Only source and test names were read.
6. The `requires` side of components (dependency resolution across scopes): only `provides` was exercised by the mcp example.
7. Tarball contents on npm: whether published packages include their README and whether `dist`/`src` are correct. Not checked.
8. The copilot and harness profiles' runtime behavior (`just copilot-up`, `just harness-up`) was not run.
9. DEBT-016 ("packages are not on npm") status: the CLI source comment is stale relative to the registry, but whether the register was updated was not checked.
10. Whether the `frameworkVersion: "0.0.0"` snippet at `README.md:604` is intentional.
11. Whether `packages/cognitive-api`, `projections`, and `provider-anthropic-compatible` have READMEs and exact purposes; these have no source header comment and were classified from test names only.
