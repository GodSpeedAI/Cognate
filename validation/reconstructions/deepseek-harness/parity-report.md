# DeepSeek Harness Reconstruction — Final Parity Report

Branch `cognate/harness`. This report is compiled strictly from the artifacts listed under each
section; no result is asserted that is not sourced from a file in
`validation/reconstructions/deepseek-harness/` (`R/` below) or `.agents/plans/deepseek-harness-reconstruction.md`.
Written while a separate agent may be landing small UI fixes concurrently (working tree was clean at
write time; commit `edebfad` is HEAD) — see "Status at time of writing" at the end.

---

## Reference

| Field | Value | Source |
|---|---|---|
| Repository | `deepseek-ai/deepseek-harness` | `R/reference-manifest.json` |
| Exact commit | `477b4f420553e8a52c2fbccc464d7561b239c443` | `R/reference-manifest.json` |
| Package / version | `@deepseek-ai/dsh-root@0.1.7-rc.2` | `R/reference-manifest.json` |
| Date captured | 2026-09-26 | `R/reference-manifest.json` |
| Launch | `DSH_HOME=<isolated-dir> pnpm dsh web --no-open --port 3080`, token-in-URL + cookie session | `R/reference-manifest.json` |
| Isolation | `DSH_HOME` fully redirects state; nothing written under real `$HOME` | `R/reference-manifest.json` |
| Capture tooling | Playwright, Chromium rev. 1243, viewports desktop 1440×900 / laptop 1024×768, DPR 1, en-US/UTC, reduced motion | `R/reference-behavior-matrix.md` header |

---

## Behavioral parity

Every P0/P1 row in `R/reference-behavior-matrix.md` §1–§9, cross-referenced against
`R/primitive-provenance.md` §1 (24 constituent-behavior rows) and the APP test suite
(`R/cognate/test/`).

| Feature (matrix §) | Class | PASS/FAIL | Reference evidence | Cognate evidence | Test identifier |
|---|---|---|---|---|---|
| Token-in-URL handoff / session cookie | P0 | PASS | matrix §1; `reference-manifest.json` authHandoff | `src/server.ts:devTokenAuthenticator` (dev-token path) | `J-A-first-use` (journey), `provenance.md` row 1 |
| First-run dialogs + no-workspace alert | P0 | PASS | matrix §1, screenshot `01-first-launch` | `src/capabilities/onboardingDismiss.ts`, `onboardingProjection`; Cognate-branded copy per allowance | `provenance.md` row 2; `DEVIATIONS.md` "First-run dialog pair" |
| App shell / composer gating | P0 | PASS | matrix §1 | `src/ui/App.tsx` composer `disabled` derivation | `provenance.md` row 3 |
| Settings → Models: provider create, validation, hot-swap | P0 | PASS | matrix §2, screenshots `02*` | `src/capabilities/modelConfigure.ts`, `providerRegistry.ts:swap` | `J-CFG-model-provider.test.ts`; `provenance.md` row 4 |
| Write-only API key contract (redaction) | P0 | PASS | matrix §2, `02d-model-settings-redacted-key` | `src/capabilities/secretPut.ts`, `src/secrets.ts` | `J-CFG-model-provider.test.ts`; `provenance.md` row 5 |
| Model select without restart | P0 | PASS | matrix §2 | `providerRegistry.ts:swap` (fiber mount/dispose) | `provenance.md` row 6 |
| Choose workspace / workspace↔session relationship | P0 | PASS | matrix §3, `04-workspace-selected` | `workspaceSelect.ts`, `workspacesProjection` | `J-WS-select.test.ts`; `provenance.md` row 7 |
| Composer path containment | P0 | PASS | matrix §3 | `src/capabilities/tools.ts:resolveInWorkspace` | `provenance.md` row 8 |
| Session create/history/switch/reload | P0 | PASS | matrix §4, `05`–`17` screenshots | `agentCodingAgent`, `sessionsProjection` | `J-B-basic-session.test.ts`; `provenance.md` row 9 |
| Session title = literal first message | P0 | PASS (fixed round-1) | matrix §4, §0 | `sessionsProjection:titleFrom` (turn-start branch) | `J-B-basic-session.test.ts`, `J-G-persistence.test.ts`; `DEVIATIONS.md` "Session title source" |
| History folded into model context | P0 | PASS | matrix §4/§5 | `src/capabilities/sessionHistory.ts` | `provenance.md` row 11 |
| Streaming assistant response | P0 | PASS | matrix §5, `07-streaming` | `streamingProviderComponent` via G1 progress channel | `provenance.md` row 12; **UI regression**: label invisible, see round-5 P1 below |
| Tool execution (read/edit/bash/run_code), real workspace mutation | P0 | PASS | matrix §6.1, `git diff` in fixture workspace | `src/capabilities/tools.ts`; verified byte-for-byte disk mutation | `J-C-tool-execution.test.ts`; `provenance.md` row 14 |
| Read-before-edit guard | P0 | PASS | matrix §6.1 | `agentCoding.ts:invokeTool` boxed `ctx.step` | `provenance.md` row 15 |
| Approval-gated `run_code` escalation | P0 | PASS | matrix §6.2 | `approvalGate.ts` + `ctx.waitFor("tool-approval")` | `J-D-approval.test.ts`; `provenance.md` row 16 |
| Approval reload persistence | P0 | PASS | matrix §6.2 ("reload preserves it exactly") | durable continuation, SQLite-backed | `J-D-approval.test.ts` |
| Approval restart behavior | P0 | **DEVIATION (documented, deliberate)** | matrix §6.2: restart silently finalizes as `Worked`, empty output | Cognate: continuation survives restart (`run.waiting` durable) | `J-D-approval.test.ts` ("a pending approval survives a full server restart"); `DEVIATIONS.md` "Pending approvals survive a full server restart" |
| Plan mode / To-dos / plan review | P0 | PASS | matrix §6.3 | `planGate.ts`, `plansProjection`, `ctx.waitFor("plan-review")` | `J-E-plan.test.ts`; `provenance.md` row 17 |
| Subagent delegation, fire-and-forget | P0 | PASS | matrix §6.4 | `subagentStart.ts`, `subagentsProjection` | `J-F-delegation.test.ts`; `provenance.md` row 18 |
| Subagent result reaches parent on next turn | P0 | PASS | matrix §6.4 | `sessionHistory.ts` subagentRows fold | `provenance.md` row 19 |
| Cancellation ("Stop generating") | P0 | PASS | matrix §7, `19-cancelled` | `AbortSignal` propagation through `RunContext.signal` | `J-H-cancellation.test.ts`; `provenance.md` row 20 |
| Provider error + automatic retry (5-attempt budget, terminal copy) | P0 | PASS (evidence: exact terminal string not reproduced — see deviation) | matrix §8, `18-error`, 90s terminal wait | `agentCoding.ts:invokeModelGenerate`/`classifyModelFailure`, 5-attempt retry loop | `J-H-provider-error.test.ts`; `provenance.md` row 21 |
| Structured failure detail on recorded invocation failures | P0 (framework, F3) | PASS | n/a (framework-level; matrix §8 motivates it) | `packages/runtime-bun/src/invoker.ts:failureJson` | `packages/runtime-bun/test/invoker.test.ts:"records error name and details from thrown error"` |
| Theme (Light/Dark/System) | P1 | PASS | matrix §9, `20-theme-variant` | `src/ui/App.tsx` theme toggle, Settings → General → Appearance | `provenance.md` row 24; capture-order note, not a rendering defect (round-5 evidence-quality note) |
| "Work details" tool-call verbosity setting | P1 | **NOT REPRODUCED (inventory-only, documented)** | matrix §10 (P1) | not implemented this tranche | `DEVIATIONS.md` (no dedicated entry; inert/absent by scope) |

