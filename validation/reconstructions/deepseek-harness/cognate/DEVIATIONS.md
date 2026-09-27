# Deviations from the pinned DeepSeek Harness reference (tranche T5b)

> **Note (2026-09-27):** the entries below describe divergence up through the settled
> reconstruction. From this point forward the app's *visual* identity is deliberately diverging
> further under an independent Hallmark/Impeccable redesign — see
> `.agents/evidence/2026-09-27-deepseek-harness-redesign-decision.md` and the new `DESIGN.md` this
> redesign introduces. New visual divergence is a product decision recorded in `DESIGN.md`, not a
> tranche deviation to log here; this file remains the record of *behavioral*/structural deviations.

This file records every place the Cognate reconstruction's UI is intentionally different from, or
inert relative to, the pinned reference — either because the underlying feature is out of scope
for this tranche, or because reproducing the reference exactly would mean copying DeepSeek's own
content/branding. Structural parity is still intentional: every control listed below is present in
the DOM/aria tree with the reference's accessible name, just disabled (`title="Not implemented in
this tranche — see APP/DEVIATIONS.md"`), so `tests/visual/compare.ts` diffs are content differences,
not missing-control differences. See `diffs/summary.md` for the measured per-checkpoint pixel-diff
evidence this file explains.

## First-run dialog pair (fixed — critic round-1 P0-1)

A Cognate-branded "Internal Testing Notice" dialog (heading + two paragraphs + "Continue") and an
"Add an API key to get started" dialog ("Configure later"/"Save and continue", disabled until a key
is entered) now appear on a fresh `COGNATE_HARNESS_HOME`, matching the reference's structure/roles
with Cognate's own wording (not DeepSeek's copy — see the spec's brand-substitution allowance).
Dismissal is durable per-home: `onboarding.dismiss` (`src/capabilities/onboardingDismiss.ts`) records
an `onboarding.dismissed` event via `agent.config`, folded by the `onboarding` projection
(`src/projections/onboarding.ts`); absence of a dismissal row is what makes the pair reappear on a
fresh home. "Save and continue" dismisses the apikey step the same as "Configure later" — this
tranche has no default/preset provider to key-only configure (no DeepSeek-branded "official"
provider), so the entered key is not persisted from this dialog; full provider setup happens in
Settings → Models afterward. This was not an observed reference behavior for this specific case — an
assumption, not a reproduction.

## Settings > Models provider list + add-provider wizard (fixed — critic round-1 P0-4/P1-4)

`SettingsModels` (`src/ui/App.tsx`) now has a provider-list view (a card for the configured
provider, or an empty state, plus "+ Add model provider") and a two-tab "Add model provider" wizard
("Third-party model provider" / "Custom model API"), matching the reference's structure and button
labels (list view: Cancel/Apply on the API-key row; wizard: Cancel/Create provider) — checkpoints
02/02b/02c/02d. The "Third-party model provider" tab's combobox is a small, original list of generic
OpenAI-compatible provider presets (OpenAI, OpenRouter, Azure OpenAI, Groq, Mistral, Together AI,
Fireworks) — deliberately not a copy of the reference's ~35-entry DeepSeek-branded provider list;
picking one pre-fills the Custom model API tab's fields. This tranche's backend (`model.configure`)
still only ever holds one live provider config (the `model-config` projection's single `"current"`
row), so: "Edit" reopens the wizard prefilled from that config; "Delete" is present with the
reference's accessible-name pattern but disabled (no backend "unconfigure" capability this tranche —
same "control present, feature stubbed" pattern used throughout this app); the Models sub-list
supports multiple rows in the UI (Add model, per-row Model ID/display name, the P0-4 validation rule)
but only the first row is actually wired through to `model.configure`'s single `model` field;
"Fetch available models" is present (disabled until Base URL is set) but disabled outright — no live
provider introspection capability exists this tranche. The write-only API key contract is unchanged:
reopening Edit never shows the plaintext key back, only a "Configured — enter a new value to replace"
placeholder (checkpoint 02d). An "Open configuration file" link is present in the titlebar (critic
round-1 P1-1), disabled — no OS file-reveal capability this tranche.

