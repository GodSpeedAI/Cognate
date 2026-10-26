---
product: Cognate
model_version: 5
---

## Purpose

Cognate is an open-source TypeScript framework and SDK for building agentic applications: a person describes the software they want, a coding agent builds it from Cognate's composable capabilities, AI agents can then work inside the running application under permissions the developer sets, and the application can be extended later by the same agent-driven method. People keep authority over what is accepted and deployed. (Positioning is owner-stated, D3; proof rows are in the ledger.)

## Actors

| id | actor | job |
|---|---|---|
| A1 | Builder-director (may not be a professional developer) | Get a working application by describing it to a coding agent, and stay in control of what it does |
| A2 | Developer using a coding agent (Claude Code, Codex, etc.) | Have the agent build and extend a real app on a structure that keeps it coherent, testable and governed |
| A3 | Coding agent | Know how to model, compose, bind, test and evidence a Cognate app (served by the building-with-cognate skill) |
| A4 | Operational agent (inside a Cognate app) | Do work through permitted capabilities, pause for humans, leave a durable record |
| A5 | Reviewer / operator | Approve consequential actions; accept or reject results on evidence |
| A6 | Maintainer (GodSpeed AI) | Keep README, site and onboarding true to the released SDK |

## Capabilities

| id | capability | claims |
|---|---|---|
| K1 | Composable capabilities: versioned contracts, requirements, components that provide them, scope-resolved and compatibility-checked | C5, C6, C7 |
| K2 | Every capability call is authorized by policy; default deny | C8 |
| K3 | Durable operation: event log, outbox, continuations (pause/resume), restart recovery | C10, C11, C12, C13, C14 |
| K4 | Human approval as a durable pause an agent cannot skip | C10, C15 |
| K5 | One capability, many interfaces: MCP tools, Connect RPC, AG-UI, React | C9, C16, C17, C18 |
| K6 | Replaceable model providers | C19, C20 |
| K7 | Agent-built: building-with-cognate skill guides a coding agent through model → compose → bind → test → evidence | C21, C22 |
| K8 | Scaffold and run an app (`cognate create`, `cognate dev`) | C23, C24, C25, C26 |
| K9 | Exemplar: Cognate-Workbench built on Cognate | C30–C42 |

## Constraints

**Technical**
- Runtime is Bun ≥1.4; CLI bin is TypeScript with a bun shebang, so Node-only `npx` cannot run it (`packages/cli/src/bin.ts:1`; `packages/cli/package.json`).
- `cognate create` requires `--source` pointing at a source checkout; published CLI tarball ships only `src/` (`packages/cli/src/bin.ts:31-35`; onboarding.md step 3).
- Default store SQLite (`.cognate/app.sqlite`); Postgres optional (`packages/store-sqlite/src/index.ts:1`; `packages/store-postgres/src/index.ts:1`).
- The starter app needs no model API key (deterministic local provider) (`packages/cli/src/index.ts:227`; onboarding.md step 10).
- `bunx` may be absent from PATH; `bun x` works (onboarding.md troubleshooting).
- Landing page must be static-deployable and readable without WebGL/JS for essential text (owner brief §9).

**Physical**
- None (software only).

**Legal**
- Cognate is Apache-2.0 (`LICENSE`); Cognate-Workbench is Apache-2.0, same owner GodSpeedAI (`cognate-workbench/LICENSE`); Workbench screenshots usable with attribution (brand-provenance.md D).
- GSAP ships under a no-charge, non-OSI license (`npm view gsap license`); must be recorded by provenance-licensing before shipping.
- No Cognate logo/mark exists; any mark created is new and unscreened (brand-provenance.md A).

## Form and interaction

