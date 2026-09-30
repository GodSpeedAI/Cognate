# Plan: DeepSeek Harness reconstruction — usage-harness feature completion (branch `cognate/harness`)

Parent spec: [.agents/prompts/deepseek-harness-reconstruction-test.md](../prompts/deepseek-harness-reconstruction-test.md) (settled through T13 — see
[deepseek-harness-reconstruction.md](deepseek-harness-reconstruction.md)). This plan is the operator-commissioned follow-up: complete the remaining
product surfaces so the reconstruction works as a usable harness, not just a parity proof.

Operator decisions (2026-09-29, this session):

- **RealityTrace Option A** — traces are sourced from Cognate's authoritative events; RealityTrace
  adds a per-step evidence layer (observation receipts, ledger positions) on top. The trace view
  never reads its trace data from SXR; SQLite stays authoritative; SXR-down never breaks dev tools.
- **`@copilotkit/aimock` fully replaces `fixtures/mock-model/server.ts`** as the app's simulated
  OpenAI endpoint (tests, captures, `just harness-up`). The custom mock stays insufficient evidence
  that the app works against a real OpenAI-shaped endpoint.
- **Built-in plugins and Agent presets panels are in scope**, not stubs.
- **Leaner process**: builder subagents per tranche + orchestrator verification + journey tests +
  recorded evidence. No full critic/parity re-settlement loop for these features.
- **Visuals**: structure follows DeepSeek Harness; look follows the app's own `DESIGN.md` (Cobalt).

Reference: pinned SHA re-cloned at `.tmp/ref/deepseek-harness` (`477b4f42`, 0.1.7-rc.2,
`pnpm install` done), plus the current product's trajectory-view image
(`https://www.deepseek.com/harness/images/feat-trace-en.webp`, fetched to `/tmp/dsh-trace.png`)
for the surfaces the pinned build never characterized.

All hard constraints of the parent spec still apply: no DeepSeek runtime dependency, no
DeepSeek-specific kernel primitives, `.sea` grammar / DomainForge / RealityTrace architectures
unmodified (adapter consumed as-is), durable events + projections own state, secrets never in
events. New capabilities bind to new `.sea` entities per the existing tranche pattern
(`domain/index.ts` `bindTranche*` → new `bindUsage*`), and the model is revalidated after each
extension.

## Tranches

| # | Tranche | Depends on | Output |
|---|---------|-----------|--------|
| U0 | Characterize the five new surfaces against the pinned reference (Trajectory tab, Workspaces sidebar section, Settings → General full inventory, Built-in plugins, Agent presets) | — | `reference-behavior-matrix.md` §11–15, `reference/observations/` additions |
| U1 | aimock replacement: fixtures + boot helper + retarget tests/captures/`harness-up` | — | `fixtures/aimock/`, retargeted `test/helpers.ts`, `scripts/harness.ts` |
| U2 | Settings → General full inventory + Permission-mode wiring | U0 | settings events/projection/UI extensions |
| U3 | Sidebar Workspaces section (multi-workspace) | U0 | sidebar UI + workspace list/switch |
| U4 | Built-in plugins + Agent presets panels | U0 | panels + durable state |
| U5 | Developer tools: Trajectory tab + step inspector | U0, U2 | `session.trace` projection/capability + UI |
| U6 | RealityTrace enrichment (Option A) | U5 | `outboxFor` wiring, ObservationDelivery → sxr, inspector enrichment, SXR test fixture |
| U7 | Wrap-up: evidence, docs, status snapshot, `just verify` | all | DEVIATIONS/README/PRODUCT/BINDINGS updates, status entry |

U0 and U1 are independent (different file sets) and run in parallel. U2–U6 are sequential: all
touch `src/ui/App.tsx` and `src/server.ts`.

## Architectural decisions (pre-made by the orchestrator; builders follow, don't re-litigate)

