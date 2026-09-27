# Deviations from the pinned DeepSeek Harness reference (tranche T5b)

This file records every place the Cognate reconstruction's UI is intentionally different from, or
inert relative to, the pinned reference — either because the underlying feature is out of scope
for this tranche, or because reproducing the reference exactly would mean copying DeepSeek's own
content/branding. Structural parity is still intentional: every control listed below is present in
the DOM/aria tree with the reference's accessible name, just disabled (`title="Not implemented in
this tranche — see APP/DEVIATIONS.md"`), so `tests/visual/compare.ts` diffs are content differences,
not missing-control differences. See `diffs/summary.md` for the measured per-checkpoint pixel-diff
evidence this file explains.

## No first-run dialog sequence (checkpoints 01, 03)

The reference shows an "Internal Testing Notice" dialog (DeepSeek-specific legal/testing-notice
copy) on a fresh `DSH_HOME`, dismissed with "Continue", before landing on the same "no workspace"
state Cognate shows immediately. Reproducing that dialog verbatim would mean copying DeepSeek's own
notice text; reproducing it with placeholder Cognate copy would misrepresent what this app actually
needs a first-run notice for (single-operator local app, `devTokenAuthenticator`, no external
account). We do not ship an equivalent dialog. This accounts for nearly all of the 01/03 checkpoints'
pixel-diff in `diffs/summary.md` (~76-85%) — the shell underneath (sidebar, empty state, chrome) is
otherwise the reference's structure.

## Settings > Models is a single always-open provider form, not a provider-list + add-wizard

The reference's Models pane lists configured providers as cards (name + collapsed "Customized
settings"), with a separate "Add model provider" flow (a dialog with a "Custom model API" tab, a
multi-step "Add model" -> per-model Model ID/Display name inputs, then "Create provider"). This
tranche only ever has one provider ("mock"/custom), so `SettingsModels` in `src/ui/App.tsx` keeps a
single inline form (Provider id / Base URL / Protocol / Model / API key) inside the same left-nav +
"Models" panel chrome as the reference (checkpoints 02/02b/02c/02d), with a disabled "+ Add model
provider" button present for structural parity. The write-only API key contract is implemented:
reopening Settings after Save never shows the plaintext key back, only a "Configured — enter a new
value to replace" placeholder (checkpoint 02d).

## Settings General / Built-in plugins / Agent presets — inert nav items

Present in the Settings left nav with the reference's exact labels (aria: `button "General"`,
`"Models"`, `"Built-in plugins"`, `"Agent presets"`), disabled. Only Models is implemented.

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

## Session title source (backend change made this tranche)

Confirmed against `reference/observations/aria/15-completed-session.desktop.txt`: the reference's
sidebar session-tree label is derived from the session's first **assistant answer** (its raw
markdown, truncated), not the user's first prompt, and reads "New Session" before any answer lands
(`04-workspace-selected.desktop.txt`). `src/projections/sessions.ts` was changed to match: title is
now set from the first `message.completed` text instead of the first `session.turn.started` message.
Tests `J-B-basic-session.test.ts` and `J-G-persistence.test.ts` were updated accordingly. The
reference's `all-prompts` LLM-re-titling cadence (session-title subsystem) is still not implemented
— every session uses the `first-prompt`-equivalent single-answer title for its lifetime.

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

## Icons

All icons (`src/ui/icons.tsx`) are original inline SVGs drawn for this reconstruction — simple
monochrome line glyphs, not visual copies of the reference's iconography.