**Behavioral parity totals**: matrix §1–§9 carries 8 P0 sections (all resolved per matrix's own
"P0/P1/P2 counts" tally) plus 2 P1 items (§9 Theme, §10 Work-details setting). Of the 24
constituent-behavior rows in `primitive-provenance.md` §1, all 24 are implemented with `Special
case? No`. One P0-class behavior (approval-restart) is **intentionally not reference-identical** —
recorded as a deviation, not a failure, per the operator's durability invariant
(`DEVIATIONS.md` "Pending approvals survive a full server restart"). One P1 inventory item
("Work details" verbosity) is out of scope this tranche and undocumented as a formal deviation entry
(gap noted below under Deviations honesty).

---

## Journey parity

Source: `R/tests/journeys/results/summary.md` (generated 2026-09-27T13:58:21.808Z) and
`R/cognate/test/*.test.ts`.

| Journey | Reference result | Cognate result | Comparison | Flakes |
|---|---|---|---|---|
| A-first-use | PASS (11.1s) | PASS (4.2s) | Equivalent | none |
| B-basic-session | PASS (15.4s) | PASS (7.1s) | Equivalent | none |
| C-tool-execution | PASS (15.5s) | PASS (14.2s) | Equivalent, incl. verified on-disk file mutation | none |
| D-approval (allow) | PASS (18.1s) | PASS (9.8s) | Equivalent | none |
| D-approval (deny) | **FLAKY** (2 attempts, 19.0s) | PASS (6.3s) | Cognate deterministic; reference flaky against the live mock/product, not attributable to Cognate | reference-side flake, no message recorded |
| E-plan | PASS (16.6s) | PASS (6.1s) | Equivalent | none |
| F-delegation | **FLAKY** (2 attempts, 18.0s) | PASS (4.8s) | Cognate deterministic; reference flaky, no message recorded | reference-side flake |
| G-persistence (session survives restart) | PASS (22.2s) | PASS (7.2s) | Equivalent | none |
| G-persistence (documented approval-restart difference) | PASS (20.0s) | PASS (6.9s) | Both sides pass their own journey definition of the (differing) expected behavior — see Behavioral parity "Approval restart behavior" row | none |
| H-cancellation (provider error → retries → terminal failure) | PASS (71.4s) | PASS (4.4s) | Equivalent behavior; documented failure-code text difference (see Deviations) | none |
| H-cancellation (stop mid-stream, follow-up turn works) | PASS (13.6s) | PASS (4.0s) | Equivalent | none |