1. **Trajectory data source — a public projection, not a UI-polled capability.** A new public
   `session-trace` projection folds the session's run events (`session.turn.started`,
   `tool.call.started/completed/failed`, `message.completed`, `run.failed`, plan/subagent/approval
   events, plus the kernel's `run.invocation` events) into per-session step rows keyed by
   `trace/<sessionId>`; the UI subscribes with the existing `useProjection` hook, so the tab is live
   during a run and correct after a reload with no refetch protocol. Model-request detail (system
   prompt, message list) comes from the kernel-recorded `run.invocation` payloads if they carry the
   messages (J-CFG's payload-scan test implies invocation inputs are recorded); if not,
   `agent.coding` gains a `model.requested` emit (domain event, no special casing). Per-step timing
   is `recordedAt` deltas between started/completed events; the Schema tab renders the app's own
   `TOOL_DEFS` entry for the tool.
2. **RealityTrace wiring — the runtime's generic hook, adapter unmodified.** `startServer` passes
   `createRuntime({ outboxFor })` mapping trace-worthy event types to
   `observationIntent(event, { classification, capabilityId })` (the kernel hook is
   domain-independent; only the app decides which events are observations). An
   `ObservationDelivery` over `runtime.store` with `createSxrCliPort({ bin: .tmp/realitytrace/bin/realitytrace
   (v0.3.0 pinned release), repoDir, env })` drains in the background from boot after
   `port.prepare()`. Delivery status is read by the UI through a **capability**
   (`observation.status`-style, `client.invoke`, unrecorded — like `model.configure`), **not a
   projection**: receipts live in the DurableStore `observations` collection, not the event log,
   and a projection only ever sees events. The SXR record drill-down uses the port's
   `readCorrelation(targetRef)`. Tests isolate SXR state with per-test `XDG_DATA_HOME` /
   `XDG_STATE_HOME` (the phase-0 fixture's pattern).
3. **Permission mode — settings default + per-session composer override.** Settings → General →
   Permission stores the default access mode for new sessions (reference default: Workspace Write).
   The composer's currently-inert access-mode dropdown becomes functional: per-session value,
   passed through the existing `AgentCodingInput.mode` into `approvalGate`; the `sessions`
   projection folds the session's current mode from run inputs (it already folds `mode: "ptc"`).
4. **aimock fixture strategy.** The existing `[[scenario:<name>]]` markers stay the match keys —
   aimock's `match.userMessage` is a substring match on the last user turn. Multi-round tool loops
   (read → bash → edit → answer) use `toolCallId`-anchored follow-up fixtures ordered before the
   leg-1 fixture (leg 1 gated `hasToolResult: false`), with stable fixture-authored tool-call ids.
   `error` uses aimock's `error` response; `retry` uses `sequenceIndex` variants (fresh llmock
   process per test keeps counters clean); `interrupt` relies on aimock's SSE streaming. The
   `/__abort-count` probe is replaced by app-level cancellation evidence (run cancelled, stream
   stopped) plus llmock's stdout/journal if it logs aborted requests.
5. **Scope guardrails.** The workspace *chooser* stays the app's path-input dialog (the reference's
   full directory-browser dialog is out of scope this pass — noted as a deviation). No
   `deepseek-harness` import of any kind; icons stay original inline SVGs; all new copy is
   Cognate's own.

## Known risks (builders must verify, not assume)

- **aimock matches the *last* user turn.** The app appends synthetic user context messages
  (subagent completions) *after* the human message; the old mock scanned backwards for the last
  marker-bearing message, aimock may not. If the `delegate` second-turn fixture misses, adjust the
  fixture's match key (e.g. match on the synthetic text or a marker inside it) — do not change the
  app's history semantics to suit the mock.
- **llmock streaming latency** for the cancel-mid-stream test may differ from the old mock's
  `MOCK_CHUNK_DELAY_MS`; if the stream completes before the test can cancel, cancel on first
  progress event rather than adding artificial delay to the app.
- **`run.invocation` payload shape** (does it carry full messages?): verify against the SQLite
  `payloads` table before building the trace rows on it.