- Surfaces: npm packages `@godspeedai/cognate-*` (46, 0.5.0); CLI `cognate create|dev`; RuntimeService over Connect (`/cognate.v1.RuntimeService/*`), `/health`, AG-UI; agent skill `.agents/skills/building-with-cognate/` (+ companions `deriving-interaction-domain-models`, `domainforge-sea`).
- Intended adoption route (D4): install SDK from npm; add the building-with-cognate skill (skills.sh listing pending — placeholder; working today: `npx skills add GodSpeedAI/Cognate`, discovery verified).
- Site form (D10, D11): single-page scroll narrative A–H in the assembly-drawing direction; signature exploded view of a real Workbench capture; primary action "Build your first app" (#start); browser demonstrations labelled as demonstrations.
- Exploded view (D12): Workbench as 4 logical layers (Interface, Agents, Capabilities, Durable record) and named parts C-01…C-14 with source anchors; only verified dependency edges drawn; parts list text equivalent; desktop 3D pinned scrub, mobile 2D parts-list redesign, reduced-motion static keyframe.
- Activation (D9): the visitor's coding agent has built a small Cognate app, it runs, and its acceptance check (including a human-approval pause) passes.
- Deliverables of this run: rewritten `README.md`; static narrative site in `landing/`; onboarding in `landing/` + `docs/`.

## Voice

Parent voice: GodSpeed master voice (executive-safe candor with practitioner teeth), Journey mode by default, at most one Speed line per beat, governed/provable/compounding mapped to agent-operated/built/extensible (D14). Plain, not simplistic (outcomes first, mechanisms on request). Calm, not cold (confidence by showing). Candid, not self-deprecating (limits stated plainly). Dry, not jokey (at most one light line per section). Human-first: the person directs; the agent labours. Use: steer, describe, direct, build, capability, part, permission, approve, accept, evidence, record, extend, plug in. Refuse: revolutionary, magic, effortless, autonomous (as a selling point), unleash, supercharge, superpowers, 10x, AI-powered, seamless, cutting-edge, next-gen, "the only", "trusted by". Floor: install, error, permission and security copy is unambiguous first. Samples in artifacts/brand/brand.md.

## Positioning

- Category: the agentic application framework (and SDK) (PROPOSED, D3).
- Alternative used today: a coding agent writing the app from scratch on a general web framework, bolting on LLM calls and tool libraries; each new feature a fresh one-off (PROPOSED; inferred, U6).
- The one difference: the app is assembled from named, permission-checked capabilities with a durable record, so the agents that build it can also work inside it and extend it later without it losing its shape, and people approve what matters (rests on C5, C6, C8, C10, C11, C21).
- Not for: hosted no-code builders, drop-in chatbot widgets, a thin wrapper around one model API, anyone needing a stable 1.0 API today (C4).
- Name: keep "Cognate"; things built with it are named separately and endorsed "built with Cognate".

## Claims ledger

| id | claim | grade | source |
|---|---|---|---|
| C1 | 45 `@godspeedai/cognate-*` packages (43 framework packages + 2 profiles) are published on npm at 0.5.0 | VERIFIED | test:npm view per name @2026-10-15 (cognate-core.md §1); test:node scan of packages/*,profiles/* package.json (45 non-private) |
| C2 | Latest release is 0.5.0 (2026-10-15), one linked version across the SDK | VERIFIED | test:npm view @godspeedai/cognate-cli dist-tags exit 0; packages/cognate/CHANGELOG.md:3 |
| C3 | Cognate is Apache-2.0 open source | OBSERVED | LICENSE |
| C4 | Cognate is v0 and early, and keeps a public debt register | OBSERVED | README.md:5; .agents/DEBT.md |
| C5 | A capability is a versioned contract with a stable id | OBSERVED | packages/kernel-api/src/types.ts:31-39 @dd13c84 |
| C6 | A component declares what it requires and provides; the kernel matches providers by compatible version | OBSERVED | packages/kernel-api/src/types.ts:41-46,167-176; packages/kernel-api/src/compat.ts:13-20 @dd13c84 |
| C7 | Providers are found in the caller's scope, then ancestor scopes; child scopes can narrow but never gain authority | OBSERVED | packages/kernel-cordis/src/registry.ts:50-56; packages/kernel-api/src/types.ts:193-208 @dd13c84 |
| C8 | Every capability invocation is authorized by policy before it runs; the default is deny | OBSERVED | packages/kernel-cordis/src/lease.ts:56-68; packages/kernel-api/src/policy.ts:4 @dd13c84 |
| C9 | A capability exposed as an MCP tool is authorized per caller | VERIFIED | test:bun run example:mcp exit 0 (cognate-core.md §3) |
| C10 | A running agent can pause on a durable human-approval step and resume after a person decides | VERIFIED | test:bun run example:human-approval exit 0; examples/human-approval/index.ts:13-18,39 |
| C11 | Run state is recorded as durable events in a store (SQLite default, Postgres optional) | VERIFIED | onboarding.md step 12 (events table in .cognate/app.sqlite); packages/events/src/types.ts:7,164 |
| C12 | Continuations can be opened, resumed, cancelled and expired as durable records | OBSERVED | packages/continuations/src/continuations.ts:59,128,176,256 @dd13c84 |
| C13 | The runtime recovers in-flight work after a restart | OBSERVED | packages/runtime-bun/src/runtime.ts:146-150,219-230 @dd13c84 (read, not run) |
| C14 | Concurrent runs are bounded by explicit capacity, serial by default | OBSERVED | packages/runtime-bun/src/index.ts:67-71 @dd13c84 |
| C15 | Governance escalation writes an approval gate into the run's event log | VERIFIED | test:bun test packages/runtime-bun/test/governance-escalation.test.ts exit 0 |
| C16 | The RuntimeService can be served over Connect RPC | OBSERVED | packages/protocol-connect-bun/src/index.ts:1; onboarding.md step 8-10 |
| C17 | An AG-UI 1.0 adapter projects durable events to AG-UI | OBSERVED | packages/ag-ui/src/index.ts:1-2 |
| C18 | React hooks over a headless client are provided | OBSERVED | packages/react/src/index.tsx:1 |
| C19 | Model providers are pluggable (OpenAI-compatible, OpenAI Responses, Anthropic-compatible, local) | OBSERVED | packages/provider-*/src/index.ts @dd13c84 |
| C20 | Provider credentials are leased per request and not written to events | OBSERVED | packages/provider-auth/src/index.ts:1-3 |
| C21 | The building-with-cognate skill guides a coding agent to build Cognate apps | OBSERVED | .agents/skills/building-with-cognate/SKILL.md |
| C22 | The skill is discoverable with `npx skills add GodSpeedAI/Cognate --list` | VERIFIED | onboarding.md step 19 exit 0 |
| C23 | `cognate create` scaffolds a copilot or harness app; today it needs a Cognate source checkout via `--source` | VERIFIED | onboarding.md steps 3-4; packages/cli/src/bin.ts:31-35 |
| C24 | A scaffolded app installs, passes its test and serves `/health` and runs with `cognate dev` | VERIFIED | onboarding.md steps 5-8; test:bun test tests/integration/cli-create.test.ts 4 pass |
| C25 | The starter app completes a run with no API key | VERIFIED | onboarding.md step 10 |
| C26 | The documented tutorial StartRun body (`"input":"hello"`) fails; `{"message":"hello"}` works | VERIFIED | onboarding.md steps 9-10; docs/tutorials/start-an-app-from-a-checkout.md:103-106 |
| C27 | README quick start pins `@0.1` and says no checkout is needed | CONTRADICTED | README.md:68-69; packages/cli/src/bin.ts:31-35 + test:npm view (latest 0.5.0) |
| C28 | Several docs say packages are not published | CONTRADICTED | docs/getting-started.md:18; docs/troubleshooting.md:27 vs test:npm view (C1) |
| C29 | The workspace typechecks | VERIFIED | test:bun run typecheck exit 0 |
| C30 | Cognate-Workbench is an Apache-2.0 application built on Cognate SDK packages | OBSERVED | cognate-workbench main@d208cd0:package.json; LICENSE |
| C31 | Workbench is a single Bun process serving a React interface over Connect RPC | OBSERVED | main@d208cd0:src/server.ts:409-442 |
| C32 | Workbench agents pause for human approval before escalated actions and before plans proceed | OBSERVED | main@d208cd0:src/agents/agentCoding.ts:480-482,527-529; src/domain/approvalGate.ts:52-62 |
| C33 | Workbench task contracts state goal, authority, budget and acceptance before work is ready | OBSERVED | main@d208cd0:src/workbench/contract.ts:5,51; test/J-WB-task-contract.test.ts |
| C34 | In Workbench, "the agent finished" is not acceptance; acceptance needs recorded evidence and a review decision | OBSERVED | main@d208cd0:src/capabilities/workbench.ts:195,214-236; screenshots/workbench/e2e-03-contract-complete.png |
| C35 | Workbench keeps session traces as a projection of its event log | OBSERVED | main@d208cd0:src/projections/sessionTrace.ts:78; src/server.ts:256 |
| C36 | Workbench's model provider can be changed in Settings | OBSERVED | main@d208cd0:src/components/providerRegistry.ts:18-27 |
| C37 | Workbench parallelism plans are recorded but do not start workers; budgets are informational | OBSERVED | main@d208cd0:README.md:57-59 |
| C38 | Expert Teams (feature branch): persistent Experts, custom Teams, delegated work, scoped memory, schedules | OBSERVED | feature/expert-teams@fdc709b:src/experts/service.ts:203-213,323,435; src/schedules/evaluator.ts:200-216 |
| C39 | Experts overlap only when capacity >1 is opted into, and only for model-only turns; default is one run at a time | OBSERVED | feature@fdc709b:src/experts/admission.ts:5-6,77-81; test/J-EXPERT-model-parallel.test.ts:55-136 |
| C40 | Expert Teams is not yet merged to Workbench main | OBSERVED | git rev-parse main=d208cd0 vs origin/feature/expert-teams=fdc709b @2026-10-15 |
| C41 | Workbench screenshots in this site are real captures from Workbench's own E2E tests | OBSERVED | main@d208cd0:test/E2E-workbench.test.ts:3; screenshots/workbench/*.png |
| C42 | Workbench defines 23 workbench capabilities and registers 12 projections | OBSERVED | main@d208cd0:src/capabilities/workbench.ts:39-63; src/server.ts:254-266 |

| C43 | A running agent's context can emit, invoke granted capabilities, wait, recall and update state; it has no API to register components or change policy | OBSERVED | packages/runtime-api/src/types.ts:33-71 @dd13c84 |
| C44 | A newcomer's coding agent built a working Cognate app from npm 0.5.0 packages and the building-with-cognate skill, with no source checkout and no API key | VERIFIED | actualize/evidence/experience/first-build-npm-only.md (bun test 6 pass, tsc 0, clean replay 0) |
| C45 | `npx skills add GodSpeedAI/Cognate --skill building-with-cognate ... -a claude-code -y` installs the skills into the project, not globally | VERIFIED | first-build-npm-only.md step 2 (exit 0; global dirs unchanged) |
| C46 | The Refund Desk example: refunds over $50 pause for human approval, approvals survive a restart, history is recorded, and a receipt capability was added as an extension | VERIFIED | test:cd examples/refund-desk && bun test (7 pass) @2026-10-15; actualize/evidence/experience/refund-desk-example.md |
| C47 | The Cognate skills are not yet listed on skills.sh | VERIFIED | https://www.skills.sh/godspeedai/cognate/building-with-cognate@2026-10-15 (soft 404 body) |
| C48 | The DomainForge CLI installs from crates.io with `cargo install domainforge-core --features cli` | VERIFIED | first-build-npm-only.md §U10 (exit 0, domainforge 0.21.1) |

## Unknowns

| id | question | blocks | who can answer |
|---|---|---|---|
| U3 | skills.sh listing date (placeholder URL skills.sh/godspeedai/cognate/building-with-cognate) | onboarding link | owner (Sam Prime) |
| U10 | Will the skill fixes (commit 4e2794f) be merged to the default branch before launch? `npx skills add GodSpeedAI/Cognate` installs from GitHub's default branch | onboarding accuracy | owner |
| U4 | Will Expert Teams be merged before launch? | Workbench beat copy | owner |
| U5 | `just verify` / `just gates` full status at dd13c84 | release-readiness | run the gates |
| U6 | Which alternatives do target actors actually use today? | positioning (alternative test) | user research; owner |
| U7 | Public URL / host for the landing page | marketing, SEO metadata | owner |
| U9 | Baseline GitHub/npm adoption metrics at launch and who records them | marketing measurement | owner |
| U8 | Trademark screening of the "Cognate" name and the cartridge mark has not been run | brand mark public use | owner |

## Decision log

| n | decision | rationale | touched | version |
|---|---|---|---|---|
| D1 | Goal: reposition Cognate as the agentic application framework — rewritten README, interactive narrative landing page in landing/, verified first-build onboarding; release bar: release. Model created from recon evidence P1–P4 (code, executed commands, screenshots, licenses) | Four recon reports under actualize/evidence/recon-software/ | all | 1 |
| D2 | Lens selection: recon-software, brand, direction, marketing, experience, illustration, motion-editorial, fidelity-qa, provenance-licensing, release-readiness; excluded recon-physical (digital-only product), electronics (no powered circuitry), embedded-systems (no firmware targets), robotics (no embodied loop), product-visualization (no 3D product geometry), audio-sound (no audio), legacy-modernization (no core rewrite in scope) | `actualize select` waves | decisions | 1 |
| D3 | Positioning foundation: "Cognate — the agentic application framework. You steer the software. AI agents build it — and work within it." Workbench is an exemplar, not Cognate | Owner mission brief 2026-10-15 | purpose, positioning | 1 |
| D4 | Adoption route: SDK from npm; building-with-cognate skill via skills.sh (placeholder link, labelled pending) with a working fallback | Owner chat 2026-10-15 | form, constraints | 1 |
| D5 | Public copy describes Workbench from main; Expert Teams appear only labelled as in-development branch work; never claim parallel Specialists | C38–C40; owner brief | claims:C38+C39+C40 | 1 |
| D6 | Run proceeds without owner availability; reversible decisions are made and logged, irreversible ones (publish, push, npm release) are deferred | Owner chat 2026-10-15 | decisions | 1 |
| D7 | Accept brand positioning, voice, name/architecture rule and headline system (artifacts/brand/brand.md) | Negation test passed for kept lines; difference rests on OBSERVED/VERIFIED claims | positioning, voice, unknowns | 2 |
| D8 | Landing site ships no analytics; adoption measured off-site (GitHub, npm) | Static, no consent surface; no instrumented need (P11) | form, unknowns | 3 |
| D9 | Activation = agent-built Cognate app runs and its acceptance check incl. human approval passes | flow-onboarding: define activation first (P12) | form | 3 |
| D10 | Creative direction: assembly-drawing world, light-primary, tokens and rules R1–R8, exclusions X1–X7 | Swap/exclusion checks in artifact (P10) | form | 3 |
| D11 | Narrative beats A–H with one primary action (#start) | Beat map with marginal-value and removal conditions (P11) | form | 3 |
| D12 | Accept exploded-view census/conventions and scroll choreography (C and G sequences) | Illustration + motion-editorial specs with checks (P14, P15) | form | 4 |
| D13 | Fix the building-with-cognate/domainforge-sea skills and onboarding docs to match 0.5.0 (commit 4e2794f); keep SDK packages unchanged; record F-3 (SQLite mkdir) and CLI templates as opportunities | First-build friction F-1…F-14 (P16, P18) | claims:C1+C43+C44+C45+C47+C48, unknowns | 5 |
| D14 | Cognate voice inherits the GodSpeed master voice | Owner-supplied voice doc (P19) | voice | 5 |
| D15 | Quick start = npm packages + skill via `npx skills add` from GitHub; skills.sh shown as labelled placeholder; examples/refund-desk is the reference answer | P16, P20, owner D4 | form, claims:C46 | 5 |