## Settings General / Built-in plugins / Agent presets — inert nav items

Present in the Settings left nav with the reference's exact labels (aria: `button "General"`,
`"Models"`, `"Built-in plugins"`, `"Agent presets"`). `Built-in plugins`/`Agent presets` remain
disabled stubs. `General` is now live (critic round-2 batch A cross-cutting P2): it holds the
Appearance section (`Light`/`Dark` theme buttons) that used to be a persistent sidebar footer
control with no reference counterpart — the reference switches theme via Settings → General →
Appearance (`tests/capture/reference.capture.ts`'s `20-theme-variant` step), not a standing sidebar
toggle, so the sidebar control was removed and the switch moved here to match.

## Sidebar "Plugins" global panel — inert

`nav[aria-label="Global panels"] > button[aria-label="Plugins"]` is present and disabled. No plugin
system in this tranche.

## Session header actions — inert

"Open in Files", "More ways to open", "More actions" (`…`), and "Open right sidebar" are present
with the reference's accessible names but disabled — no file-open integration, no right sidebar/
inspector panel in this tranche.

## Trajectory tab — inert

`tablist` has both `tab "Chat"` (selected, functional) and `tab "Trajectory"` (present, disabled).
No trajectory/step-inspector view in this tranche.

## Message action row — Good/Bad response, Branch, Usage are inert or static

Copy (functional, uses `navigator.clipboard`), Good response / Bad response / Branch into a new
conversation are present with the reference's accessible names but disabled — no feedback or
conversation-branching backend in this tranche. "Usage 0 tok" is a static placeholder chip (no
token-usage accounting is computed).

## Composer permission-mode and model dropdowns — inert, single-value

`button[aria-label="Access mode, current: Workspace Write"]` and `button[aria-label="Select model,
current <model>"]` are present with the reference's accessible-name pattern but disabled — there is
only one implicit access mode and the currently-configured model in this tranche, so there is
nothing to switch between yet.

## Composer stats footer — static

"`N turns N steps · N tok/s`" and "`N% of context used`" are present in the reference's position and
wording pattern but always render `0 turns 0 steps · 0 tok/s` / `0% of context used` — no
turn/step/token/context accounting is implemented. Wiring this to real per-run counts is a backend
change; tracked here rather than done silently.

## Session title source (fixed — critic round-1 P0-3)

Confirmed against `reference/observations/aria/06-user-message.desktop.txt` and
`08-tool-running.desktop.txt` (not just the *completed*-session dump this tranche originally checked):
the reference's sidebar session-tree label is the literal first **human message** text, verbatim
(truncated), set at the moment the turn starts — not the assistant's answer, and not delayed until
the run completes. `src/projections/sessions.ts` now sets the title from `session.turn.started`'s
message text immediately, and `message.completed` no longer overwrites it. Tests
`J-B-basic-session.test.ts` and `J-G-persistence.test.ts` were updated accordingly. The reference's
`all-prompts` LLM-re-titling cadence (a separate, observed model request — see
`reference-behavior-matrix.md` §0/§4) was not observed to visibly replace this literal-text title
within the pinned pass's timeframe, so a second titling call is still not implemented — every session
keeps its literal-first-message title for its lifetime; this is a documented assumption, not a gap
the evidence contradicts.

## Cancel/error presentation — implemented, not reference-identical

`client.cancelRun()` is wired to a "Stop" button shown in place of "Send message" while a run
streams; a cancelled run appends a small centered "Stopped" system row (no reference equivalent
observed to copy exactly — the reference's own "Stop"-labelled control was not confirmed against
the pinned build per `reference-behavior-matrix.md`). A failed run renders the assistant row with a
red status dot and a `role="alert"`-free error-tinted body ("Something went wrong…") rather than the
reference's still-unconfirmed error-row chrome.

## Approval-gate access mode is a fixed default, not wired to the composer dropdown (T7-T8)

`approvalGate` (`src/domain/approvalGate.ts`) compares a `run_code` call's requested
`sandbox_permissions` against the session's access mode, ranked `read-only < workspace-write <
full-access` — this is the real reference comparison (per updated
`reference-behavior-matrix.md` §6: approval fires when the requested permission ranks above the
current access mode). Since the composer's access-mode dropdown is still inert/display-only this
tranche (see "Composer permission-mode and model dropdowns" above), `agent.coding` defaults `mode`
to `"read-only"` when the caller doesn't pass one — the conservative default that matches the
reference's own observed mode during its approval scenario (`Access mode, current: Read Only` in
`12-approval-resolved-allow`/`-deny`). `AgentCodingInput.mode` exists so a later tranche can plumb
the dropdown's real value through without changing the gate.

## Pending approvals survive a full server restart; the reference does not (T8)

Confirmed by re-reading `reference-behavior-matrix.md` after this pass started: the reference keeps
a pending approval across a page *reload*, but **not** across a full process restart — after a
restart it silently finalizes the turn as "Worked", with no approval card and no answer text. This
reconstruction deliberately does not reproduce that: a Cognate run's open continuations are durable
by construction (SQLite-backed `run.waiting`/`continuation` state), and treating durable event
history as authoritative is a project invariant this reconstruction does not want to break to match
a reference implementation detail that looks like data loss. `test/J-D-approval.test.ts` ("a pending
approval survives a full server restart") asserts Cognate's actual (durable) behavior — the
continuation is still `OPEN` and the run still `waiting` after a full `app.stop()` + fresh
`startServer()` against the same SQLite store, and resolving it then still completes the run. Note
this required one supporting fix: `src/server.ts` now re-mounts the last-configured model provider
on boot from the persisted `model-config` projection (previously only `model.configure` mounted a
provider), because a run resumed after a restart needs a live `model.generate` provider to finish.

## `run_code`'s sandbox is an original harness, not the reference's dsh-tools sandbox (T7)

The reference's `run_code` (`packages/core/tools/src/ptc.ts`, not read/copied) executes an
arbitrary JS snippet in a real sandbox exposing a `tools` object. This reconstruction's
`tool.run_code` (`src/capabilities/tools.ts`) runs the model-supplied `code` as a `bun -e`
subprocess wrapped in a small, original harness that defines `tools.bash` in terms of this same
app's `tool.bash` execution path — enough to run the fixture's exact `run_code` snippet
(`await tools.bash({ command: 'rm -rf /tmp/scratch-cache', ... })`) faithfully, not a general
reproduction of the reference's sandbox/permission model (no filesystem/network sandboxing beyond
this app's own workspace-path containment).

## `08-tool-running` may land on an already-completed frame (T7)

Each `read`/`bash`/`edit` invocation in this reconstruction resolves against the local filesystem
in well under a millisecond (no real process spawn latency beyond `bash`'s own near-instant exit,
no network filesystem) — so the window where a given tool call's UI state is genuinely `"running"`
(after `tool.call.started`, before `tool.call.completed`) is only as wide as one local
event round trip, not the reference's real backend tool latency (a few seconds per turn, per
`08-tool-running`'s aria: `button "Deep diving for 1s"`). `tests/capture/cognate.capture.ts`
best-effort-polls for `.tool-activity-btn` before capturing "08-tool-running", but on a fast
machine the run can finish before that poll observes a running frame, so the checkpoint sometimes
shows the same completed state as "09-tool-complete" instead of a genuine mid-run frame. This is a
timing/nature difference, not a missing feature — the running-state UI itself (verified separately
by capturing while an *approval* is pending, which genuinely blocks for a human decision and is
stably reproducible, e.g. `11-approval-pending`) is correct. Not fixed by adding an artificial delay
to the tool capabilities themselves, which would misrepresent this app's real (fast, local) tool
latency for a screenshot's sake.

## Plan mode (T9)

- **`13-plan-active` lands past the intended `todo_write`-only frame.** The reference's
  `13-plan-active` shows a mid-`todo_write` frame (`button "Updating the plan · todo_write"`, no
  review card yet). The mock model's `plan` script runs `todo_write` then `exit_plan_mode` back to
  back with no real latency between them (same root cause as "`08-tool-running` may land on an
  already-completed frame" above), so by the time `tests/capture/cognate.capture.ts` observes the
  `todo_write` activity label and takes the screenshot, `exit_plan_mode` has often already opened the
  `plan-review` continuation — the capture ends up showing the same state as `13b`. The
  `13-plan-active`/`13b-plan-review-prompt` UI states are each individually correct and distinct
  (verified via `test/J-E-plan.test.ts`'s event-order assertions, which don't race a screenshot); this
  is a capture-timing artifact, not a missing or incorrect feature.
- **No right-sidebar plan tab.** The reference auto-opens the plan as its own tab in a right sidebar
  (title = plan heading, rendered markdown) alongside the review card/completed-session state. This
  tranche has no right sidebar at all — "Open right sidebar" is already inert (see above) — so the
  full plan is shown inline instead, via `PlanReviewCard`'s "View full plan" disclosure. This accounts
  for most of `13b-plan-review-prompt`/`13c-plan-completed`'s pixel diff (the reference's screenshot
  is wider, with a populated right pane; this app's right pane is simply absent).
- **"Open plan: `<title>`" is present but disabled.** The reference's completed-session standalone
  button linking back to the plan artifact (`13c-plan-completed`) is reproduced with the same
  accessible name pattern but disabled (`title={NOT_IMPLEMENTED}`) — no plan-artifact viewer in this
  tranche, consistent with the right-sidebar gap above.
- **"Request changes" wording is not reference-confirmed.** `reference-behavior-matrix.md` §6.3
  states this path "was not exercised this pass" against the pinned build. The tool-result text
  `planRequestChangesToolResult` (`src/domain/planGate.ts`) feeds back on denial is this app's own
  invention, shaped by `canonical-journey-catalog.md` `j_e_plan`'s step description rather than any
  observed string — `test/J-E-plan.test.ts` does not assert this path for the same reason (only
  Approve is exercised, matching the brief's stated test scope).
- **"Plan mode off." confirmation turn.** Toggling plan mode off (`"/plan off"`, or the composer's
  "Plan mode on, press to turn off" button) is handled by `agent.coding` as a pure control command:
  no model round trip, just a `plan.mode.changed` event and a short assistant-style confirmation
  message ("Plan mode off."). The reference's exact UI for this transition was not captured/observed
  this pass, so this exchange (and the composer toggle invoking a full new turn to produce it) is this
  app's own minimal design, not a reproduction.

## Subagents (T10)

Delegation is fire-and-forget, matching the reference exactly (reference-behavior-matrix.md §6.4):
`agent.coding` starts the child (`subagent.start`, this app's own capability —
`src/capabilities/subagentStart.ts`) and returns immediately with `Tool result: started subagent
<childRunId>`; there is no `ctx.waitFor` and no parent-side completion watcher (an earlier pass of
this tranche synchronously awaited the child and fed its answer back as the tool result, which does
not match the reference — corrected; `src/server.ts` no longer needs or contains a
`run_completion`-resolving watcher at all). The child's own completion is observed directly from its
own events (the `subagents` projection parses the `subagent:<parentRunId>:<toolCallId>` correlation
back off `message.completed`/`run.failed`, `src/projections/subagents.ts`), and durably "returns to
the parent" as a synthetic context message on the parent session's *next* turn
(`src/capabilities/sessionHistory.ts`), per the matrix's "the parent's next model turn ... would see
the child's result as its tool output."

- **`14-subagent-active` may already show the "N subagent(s)" banner.** Same root cause as the
  `08`/`13` timing notes above: `subagent.spawned` is recorded (and the banner becomes visible) as
  soon as the child run is *started*, which on this local mock setup can happen well before the
  capture script's poll for the "Coordinating subagents" activity label resolves. The reference's
  `14-subagent-active` does not yet show the banner at that point; this app's sometimes does. Content-
  timing artifact, not a missing/incorrect feature (`test/J-F-delegation.test.ts` asserts the actual
  event ordering without racing a screenshot).
- **"Open `<title>` in sidebar" opens a minimal, newly-built right panel, not a reused one.** No right
  sidebar existed anywhere in this app before this correction (`DEVIATIONS.md` previously listed
  "Open right sidebar" as fully inert) — there was nothing to reuse. `RightPanel`
  (`src/ui/App.tsx`) is a small new component populated entirely from the child's own `subagents` row
  (its delegated prompt + final answer as a two-message transcript), not a general session/transcript
  viewer — sufficient for a single-turn child, not a reproduction of the reference's own right-sidebar
  chrome (tabs, split/fullscreen/collapse controls) beyond a close button. Plan mode's "View full
  plan" (J-E-plan) is unchanged and still renders inline rather than in this panel.

## Cancellation and provider error/retry (T11)

Cancel and the runtime-level cancellation wiring (`RunContext.signal` -> the invocation's
`HandlerContext.signal` -> `streamingProviderComponent`'s `provider.stream(request, ctx.signal)` ->
`openAICompatible`'s `AbortSignal.any([...])` on the underlying `fetch`) already existed unchanged
from an earlier tranche (`src/components/modelProvider.ts`, `packages/kernel-cordis/src/lease.ts`,
`packages/provider-openai-compatible/src/index.ts`) — this pass only added the retry loop, the
sessions-projection folding of `run.cancelled`/`run.failed`, and the UI's failure/retry/stopped
rendering. `test/J-H-cancellation.test.ts` confirms the mock model server (a real, separate HTTP
process — see `test/helpers.ts`'s `bootMockModel`) actually observes the connection abort via a new
`GET /__abort-count` endpoint on `fixtures/mock-model/server.ts` (a counter incremented on the
request's `AbortSignal`, added because the mock always runs out-of-process, so a test cannot import
its in-memory state directly).

- **Provider-error code mapping is text-based, not status-based, by construction.** Only
  `InvocationFailedError.failure.message` survives the kernel's JSON boundary for a handler that
  throws — `packages/runtime-bun/src/invoker.ts`'s `failureJson` reduces any `{ kind: "failed" }`
  failure to `{ kind: "failed", message: messageOf(error) }`, dropping `ModelProviderError`'s own
  `kind`/`status` fields entirely. `agentCoding.ts`'s `classifyModelFailure` therefore matches on the
  message text: `/timed out/i` maps to the reference's own observed `"Request timed out." / TIMEOUT`
  (reference-behavior-matrix.md §8); everything else — including this app's mock `[[scenario:error]]`
  path, a scripted HTTP 500 — maps to an honest, non-invented `"Internal server error" / HTTP_500`
  rather than fabricating a timeout that didn't happen. `18-error`'s capture and
  `J-H-provider-error.test.ts` both exercise the HTTP 500 path (this app's mock has no timeout
  scenario), not the reference's network-timeout trigger.
- **Retry backoff is real but short, and configurable only via `MODEL_RETRY_BACKOFF_MS`.** The
  reference's own timing (~90s for the full 5-attempt budget) is not reproduced; `DEFAULT_RETRY_BACKOFF_MS`
  is 300ms (capture/manual use), and the test suite overrides it to 10-150ms per test via the env var
  so `bun test` stays fast. The retry *count* (5) and event shape are unaffected by this.
- **Cancelled-turn history.** Whether a cancelled turn's partial reply should be fed back into the
  next turn's `session.history` model context is not documented in reference-behavior-matrix.md. This
  app does not synthesize one: `session.history` (`src/capabilities/sessionHistory.ts`) already only
  appends an assistant message `if (run.status === "completed")`, so a cancelled run contributes just
  its user message, unchanged, to history — the partial text stays visible only in the live UI
  transcript for that browser session (via `run.invocation.progress` events), not restored after a
  reload/history refetch. Documented as an assumption per the tranche brief, not fixed by adding a
  cancelled-partial-text capability.
- **No manual "Retry"/"Dismiss" on a failed turn**, matching the reference exactly
  (reference-behavior-matrix.md §8: "No manual 'Retry' or 'Dismiss' button is shown on the failed turn
  itself") — the composer remains available underneath to start a new message.
- **The retry disclosure's expanded content is this app's own minimal rendering** (one line per
  recorded attempt: "Attempt k/5: `<message>` (`<CODE>`)") — the reference's own expanded-state
  content for `"Retried model request (k/5)"` was not captured, so this is not a reproduction, similar
  in spirit to the To-dos widget's expanded list (T9 section above).
- **Composer "Stop generating" aria-label matches the reference exactly**
  (reference-behavior-matrix.md §7 — `button "Stop generating"`, resolved via role/name query); an
  earlier pass of this tranche used the shorter, non-matching label `"Stop"` — corrected.

## Icons

All icons (`src/ui/icons.tsx`) are original inline SVGs drawn for this reconstruction — simple
monochrome line glyphs, not visual copies of the reference's iconography.

## Round-2 critic fixes (see `critic/round-2-disposition.md` for the full item-by-item list)

New in this pass, all still governed by durable events/projections:

- **Review split-diff panel** (`ReviewPanel` in `src/ui/App.tsx`): "Edited `<file>` +N -M" now opens a
  real right-hand pane beside the chat (reusing the same `<aside class="right-panel">` shell the
  subagent child view already used) — tab strip (`Review · turn N` + close + disabled "+"), a
  list/split/code toolbar, and a two-column diff with a line-number gutter and one `@@` hunk header
  (`diffHunk()` derives gutter numbers/hunk bounds from the existing `EditSummary.diffLines`, no new
  domain data). Geometry per product-characterization.md §2 (min 300px / max 70% / default 45vw).
  Previously this was an inline diff card inside the message body — removed.
- **"Into the Unknown" hero landing** (`HeroLanding`): a selected workspace with zero messages in the
  active session now renders the centered landing (logo, heading, Preview badge, workspace/mode
  pills, centered composer, no tab bar) instead of jumping straight to the tabbed session chrome.
- **Header mode badge is a real per-session field**: `sessions` projection now sets `mode: "ptc"` the
  first time a session's run emits `tool.approval.requested`, sticky afterward; the header shows "PTC
  mode" for those sessions, "Standard mode" otherwise (was a hardcoded string).
- **Subagent popover anchors under the header** (`.subagent-count-wrap`/`.subagent-tree` in
  `app.css`), not as a bottom banner above the composer.
- **Accent color audit (critic round-3 P0/P1 — corrects this entry's earlier blanket claim):** the
  reference does not use one accent hue for every primary/active element. Pixel-sampled from
  `reference/screenshots/desktop/{01-first-launch,02-model-settings,07-streaming,11-approval-
  pending,15-completed-session}.png`:
  - Near-black/gray (`--cg-accent`, `#1b1d22` light / `#ececee` dark) is correct for modal/approval
    CTA buttons only — "Continue", "Apply", "Allow once" (samples to `#0f1115`-ish).
  - The composer send/stop button and the active-tab underline are a separate **blue**
    (`--cg-accent-interactive`, sampled `#4176e6`) — round-2's retone had incorrectly pulled these
    onto the near-black token too; split out in `src/ui/app.css`.
  - The user-message bubble is its own **light lavender fill with dark text**
    (`--cg-message-bubble-bg: #edf3fe`, `--cg-message-bubble-text`), sampled from
    `15-completed-session.png` — round-2's retone had also pulled the bubble onto near-black
    (`--cg-accent`), which this DEVIATIONS.md previously and incorrectly described as "matching the
    reference." Fixed in `.message-bubble` (`src/ui/app.css`).
  - `--cg-active` (low-alpha near-black, e.g. `rgba(27,29,34,0.08)`) was already correct as-is — at
    that opacity over a white surface it renders as the same light neutral gray the reference's
    active session row uses (`#eceef0`-ish); no change needed there.
  Sidebar "Workspaces" label is sentence-case/regular-weight, not small-caps/bold (unchanged, still
  accurate).
- **02-model-settings checkpoint pairing (P1, accepted, not fixed):** the reference's own
  `02-model-settings` capture happens to already show a configured-provider card (a pre-existing
  config carried into that capture run), while Cognate's `02` is a genuinely fresh, unconfigured
  first visit (the only state consistent with `01`/`03` needing no model configured yet). Both states
  are individually correct per this app's own lifecycle — `02d-model-settings-redacted-key` already
  demonstrates the configured-provider card layout side-by-side with the reference's equivalent.
  Reordering the capture script to pre-configure a provider before `02` would corrupt `01`/`03`'s
  required unconfigured state, so this is left as a documented capture-sequencing difference, not
  reworked.

## Round-3 critic fixes

- **In-chat file-change control is now a file-icon card**, not a text pill: `EditDiff` (`src/ui/
  App.tsx`) renders a `FileIcon`, an "Edited `<file>`" heading line, and a "+N -M" stat line inside a
  bordered card (`.edit-diff-card` in `app.css`), matching `reference/screenshots/*/10-file-change-
  expanded.png`. The accessible name (`View changes to <path>: Edited <file> +N -M`) is preserved via
  `aria-label` on the button.
- **Review panel toolbar controls added, several inert by design (feature out of scope this
  tranche):** matching `reference/observations/aria/10-file-change-expanded.desktop.txt`'s tab-strip
  and toolbar rows —
  - Tab-strip row: `Split`, `Fullscreen`, `Collapse right sidebar` icon buttons are now present next
    to "Add tab", but **inert** (`disabled`, `title={NOT_IMPLEMENTED}`) — this tranche has no
    multi-pane layout engine, real fullscreen, or a separate collapsible right sidebar to drive them.
  - Toolbar row: `Show file location` and `More ways to open` buttons are now present, also
    **inert** for the same reason (no file-location surface or external-open integration exists) —
    this matches the reference itself, which also shows both `[disabled]` in its own ARIA dump.
  - `Open <file> in sidebar` is now **enabled** (previously incorrectly disabled) — the reference
    leaves it enabled. Since this panel already *is* the file's sidebar view, the click is a no-op
    rather than a second navigation.
- **User-message bubble background/text color**: see the "Accent color audit" entry above.
- **Cancelled-turn status pill has no visual dot**: `.status-pill.status-cancelled` renders
  transparent/zero-size (was inheriting the default green `--cg-success` dot used for "Worked"); the
  accessible `role="status"` text ("Stopped") is unchanged. Reference's standalone "Stopped" line has
  no leading indicator (`19-cancelled.desktop.txt`).
- **Step counter now counts the model's own generation step, not just tool calls**: turn `stepCount`
  is `useToolTimeline(...).length + 1` (previously just the raw tool-call count) — the `+1` accounts
  for the generation/response step itself, present even with zero tool calls or on a turn cancelled
  mid-stream. Verified against every reference ARIA dump with a turns/steps footer (`{15-completed-
  session,19-cancelled}` 0 tools → "1 steps"; `12-approval-resolved-{allow,deny}` 1 tool → "2 steps";
  `13c-plan-completed` 2 tools → "3 steps"; `{09-tool-complete,10-file-change-*}` 3 tools → "4
  steps") — all now match with the `+1` term.
- **Checkpoint 03 capture-alignment (capture-script fault, not an app defect):** `tests/capture/
  cognate.capture.ts`'s `03-no-workspace` checkpoint now runs before either onboarding dialog is
  dismissed, same as `reference.capture.ts` (whose own `dismiss(page, "Continue")` before `03` is a
  no-op against the reference's disabled "Continue" button) — both sides now land on the same first
  dialog ("Internal Testing Notice" / its Cognate-branded equivalent) still open, instead of Cognate
  advancing to its second dialog first.