- **SXR CLI latency**: `createSxrCliPort` spawns a process per ingest; with per-tool-call
  observations a busy session may outrun delivery. Delivery is at-least-once background — the UI
  must render "pending" states, and tests must await drain (`runtime.idle()` does not cover the
  adapter's own dispatcher; drain explicitly or poll status).

## Journey tests (added in their tranches, run against aimock)

- `J-AIM` (U1): provider round-trip through llmock — fixture-matched completion, tool-call
  round-trip, no-match behavior surfaced as an error (never silent).
- `J-SET` (U2): every General setting durable across full server restart; Permission default
  changes approval behavior end-to-end; Coding Tools toggle hides/shows the Trajectory tab;
  Font size / Send-while-busy honored in the UI.
- `J-WS2` (U3): two workspaces added, sessions nested per workspace, switch + composer gating +
  persistence across restart.
- `J-PLG` (U4): plugin/preset panels open, state changes durable, effects per U0 characterization.
- `J-T` (U5): multi-tool session → Trajectory tab shows system/user/assistant/tool rows with
  payloads/results/timings; inspector tabs (Summary/Payload/Result/Schema/Timing) populated;
  survives reload from durable events.
- `J-RT` (U6): after a tool run, observations delivered to SXR (accepted receipts + ledger
  positions visible in the inspector); drill-down returns the CEP `extensions.cognate`; with SXR
  unreachable the trace view still works and deliveries retry/poison per adapter contract.

## No commits unless the operator asks; all work lands in the working tree on `cognate/harness`.

## Builder briefs (dispatch-ready; each builder reads this plan + the cited matrix sections)

Common rules for every builder: follow `AGENTS.md`; no git commits; no modifications to
`.tmp/ref/deepseek-harness`, `fixtures/aimock/`, `reference*/`, or `packages/*` (kernel/framework
code is off-limits — a needed general primitive is an orchestrator decision, report it instead);
new capabilities bind to new `.sea` entities via the existing `bindTranche*` pattern in
`domain/index.ts` (add `bindUsage*`), revalidate the model, update `BINDINGS.md`; visuals follow
`DESIGN.md` (Cobalt) — structure follows the reference; all copy is Cognate's own (never DeepSeek
text verbatim except tool names/fixture texts tests assert on); icons are original inline SVGs.
Verify with `cd validation/reconstructions/deepseek-harness/cognate && bun test test &&
bun run typecheck` (24 tests must stay green plus your new ones). The simulated OpenAI endpoint is
aimock (`bootAimock()` in `test/helpers.ts`, fixtures at `fixtures/aimock/fixtures.json` — add
fixtures there if a new journey needs a scripted reply, keeping existing entries byte-identical).

### U2 — Settings → General full inventory + Permission mode (matrix §11, checkpoints 22*)

- Extend the settings plumbing exactly like Work details did: `settings.changed` events via
  `agent.config` (`src/agents/agentConfig.ts`), folded by the `settings` projection
  (`src/projections/settings.ts`) into the single `current` row; a `settings.change*` client-invoke
  capability per setting group (see `src/capabilities/settingsChange.ts`). The `settings` row
  currently holds `{ workDetails }` — extend to `{ workDetails, permission, language, fontSize,
  performanceDetail, codingTools, sendBehavior }` (theme stays as-is: it is UI-local via
  `useTheme`? NO — check how theme persists today; if it is localStorage-only, move it into the
  same durable settings row, matching the reference's persisted Appearance).
- Settings → General UI (`SettingsModels`/General pane in `src/ui/App.tsx`): add every §11 control
  with the reference's structure — Permission (menu: Read Only / Workspace Write / Full access,
  default Workspace Write; **selecting Full access opens the confirmation dialog** with the risk
  paragraph, an "I understand…" checkbox, Cancel/Enable disabled-until-checked), Language (中文 /
  English, default English — the app has no i18n strings, so the setting is durable + displayed
  but only English copy exists; document as a deviation), Appearance (Light/Dark/System — System
  is new), Font size (1px stepper, default 14, floor 12, "Only affects conversation content" —
  apply to message content font-size), Performance & usage detail (Compact/Detailed, default
  Detailed), Coding Tools (switch, default on, gates the Trajectory tab), Keyboard shortcuts
  (dialog: searchable list of actions with current bindings + Edit buttons; the app's real
  bindings only — do not invent actions that do not exist), Send behavior while busy (Queue /
  Steer, default Queue).
- **Permission wiring (behavioral)**: the settings default applies to NEW sessions; the composer's
  currently-inert access-mode dropdown becomes functional — per-session value passed through the
  existing `AgentCodingInput.mode` into `approvalGate` (`src/domain/approvalGate.ts`); the
  `sessions` projection folds the session's current access mode from run inputs (it already folds
  `mode: "ptc"`). Send-while-busy: Queue = a send during an active run is queued and dispatched
  when the run settles; Steer = the send interrupts/steers (cancel + new turn) — implement the
  Queue behavior fully; Steer may compose cancel+send if cheap, else disable with
  `title={NOT_IMPLEMENTED}` and record the deviation.
- Journey test `J-SET-settings.test.ts`: every setting durable across a full server restart
  (`app.stop()` + fresh `startServer()` on the same home); permission default changes approval
  behavior end-to-end (default Read Only + approval scenario ⇒ escalation ask; default Workspace
  Write ⇒ no ask); Coding Tools off hides the Trajectory tab (once U5 lands — until then assert
  the setting's durability only); font size floor; Full-access confirm flow.

### U3 — Sidebar Workspaces section (matrix §12, checkpoints 23*)

- Sidebar (`src/ui/App.tsx` + `app.css`): render ALL workspaces from the `workspaces` projection
  (not just current) as expandable treeitems with their sessions nested (sessions projection has
  `workspaceId`); Workspaces header gains the reference's controls: "Search sessions" (textbox +
  Clear, filters session names live), "View options" (menu: Group by WorkSpace/Workspace
  Tree/In one list; Order by Manual/Last updated; Filter sessions Hide archived/All — implement
  grouping=Workspace Tree + Order by Last updated for real; the other options may be present-but-
  inert with `title={NOT_IMPLEMENTED}` + deviation note), "Add workspace" (opens the existing
  `WorkspaceChooser` path-input dialog — the reference's full directory browser is OUT OF SCOPE,
  already a recorded deviation).