All 11 required journeys pass on both sides. Two reference-side flakes are recorded in
`summary.md`'s "Failures and flakes" section with no attached message; Cognate's corresponding runs
were stable (single attempt, PASS) both times.

---

## UI parity

Source: `R/diffs/summary.md` (per-checkpoint differing-pixel percentage, no similarity threshold per
spec Phase 7 — evidence only) and `R/critic/round-{1..5}*.md` dispositions. 28 checkpoints × 2
viewports (desktop 1440×900, laptop 1024×768).

| Checkpoint | Structural comparison summary | Diff artifact | Mask / caveat | Final disposition (round 5) |
|---|---|---|---|---|
| 01-first-launch | Content differs by design (Cognate-branded dialog copy vs. DeepSeek's); structure/roles match | `R/diffs/{desktop,laptop}/01-first-launch.png` (89.6% / 82.8% differing pixels) | Brand-substitution allowance (spec) — text/logo content masked from judgment, not pixels | FIXED-VERIFIED (round 5 batch A) |
| 02/02b/02c/02d-model-settings* | Structure matches; content differs (Cognate's generic provider-preset list vs. reference's ~35-entry DeepSeek list); 02 capture-sequencing difference documented | `R/diffs/{desktop,laptop}/02*.png` (35–68% differing pixels) | Provider-list content is intentionally original (not copied reference IP) | Accepted (round-2 disposition, "02-model-settings checkpoint pairing... accepted, not fixed") |
| 03-no-workspace | Same first-run dialog content difference as 01 | `R/diffs/*/03-no-workspace.png` (89.5% / 82.6%) | Same as 01 | FIXED-VERIFIED (capture-stage alignment, round-3 fix "Checkpoint 03 capture-alignment") |
| 04-workspace-selected | Structural match, low diff | `R/diffs/*/04-workspace-selected.png` (1.2% / 2.0%) | none | FIXED-VERIFIED (round-5 P2-1 hero styling) |
| 05-empty-session | Structural match | `R/diffs/*/05-empty-session.png` (1.2% / 2.0%) | none | Match, no open items |
| 06-user-message | Structural match except one regression | `R/diffs/*/06-user-message.png` (1.7% / 2.6%) | none | **OPEN P1** — "Deep diving for Ns" status text wrapped in `.sr-only`, invisible (round-5 visual-a P1-6) |
| 07-streaming | Same regression as 06 | `R/diffs/*/07-streaming.png` (1.75% / 2.71%) | none | **OPEN P1** — same as 06 |
| 08-tool-running | Structural match | `R/diffs/*/08-tool-running.png` (1.7% / 2.66%) | Timing note: may land on an already-completed frame (`DEVIATIONS.md`) | Match |
| 09-tool-complete | Structural match | `R/diffs/*/09-tool-complete.png` (2.22% / 3.52%) | none | Match |
| 10-file-change-collapsed | Structural match | `R/diffs/*/10-file-change-collapsed.png` (2.25% / 3.57%) | none | Match |
| 10-file-change-expanded | Structural match on desktop; laptop overflows viewport | `R/diffs/*/10-file-change-expanded.png` (2.90% desktop / 4.09% laptop; laptop dims 1141×768 vs ref 1024×768) | Dimensions differ, padded before diff (summary.md note) | **OPEN P1** — laptop viewport overflow to ~1141px instead of clipping at 1024px (round-5 visual-b P1-1) |
| 11-approval-pending | Desktop structural match; both viewports show a state-leak bug | `R/diffs/*/11-approval-pending.png` (3.43% desktop / 4.83% laptop; laptop dims differ, padded) | none | **OPEN P0** — Review panel from a prior session persists and shows stale/wrong-session diff on new-session switch (round-5 visual-b P0-1) |
| 11b-approval-pending-after-reload | Structural match | `R/diffs/*/11b*.png` (2.80% / 4.56%) | Reload correctly resets Review panel (contrast with 11's P0) | Match |
| 12-approval-resolved-allow | Structural match | `R/diffs/*/12-approval-resolved-allow.png` (2.16% / 3.43%) | none | Match |
| 12-approval-resolved-deny | Structural match | `R/diffs/*/12-approval-resolved-deny.png` (2.57% / 4.09%) | none | Match |
| 13-plan-active | Structural match; capture-timing note | `R/diffs/*/13-plan-active.png` (2.38% / 3.80%) | Mock model has no real latency between `todo_write`/`exit_plan_mode`, so capture sometimes lands past the intended frame (`DEVIATIONS.md`) | Match (capture-timing artifact, not a defect) |
| 13b-plan-review-prompt | Structural match aside from missing right sidebar | `R/diffs/*/13b*.png` (3.03% / 4.85%) | No right-sidebar plan tab this tranche (documented) | Accepted deviation |
| 13c-plan-completed | Same as 13b | `R/diffs/*/13c*.png` (2.65% / 4.24%) | Same as 13b | Accepted deviation |
| 14-subagent-active | Structural match; banner-timing note | `R/diffs/*/14-subagent-active.png` (2.55% / 4.10%) | "1 subagent" banner may appear earlier than reference (`DEVIATIONS.md`) | Accepted deviation |
| 14b-subagent-completed-panel | Structural match | `R/diffs/*/14b*.png` (2.40% / 3.84%) | none | FIXED-VERIFIED (round-4 single-row fix, round-5 re-confirmed) |
| 15-completed-session | Structural match | `R/diffs/*/15-completed-session.png` (2.43% / 3.83%) | none | FIXED-VERIFIED (round-4/5 step-counter, duration-text fixes) |
| 16-session-history | Structural match; reference itself not settled | `R/diffs/*/16-session-history.png` (2.36% / 3.71%) | Reference capture's 15s wait insufficient to reach settled state (round-5 evidence-quality note, not scored against Cognate) | Match (with evidence-quality caveat) |
| 17-restored-after-reload | Content differs by design (session content varies with prior state); high diff % is a fixture/state artifact, not structural mismatch | `R/diffs/*/17-restored-after-reload.png` (88.9% / 81.6%) | Reference not settled at capture (same as 16) | Match (with evidence-quality caveat) |
| 18-error | Structural match; reference itself not settled | `R/diffs/*/18-error.png` (2.36% / 3.71%) | Reference not settled at capture (same as 16); Cognate's failure-code text differs from reference's timeout text (see Deviations) | Match (with evidence-quality caveat + documented text deviation) |
| 19-cancelled | Structural match | `R/diffs/*/19-cancelled.png` (2.19% / 3.45%) | none | FIXED-VERIFIED (round-3 status-pill dot fix) |
| 20-theme-variant | Structural match; capture-order difference (Settings dialog open in Cognate's shot, closed in reference's) | `R/diffs/*/20-theme-variant.png` (3.18% / 4.79%) | Capture-script ordering difference, not a rendering defect (round-5 evidence-quality note) | Match (capture-order note only) |

**Open UI items at time of writing (round 5, HEAD `edebfad`)**: 1 P0 (11-approval-pending Review-panel
state leak on session switch) + 2 P1 (06/07 "Deep diving for Ns" invisible status text; 10/11 laptop
viewport overflow to ~1141px). All three are documented with root cause and fix recommendation in
`R/critic/round-5-visual-{a,b}.md`; none is yet reflected in `DEVIATIONS.md`.

---

## Persistence parity

Source: `R/cognate/test/J-G-persistence.test.ts`, `R/architecture-evidence.md` criterion 6
(event-history-authoritative), `R/tests/journeys/results/summary.md` (G-persistence rows), and
`reference-behavior-matrix.md` §4 restart evidence.

| Stage | Reference | Cognate |
|---|---|---|
| Pre-restart state | A completed session with full transcript (matrix §4: "Process restart" — completed sessions and their full transcripts survive unchanged"); separately, a **pending approval** exists before restart (matrix §6.2) | `J-G-persistence.test.ts`: a session is created, `workspace.select`'d, and run to completion (`waitForCompletion`) against a temp `COGNATE_HARNESS_HOME` and a mock model provider |
| Restart | Reference: process killed and `dsh web` relaunched against the same `DSH_HOME` (matrix §4/§6.2) | Test: `app.stop()` then `startServer({ port: 0, home })` reopening the **same SQLite file** — a fresh process-equivalent server instance |
| Reconstructed state | Completed session/transcript restored unchanged; a **pending approval does not survive** — silently finalizes as `Worked` with no assistant text/tool card (matrix §6.2) | `sessions` projection row: `lastStatus === "completed"`, `title` contains the literal first message text (`"remember this"`); `workspaces` projection record present; `session.history` capability returns 2 messages, first containing `"remember this"` — all read back from the reopened store |
| Comparison | Completed-session persistence: **matches**. Pending-approval persistence: **intentional deviation** — Cognate's continuation is durable and survives restart (`J-D-approval.test.ts`: "a pending approval survives a full server restart"), where the reference finalizes it empty. This is recorded as a deliberate, documented divergence (`DEVIATIONS.md` "Pending approvals survive a full server restart"), not a defect, because treating durable event history as authoritative is a project invariant the reconstruction does not break to match what the operator's own note calls "an implementation detail that looks like data loss." | Independently, `architecture-evidence.md` criterion 6 shows all four projections (`sessions`, `plans`, `subagents`, `workspaces`) rebuild identically after their `projection_state`/`projection_checkpoints` rows are deleted directly from SQLite and the app restarted — i.e., the event log alone (not any cached projection state) is authoritative, exercised via a tool+plan+approval+delegate journey (PASS, 1/1). |

Both the completed-session persistence path and the (intentionally divergent) approval-continuation
durability path are exercised and pass. Journey summary confirms both G-persistence rows PASS for
Cognate (7.2s, 6.9s) and for the reference (22.2s, 20.0s).

---

## Architectural purity

Source: `R/architecture-evidence.md` (Phase 8). All 9 spec criteria, run via `bun test
validation/reconstructions/deepseek-harness/tests/architecture` (62 tests / 8 files, all pass) plus
`tests/architecture/reference-removed.sh`.

| # | Criterion | Result |
|---|---|---|
| 1 | No dependency on `deepseek-harness`/`@deepseek-ai/*`/`dsh-*` in any package.json or bun.lock | PASS (36/36) |
| 2 | No import/require resolves into `.tmp/ref` or names a reference package, incl. bundled output | PASS (6/6) |
| 3 | No copied reference source (8-line shingles) or byte-identical asset | PASS (3/3), reference checkout present so this ran for real |
| 4 | No reference-specific primitive introduced; every framework export traceable to D1/G1/D2/F3 | PASS (4/4) |
| 5 | Cordis stays behind Cognate interfaces (APP never imports `@cognate/kernel-cordis`/`cordis`) | PASS (3/3) |
| 6 | Event history authoritative (projections rebuild identically after deleting projection state) | PASS (1/1) |
| 7 | `.sea`/DomainForge/RealityTrace unchanged; pinned versions unchanged | PASS (6/6) |
| 8 | Cognate works after the reference checkout is physically removed | **PASS** — see `tests/architecture/reference-removed.log` |
| 9 | RuVector-rebuild criterion | PASS (3/3), vacuously satisfied — APP uses no cognition, none added merely to exercise this criterion |

**Criterion 8 detail** (`tests/architecture/reference-removed.log`, single recorded run):
(a) reference checkout moved outside the repo to `/tmp/deepseek-harness-ref-stash.*`; (b) `bun
install --frozen-lockfile` PASS (248 installs, no changes); (c) `bun run typecheck` PASS; (d) `bun
test validation/reconstructions/deepseek-harness/cognate/test` PASS (19 pass, 0 fail, 119 expect()
calls, 10 files, 26.65s); (e) a Cognate-only Playwright capture smoke run (mock model + APP, no
reference on disk) PASS, producing all 28 named checkpoints; (f) reference restored to
`.tmp/ref/deepseek-harness`. No step failed.

**Special-case audit** (`architecture-evidence.md` §4): searched `src/`/`domain/` for direct SQLite
access, store writes bypassing capabilities, bare `Date.now()`/`Math.random()` or I/O outside
`ctx.step`/`ctx.invoke`, direct fetches around capabilities, and secrets in events. Every hit was
classified "Not a bypass" with a specific justification (dev-server path config, browser-side UI
timers, `randomUUID()` used only for idempotency keys at non-replayed boundaries, all filesystem/
subprocess I/O boxed inside capability handlers, API keys destructured out before `ctx.emit`). No
hit required flipping any provenance row to "Special case? Yes".

---

## Primitive provenance summary

Source: `R/primitive-provenance.md` (Phase 9), verified by reading `cognate/{src,domain}` against the
matrix's P0/P1 rows.

- **24 rows**, one per constituent observable behavior across matrix §1–§9. **All 24 are `Special
  case? No`** — every P0/P1 feature maps onto a clean composition of existing Cognate primitives
  (Event, Projection, Capability, Continuation, Fiber, Correlation, `ctx.step`/`ctx.invoke`,
  `HandlerContext.progress`) with no DeepSeek-specific kernel construct.
- Representative mappings: sessions = `Correlation("session:<id>")` + `session.turn.started`/
  `message.completed` Events + `sessions` Projection; approvals = pure policy gate function +
  `ctx.waitFor("tool-approval")` Continuation; plan review = a **distinct** `ctx.waitFor("plan-review")`
  Continuation type (not reused from approval, because payload/outcome shapes differ); subagents =
  a child `agent.coding` run under its own `Correlation`, fire-and-forget (no watcher, no
  continuation) with the parent picking up the child's result via `session.history`'s read of the
  `subagents` Projection on its next turn.
- Four framework-level changes underpin this provenance (§2 of `primitive-provenance.md`): **D1**
  (replay-safe emits inside `ctx.step`, defect repair), **G1** (new general
  `HandlerContext.progress` → `run.invocation.progress` Event channel — the honest architectural gap
  this test found, operator-approved as a new domain-independent primitive, not a workaround), **D2**
  (provider stream/abort error-mapping, defect repair), **F3** (structured failure detail preserved
  through the kernel's JSON boundary, defect repair). All four are on commits `6f94df5` and `d93250d`,
  each with a regression/conformance test.
- §3 documents four intentional "mapping differences" from the spec's interpretation table (plan not
  modeled as `Artifact`; workspace as `agent.config` events + projection rather than a bespoke
  capability tree; approval and plan-review as two distinct Continuation types; session history
  folded capability-side rather than as a standing named Projection) — all characterized as
  legitimate instantiations, not violations, of the spec's guidance.

---

## Framework findings

Per `.agents/plans/deepseek-harness-reconstruction.md` "Findings (architectural)" and
`primitive-provenance.md` §2.

- **D1 (defect, existing primitive).** `RunContext.emit` called inside `RunContext.step` shifted
  `emit:<n>` counters on replay, letting a later emit collide with one recorded inside the step.
  Domain-independent; fixed in `packages/runtime-bun/src/executor.ts` with conformance test "a step's
  internal emits survive replay: no collision, no drop, correct order (D1)". **Repaired.**
- **D2 (defect, existing primitive).** `provider-openai-compatible` advertised `stream: true` but its
  `stream()` did not map mid-stream abort/network failures to the typed `ModelProviderError`.
  Domain-independent transport bug; fixed with two provider tests (`"stream aborts on the caller's
  signal without hanging"`, `"stream surfaces an HTTP error before any bytes are read..."`).
  **Repaired.**
- **G1 (candidate gap → honest finding this test surfaced and closed).** A capability handler had no
  way to publish incremental progress into its invoking run — `HandlerContext` had no
  progress/emit-like channel, so streaming through a policy-gated, hot-swappable `model.*` capability
  was **not expressible in the framework at all**. This is the real gap the reconstruction test was
  designed to surface. Operator decision (2026-09-26, recorded in the plan): add it as a
  domain-independent primitive (`InvocationContext`/`HandlerContext.progress` →
  `run.invocation.progress` events, with attempt/sequence numbers) rather than route around it in the
  app. Conformance test: "a handler's progress calls are durable, ordered, and never repeated on
  replay (G1)". This is reported honestly as **a new general capability the test required**, not
  folded silently into "no special case."
- **F2 (framework finding, not fixed by design).** `spawnSubagent` (exported from
  `@cognate/profile-harness`) depends on a `run_completion` continuation resolver that lives inside
  `createHarness`'s closure; an app composing `createRuntime` directly (as this reconstruction does)
  cannot reuse it without copying the resolver. Not needed here because the reference's delegation is
  fire-and-forget (matrix §6.4) — an earlier pass that synchronously awaited the child via
  `spawnSubagent` was itself a mismatch, corrected in `f3fa09a` by dropping `spawnSubagent` entirely
  in favor of this app's own `subagent.start` capability. Candidate general fix (exporting a
  standalone `watchSubagentCompletions(runtime, caller)`) remains open, correctly untouched on this
  branch since it was never on the reconstruction's critical path.
- **F3 (defect, existing primitive).** `packages/runtime-bun/src/invoker.ts`'s `failureJson` reduced
  any thrown error to `{ kind: "failed", message }`, discarding `ModelProviderError.kind`/`status`.
  Fixed in `d93250d` to preserve `error.name` and a JSON-safe `details` object; regression test
  `"records error name and details from thrown error"`. `agentCoding.ts:classifyModelFailure` now
  prefers structured `failure.details` with message-regex fallback. **Repaired.**

---

## Deviations

Every entry from `R/cognate/DEVIATIONS.md`, in file order, with classification.

1. **First-run dialog pair — content substituted, structure preserved.** Cognate-branded copy
   instead of DeepSeek's; dismissal durability via `onboarding.dismissed` event. *Classification:
   permitted brand substitution (spec allowance), documented assumption that "Save and continue"
   behaves like "Configure later" (not an observed reference behavior).*
2. **Settings → Models provider list — original preset list, single-provider backend limitation.**
   7 generic OpenAI-compatible presets instead of ~35 DeepSeek-branded ones; only the first Models
   sub-row actually wires to `model.configure`; "Delete" and "Fetch available models" present but
   disabled; "Open configuration file" link present but disabled. *Classification: scope-limited
   stub, control-present-feature-stubbed pattern, minor.*
3. **Settings General/Built-in plugins/Agent presets — inert nav items**, except General/Appearance
   which is live (theme toggle moved here from a former sidebar control to match the reference's
   actual location). *Classification: scope-limited stub, minor; one corrective relocation.*
4. **Sidebar "Plugins" global panel — inert.** No plugin system this tranche. *Classification:
   scope-limited stub, minor.*
5. **Session header actions inert** ("Open in Files", "More ways to open", "More actions", "Open
   right sidebar"). *Classification: scope-limited stub, minor.*
6. **Trajectory tab — inert.** No step-inspector view this tranche. *Classification: scope-limited
   stub, minor.*
7. **Message action row — inert/static.** Good/Bad response, Branch are present but disabled; "Usage
   0 tok" is a static placeholder. *Classification: scope-limited stub, minor.*
8. **Composer permission-mode and model dropdowns — inert, single-value.** Only one implicit access
   mode/model exists this tranche. *Classification: scope-limited stub, minor.*
9. **Composer stats footer — static** (`0 turns 0 steps · 0 tok/s`, `0% of context used`).
   *Classification: scope-limited stub, minor; explicitly tracked as a backend-accounting gap.*
10. **Session title source — fixed, not a residual deviation**, but the reference's separate
    LLM-re-titling call is not reproduced (session keeps its literal-first-message title for its
    lifetime). *Classification: documented assumption, not contradicted by observed evidence
    (matrix §4/§0 notes the re-titling effect on the visible title was never confirmed).*
11. **Cancel/error presentation — implemented, not reference-identical.** Cognate's cancelled-row and
    failed-row chrome are original designs; the reference's own exact chrome was not confirmed
    against the pinned build. *Classification: documented assumption, minor.*
12. **Approval-gate access mode is a fixed default** (`"read-only"`), not wired to the (inert)
    composer access-mode dropdown; matches the reference's own observed mode during its approval
    scenario. *Classification: scope-limited stub with a matching conservative default, minor.*
13. **Pending approvals survive a full server restart; the reference does not.** Deliberate,
    architecture-invariant-driven divergence (durable continuations by construction).
    *Classification: intentional deviation, documented and tested (`J-D-approval.test.ts`), not a
    defect.*
14. **`run_code`'s sandbox is an original harness**, not a reproduction of the reference's
    `dsh-tools` sandbox/permission model — sufficient to run the fixture's exact snippet, no general
    filesystem/network sandboxing beyond workspace-path containment. *Classification: scope-limited
    reimplementation, moderate (functional but not architecturally equivalent to reference sandbox).*
15. **`08-tool-running` may land on an already-completed frame** — local tool calls resolve faster
    than the reference's backend latency, so the capture sometimes skips the genuine mid-run frame.
    *Classification: capture-timing artifact, not a feature defect; running-state UI independently
    verified via the (naturally slow) approval checkpoint.*
16. **Plan mode: `13-plan-active` may land past the intended `todo_write`-only frame** (same root
    cause as #15). *Classification: capture-timing artifact, not a defect.*
17. **Plan mode: no right-sidebar plan tab** — plan shown inline via "View full plan" disclosure
    instead of auto-opening in a right sidebar (no right sidebar exists in this tranche apart from
    the Review/subagent panel). *Classification: scope-limited stub, moderate (visible layout
    difference, accounts for most of `13b`/`13c`'s pixel diff).*
18. **Plan mode: "Open plan: `<title>`" present but disabled.** *Classification: scope-limited stub,
    minor, consistent with #17.*
19. **Plan mode: "Request changes" wording is this app's own invention**, not reference-confirmed (the
    reference itself never exercised this path). *Classification: documented assumption, minor.*
20. **Plan mode: "Plan mode off." confirmation turn is this app's own minimal design** — a pure
    control command with no model round trip; reference's exact UI here was never captured.
    *Classification: documented assumption, minor.*
21. **Subagents: `14-subagent-active` may already show the "N subagent(s)" banner** ahead of when the
    reference would (same timing-artifact family as #15/#16). *Classification: capture-timing
    artifact, not a defect.*
22. **Subagents: "Open `<title>` in sidebar" opens a minimal, newly-built right panel**, not a reused
    one (none existed before) — sufficient for a single-turn child transcript, not a reproduction of
    the reference's full right-sidebar chrome (tabs, split/fullscreen/collapse). *Classification:
    scope-limited reimplementation, minor.*
23. **Provider-error code mapping is text-based, not status-based** (`failureJson` still only reliably
    carries `message` for the `"failed"` kind pre-F3-consumption path; `classifyModelFailure` matches
    on message text with `/timed out/i` → the reference's own `TIMEOUT` string, everything else →
    an honest, non-invented `"Internal server error" / HTTP_500` rather than fabricating a timeout
    that didn't happen). *Classification: documented, deliberately honest approximation, minor.*
24. **Retry backoff is real but short** (`DEFAULT_RETRY_BACKOFF_MS` 300ms vs. reference's ~90s for a
    full 5-attempt budget; test suite overrides to 10–150ms). Retry count (5) and event shape
    unaffected. *Classification: intentional test/dev-speed deviation, minor, does not change
    observable behavior shape.*
25. **Cancelled-turn history is not fed back into the next turn's model context** — undocumented in
    the reference matrix either way; Cognate's `session.history` only appends an assistant message on
    `"completed"` status, so a cancelled turn contributes only its user message. *Classification:
    documented assumption (spec area left undefined by the reference matrix), minor.*
26. **No manual "Retry"/"Dismiss" on a failed turn — matches the reference exactly.** *Classification:
    not a deviation; listed for completeness (matches reference behavior).*
27. **The retry disclosure's expanded content is this app's own minimal rendering** (one line per
    attempt); the reference's own expanded-state content was never captured. *Classification:
    documented assumption, minor.*
28. **Composer "Stop generating" aria-label matches the reference exactly** (corrected from an
    earlier, non-matching "Stop" label). *Classification: not a residual deviation; corrective fix,
    listed for completeness.*
29. **All icons are original inline SVGs**, not visual copies of the reference's iconography.
    *Classification: permitted originality (IP), minor.*
30. **02-model-settings checkpoint pairing** — the reference's own `02` capture happens to already show
    a configured provider (stale prior state), while Cognate's `02` is genuinely fresh/unconfigured
    (required for `01`/`03`'s pre-config state to be consistent). *Classification: capture-sequencing
    difference, accepted, not reworked; documented as such rather than silently reordered.*

**Deviations file honesty gap flagged by this report**: the three round-5 UI findings (11-approval
Review-panel state leak, invisible "Deep diving for Ns" text, laptop viewport overflow) are **not yet
present in `DEVIATIONS.md`** — they were found after the last commit that touched that file. They are
carried in this report's UI-parity table and Settlement Gate below as open items, not silently
dropped.

---

## Settlement Gate

Evidence-based status as of HEAD `edebfad` (working tree clean at write time). Item 18 is
intentionally left PENDING-FINAL-ROUND per instruction; the orchestrator supplies the final critic
verdict.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | The reference is pinned to an exact commit | **MET** | `reference-manifest.json`: commit `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 2 | All P0 behaviors are reproduced | **NOT MET** | 24/24 provenance rows implemented, but round-5 found 1 open P0 UI regression (Review-panel state leak on session switch, `11-approval-pending`, `round-5-visual-b.md`) not yet fixed or documented |
| 3 | All P1 behaviors are reproduced | **NOT MET** | 2 open P1 UI regressions from round 5 ("Deep diving for Ns" invisible text; laptop viewport overflow), not yet fixed; "Work details" verbosity setting (matrix §10, P1) not implemented this tranche |
| 4 | All designated E2E journeys pass against both reference and reconstruction | **MET** | `tests/journeys/results/summary.md`: all 11 journey rows PASS for both reference and Cognate (2 reference-side flakes recorded, both eventually PASS) |
| 5 | The Cognate implementation behaves equivalently for those journeys | **MET** | same source; Cognate rows are single-attempt PASS in every case, faster and more deterministic than the two flaky reference rows |
| 6 | UI structure is functionally equivalent | **MET, with 3 open exceptions noted in item 2/3/7** | `diffs/summary.md` + `critic/round-5-visual-{a,b}.md`: 25 of 28 checkpoints have no open structural finding; 3 have open findings (P0 state leak, 2 P1s) |
| 7 | Stable screenshot states have side-by-side and diff evidence, with every visible divergence fixed or recorded as a deviation | **NOT MET** | Side-by-side/diff evidence exists for all 28 checkpoints (`diffs/summary.md`), but the 3 round-5 findings are neither fixed nor yet entered in `DEVIATIONS.md` |
| 8 | Approval, interruption, streaming, tool execution, planning, delegation, session history, and restart/recovery are exercised | **MET** | `reference-behavior-matrix.md` §5–§8 + `cognate/test/{J-D-approval,J-H-cancellation,J-C-tool-execution,J-E-plan,J-F-delegation,J-B-basic-session,J-G-persistence}.test.ts` all present and passing |
| 9 | The reconstruction contains no DeepSeek Harness runtime dependency | **MET** | `architecture-evidence.md` criterion 1, PASS 36/36 |
| 10 | It still works after the reference checkout is removed | **MET** | `tests/architecture/reference-removed.log`, all 6 steps PASS including a full Playwright capture smoke run with no reference on disk |
| 11 | No DeepSeek-specific Cognate kernel primitive was introduced | **MET** | `architecture-evidence.md` criterion 4, PASS 4/4; `primitive-provenance.md` §2: D1/D2/F3 are defect repairs of existing primitives, G1 is a domain-independent general capability, none reference-specific |
| 12 | Every P0/P1 feature has a clean Cognate primitive provenance mapping | **MET** | `primitive-provenance.md` §1: 24/24 rows, all `Special case? No` |
| 13 | `.sea` grammar was not modified | **MET** | `architecture-evidence.md` criterion 7, PASS 6/6 |
| 14 | DomainForge was not modified for the reconstruction | **MET** | same criterion: `@godspeedai/domainforge` pinned at `0.18.1` in `bun.lock`, unchanged |
| 15 | RealityTrace was not modified for the reconstruction | **MET** | same criterion: `@cognate/realitytrace` workspace entry byte-identical to merge-base |
| 16 | Authoritative state remains reconstructable independently of RuVector | **MET (vacuously)** | `architecture-evidence.md` criterion 9: APP uses no cognition/RuVector at all; not added merely to exercise this criterion |
| 17 | All repository tests and architectural gates pass | **MET** | `bun test validation/reconstructions/deepseek-harness/tests/architecture` 62/62 PASS; `bun test .../cognate/test` 19/19 PASS (`reference-removed.log`); `bun run typecheck` PASS |
| 18 | The independent critic/verifier approves with concrete evidence | **PENDING-FINAL-ROUND** | Latest critic verdict on file is round 5: **REJECT** (both batches) — `critic/round-5-visual-a.md` ("Cannot approve with one open P1"), `critic/round-5-visual-b.md` ("must be fixed and re-captured before APPROVE"). Final round pending the orchestrator, potentially after the concurrent UI-fix pass. |
| 19 | `parity-report.md`/`.json` contain no unresolved P0/P1 failures | **NOT MET** | This report itself documents 1 open P0 and 2 open P1 UI findings from round 5, unresolved as of HEAD `edebfad` |

### Status at time of writing

Working tree was clean and HEAD was `edebfad` at the time this report was compiled. A separate agent
is reported to be landing small UI fixes concurrently; **none had landed yet** at write time (no
round-6 critic file exists, no uncommitted changes were present). Consequently items 2, 3, 7, and 19
are marked **NOT MET** and item 18 **PENDING-FINAL-ROUND**, reflecting the most recent evidence on
disk (round 5: REJECT, 1 P0 / 2 P1 open). If the concurrent fixes land and a round-6 critic pass
confirms them, items 2/3/6/7/19 should be re-evaluated against that new evidence and item 18 resolved
by the orchestrator's final round.