- The composer-area "Choose workspace" button: with ≥1 workspace, opens a dropdown menu of added
  workspaces + "Add workspace…" (reuses the chooser); selecting switches the active workspace
  (invoke `workspace.select`) and lands on a fresh session in it.
- Per-workspace hover actions: "Workspace actions for <name>" menu (Rename / Delete workspace) +
  "New session in <name>". Rename = durable title change (`agent.config` event + projection —
  extend the workspaces projection with a `workspace.renamed` event). Delete workspace = removes
  the record from the sidebar (durable event; sessions of a deleted workspace disappear from the
  list — their events stay in history); deleting the ACTIVE workspace falls back to no-workspace
  state. Both are new `agent.config` commands.
- Journey test `J-WS2-multi-workspace.test.ts`: two workspaces via `workspace.select`, sessions
  nested per workspace, switch via the composer dropdown, per-workspace session filtering,
  rename + delete durable across restart, composer gating per workspace.

### U4 — Built-in plugins + Agent presets panels (matrix §14–15, checkpoints 25*, 26*)

- Settings → Built-in plugins: heading + description, "Search plugins", two collapsible sections
  (Session plugins — "Composed per session by agent presets · N plugins" with a preset-inspect
  dropdown; Global plugins — "Shared by the system and every session · N plugins"). Content is
  this app's OWN plugin inventory, honestly derived: the app's real capabilities/components are
  the "plugins" (model provider, tool.read/edit/bash/run_code, todo/plan, subagent, session
  history, workspace…). Each entry: name, Enabled/Disabled state, one-line description, code id.
  No enable/disable toggling of real capabilities this pass — entries are informational (inspect
  only), matching the reference's panel being primarily an inspector; record the deviation.
- Sidebar "Plugins" global panel (the inert `Global panels` nav button — re-add it if the redesign
  dropped it): heading "Plugins", "Add and manage plugins", Refresh + Add plugin (inert,
  NOT_IMPLEMENTED), "Official" section with a small honest list of this app's optional/roadmap
  plugin-like features each with a "View <Name>" button (inert detail) + Enable switch where a
  real toggleable behavior exists — if none is genuinely toggleable, render the switches inert
  with NOT_IMPLEMENTED and record the deviation. Do NOT copy the reference's 7 official plugins'
  descriptions.
- Settings → Agent presets: panel with preset cards (Standard mode `standard`, PTC mode `ptc`,
  Minimal mode `minimal` — this app's real modes; the reference's Creator mode is out of scope).
  Card: name, badge (New task default / Built-in), code id, original description; "Set as new
  task default: <name>" (durable via settings), "Mode details" (dialog with original copy),
  "View configuration" (dialog showing this app's own real composition — the capabilities/tools
  the preset enables, NOT the reference's YAML). The in-session preset selector (composer area
  button "<current> mode") becomes functional: switches the session's preset (durable per
  session, feeds `agent.coding` like `mode` does; PTC = the existing ptc tool registration,
  Minimal = tools reduced to bash only — check `agentCoding.ts`'s TOOL_DEFS wiring; if Minimal
  cannot be expressed without app changes, keep it present-but-inert with a deviation).
- Journey test `J-PLG-panels.test.ts`: panels open with the right structure; preset default
  change durable across restart; preset switch changes the session's mode badge and (PTC) the
  approval behavior.

### U5 — Developer tools: Trajectory tab + step inspector (matrix §13, checkpoints 24*)

- New public projection `session-trace` (`src/projections/sessionTrace.ts`): folds a session's
  events into per-session trace rows keyed `trace/<sessionId>`. Row kinds mirroring the reference:
  SYSTEM (from the first `model.generate` invocation's input.messages[0] where role=system — the
  kernel records full invocation `input`/`result` payloads in `run.invocation` events, verified),
  USER (from `session.turn.started`), CONTEXT (any system-reminder-style messages the app appends,
  if the app sends none, this kind simply never appears — do not invent), ASSISTANT Request rows
  (one per `model.generate` invocation: index #N, status from the invocation result/failure,
  provider/model from the model-config at that point or the invocation input), TOOL rows (from
  `tool.call.started`/`completed`/`failed`: tool name, args, result, timing via recordedAt
  deltas). Include per-row timing (startedAt, durationMs) and step/turn indices. Live updates via
  the existing `useProjection` hook (same as sessions/plans).
- UI: session header gains the Chat/Trajectory `tablist` (gated by the Coding Tools setting from
  U2 — coordinate; if U2 has not landed, gate on the settings row with a local default-on and
  leave a TODO-free fallback: read `settings.current.codingTools ?? true`). Trajectory view:
  toolbar (Duration toggle, Collapse turns, Collapse calls, Search trajectory), a timeline
  region (CSS bars per row using durationMs — Cobalt styling), and the role-badged trace table
  (SYSTEM/USER/CONTEXT/ASSISTANT/TOOL badges, Request #N buttons, `tool{args} → result` cells).
  Selecting a TOOL row or Request button opens the right-hand "Event details" panel (reuse the
  `right-panel` aside shell): TOOL tabs Summary/Payload/Result/Schema/Timing (Schema renders the
  app's own `TOOL_DEFS` entry; Payload/Result from the trace row; Summary has Hierarchy→parent
  request + Status; Timing from recordedAt) and Request tabs Summary/Options/Usage/Timing
  (Options = the invocation input minus messages; Usage from the response usage if the provider
  returns it, else honest zeros; Timing from recordedAt deltas). Resizable split is nice-to-have;
  a fixed-width panel is acceptable (deviation note).
- Journey test `J-T-trajectory.test.ts`: run `[[scenario:aim-tool]]` (or multi) → trace rows
  exist with system prompt, user message, request rows, tool row with payload/result; inspector
  tabs populate; trace survives a reload/reopen from durable events (re-open session and
  re-subscribe); live mid-run rows appear (poll projection during a slow interrupt fixture).
- The mock fixture for a dedicated trace journey may be added to `fixtures/aimock/fixtures.json`
  (e.g. `[[scenario:trace]]` = read + final answer) — keep existing fixtures byte-identical.

### U6 — RealityTrace enrichment, Option A (operator decision 2026-09-29)

- `src/server.ts`: pass `outboxFor` to `createRuntime` mapping trace-worthy events to
  `observationIntent(event, { classification, capabilityId })` — cover `tool.call.started`,
  `tool.call.completed`, `tool.call.failed`, `message.completed`, `run.failed` (classification
  "durable_fact"; keep the mapping in a small new `src/observations.ts`). Then construct
  `createSxrCliPort({ bin, repoDir, env })` + `new ObservationDelivery(runtime.store, { port,
  backoff })` and drain in a background loop from boot (after `port.prepare({ title })`). The
  pinned binary: `.tmp/realitytrace/bin/realitytrace` (v0.3.0, installed by `just
  setup-realitytrace`); make the path overridable via env (`SXR_BIN`), and if absent, log a
  warning and run a no-op port (dev machines without the binary must still boot — traces work,
  observations show "not configured").
- New capability `observation.status` (client-invoke, unrecorded, like `model.configure`):
  returns per-eventId observation status from `delivery.status(eventId)` (observationId, state
  accepted/duplicate/retrying/failed, targetRef = ledger position, attempts) for the events of a
  given session/run — the UI joins trace rows to their receipts by eventId.
- Inspector enrichment: in U5's "Event details" panel, add a RealityTrace section on Summary (or
  its own tab — follow DESIGN.md's structure) showing the observation state + ledger position,
  with a "View SXR record" drill-down invoking a `observation.record` capability that calls the
  port's `readCorrelation(targetRef)` and shows the CEP `extensions.cognate` JSON.
- Journey test `J-RT-realitytrace.test.ts`: boot with the real SXR binary (skip-free: FAIL if
  SXR_BIN is missing, mirroring the phase-0 fixture contract) + isolated XDG_DATA_HOME/
  XDG_STATE_HOME temp dirs; run a tool session; await delivery drain (poll `observation.status`
  — do not rely on `runtime.idle()`); assert accepted receipts + ledger positions for the tool
  events; assert the drill-down returns the correlation ids; assert a trace view still renders
  while delivery is pending/failing (stop the SXR repo mid-test or point at a bad bin — the
  at-least-once retry/poison path per the adapter contract).

### U7 — wrap-up (orchestrator-executed)

Remove `fixtures/mock-model/` (+ its test) and fix dangling references (`reference.capture.ts`
header note, `fixtures/README.md`); update APP `README.md` (new surfaces), `DEVIATIONS.md`
(behavioral deviations of U2–U6 incl. the scoped-out items), `PRODUCT.md`, `BINDINGS.md`;
append the YAML status snapshot + Markdown view; `just verify` at the repo root; final report.
