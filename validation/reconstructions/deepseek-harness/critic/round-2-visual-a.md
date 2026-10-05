# Round 2 Visual Parity Critic — Batch A

Scope: 01-first-launch, 02-model-settings, 02b, 02c, 02d, 03-no-workspace, 04-workspace-selected,
05-empty-session, 06-user-message, 07-streaming, 15-completed-session, 16-session-history,
17-restored-after-reload, 18-error, 19-cancelled, 20-theme-variant. Both viewports (desktop, laptop).

Method: opened every triptych in `diffs/{desktop,laptop}/*.png` for the checkpoints above, and drilled
into `reference/screenshots`, `cognate/screenshots`, and `reference|cognate/observations/aria` for
each divergence. Cross-checked `cognate/DEVIATIONS.md` before flagging.

## Cross-cutting note (not separately flagged per checkpoint)

Cognate's sidebar has a persistent "Dark theme"/"Light theme" toggle footer control with no
reference counterpart (reference sidebar only has "Settings"). Not in DEVIATIONS.md. P2, one fix
covers every checkpoint: either document as an accepted addition in DEVIATIONS.md, or remove/hide if
out of scope.

Accent color: Cognate uses a blue accent (buttons, message bubbles, active-item highlight) vs
reference's near-black/gray accent. Consistent across all checkpoints — treated as one P2 theming
note, not repeated per checkpoint.

---

## 01-first-launch — DIVERGES (desktop & laptop)

- P1 — Sidebar "Workspaces" section label: reference renders `Workspaces` (sentence case, regular
  weight); Cognate renders `WORKSPACES` (all-caps, bold, small-caps style). Hierarchy/typography
  divergence. Fix: match reference's sentence-case, regular-weight label styling.
- P2 — Extra "Dark theme" sidebar footer control (see cross-cutting note above).
- P2 — "Continue" button color: reference black, Cognate blue (see accent-color note).

Otherwise MATCH: dialog title, two-paragraph copy (Cognate's own wording, per accepted deviation),
Continue button, sidebar New Session/Plugins/Workspaces/no-sessions/Settings all present with correct
hierarchy.

## 02-model-settings — DIVERGES (desktop & laptop)

- P1 — Reference's `02-model-settings` capture already shows a *configured* `DeepSeek` provider card
  (API key field, "Customized settings" disclosure, Cancel/Apply) plus "Add model provider" below.
  Cognate's capture at this same checkpoint shows the empty state ("No model provider configured
  yet." + "Add model provider" only). Both states are legitimate per DEVIATIONS.md ("a card for the
  configured provider, or an empty state"), but the checkpoint pairing captured different lifecycle
  moments, so true side-by-side parity of the *configured*-card layout is unverified here (02c below
  is closer but shows the list view, not this reference's inline-editing-card layout with visible API
  key field + Cancel/Apply directly under "Models"). Fix: re-drive the capture script so `02` captures
  Cognate with the same DeepSeek/mock provider already configured as the reference, before taking the
  screenshot.

## 02b-model-settings-custom-form — MATCH (desktop & laptop)

Tabs ("Third-party model provider" / "Custom model API"), Provider ID / Display name / Base URL /
API protocol fields, and the Models/"Fetch available models"/"Add model" section all present with
matching labels. Reference's screenshot is mid-scroll (cut off above Provider ID); this is a capture
scroll-position difference, not a missing field.

## 02c-model-settings-provider-created — DIVERGES (desktop & laptop)

- P2 — Reference captures the wizard mid-creation ("Creating…" button, disabled Cancel). Cognate
  captures the *post*-creation list view (provider row with Edit/Delete, "API key configured" check,
  "Configured — enter a new value to replace" placeholder). Both states are real and correct for
  their respective moments; this is a capture-timing mismatch, not a missing control (list-view
  Edit/Delete/Apply/Cancel all documented in DEVIATIONS.md). Fix: align the two captures on the same
  lifecycle moment (either both mid-creation or both post-creation) for a cleaner side-by-side.

## 02d-model-settings-redacted-key — MATCH (desktop & laptop)

Provider row with name badge, "Mock Model" / "mock-model" card, redacted "Configured — enter a new
value to replace" API key placeholder, "Customized settings" disclosure, Edit/Delete, Cancel/Apply,
"Add model provider" — all present and structurally aligned with reference's DeepSeek-provider
equivalent.

## 03-no-workspace — DIVERGES (desktop & laptop) — P0

Reference's real underlying state (confirmed via aria, since the "Internal Testing Notice" dialog is
still open on top of it in both PNGs) is:
- banner/hero text "Into the Unknown Preview"
- button "Choose workspace"
- **button "Standard mode"**
- textbox "Choose workspace"
- disabled composer ("Add files or run commands", "Send message")

Cognate's actual rendered state (no dialog on top at all — the onboarding notice has already been
dismissed by this point in Cognate's flow, unlike reference's):
- alert text "Unable to create default workspace. Use Choose workspace to select a folder."
- textbox "Workspace directory path" (placeholder `/path/to/project`)
- button "Choose workspace" (disabled)
- **no "Standard mode" button at all**

Findings:
- P0 — "Standard mode" control is missing from Cognate's no-workspace state entirely.
- P1 — Reference blocks this state behind the still-open onboarding modal (Continue disabled until
  resolved); Cognate shows the no-workspace error directly and unblocked, with different copy
  ("Unable to create default workspace…" vs reference's "Into the Unknown" hero + "Choose workspace"
  pill). Fix: confirm intended product behavior — if the onboarding notice should still gate this
  screen in Cognate, wire that; regardless, add the missing "Standard mode" affordance to the
  no-workspace composer area to match reference's control set.

## 04-workspace-selected — DIVERGES (desktop & laptop) — P0

Reference: workspace chosen but no session started yet still shows the centered **"Into the Unknown"
hero landing** (logo, "Preview" badge, `ws-cap1`/"Standard mode" pills, centered composer) — no tab
bar, no "Open in Files" header row. (Confirmed identical aria between reference's checkpoints 04 and
05 — the reference keeps this hero screen until a session actually has a message.)

Cognate: at the same checkpoint already renders the full tabbed session chrome (title bar with "Open
in Files"/"More ways to open"/"…", Chat/Trajectory tabs, "Start the conversation below." placeholder)
— i.e. it has skipped straight to what should only appear after checkpoint 06 (first message).

- P0 — Missing "Into the Unknown" hero/landing state for a workspace-selected-but-no-message session.
  Fix: render the hero landing (logo + Preview badge + workspace/mode pills + centered composer,
  no tab bar/header actions) whenever the active session has zero messages, and only switch to the
  tabbed session view once a turn has actually started.

## 05-empty-session — DIVERGES (desktop & laptop) — P0

Same root cause and fix as 04: reference shows the identical "Into the Unknown" hero (this is in fact
byte-for-byte the same reference screenshot/aria as 04, confirming reference does not distinguish
"workspace selected" from "empty session" visually). Cognate again shows the tabbed
Chat/Trajectory session view with "Start the conversation below." instead of the hero. Same P0 fix as
above.

## 06-user-message — MATCH, one P2 (desktop & laptop)

Header (title, "Standard mode", Open in Files/More ways to open/…, Chat|Trajectory tabs), user
message bubble, timestamp, composer with Stop-state affordance, footer stats — all structurally
match.
- P2 — Reference shows an activity label "Deep diving for 1s" under the pending assistant turn;
  Cognate shows only an unlabeled gray dot at the equivalent frame. Consistent with the documented
  fast-local-timing class of issue (DEVIATIONS.md "`08-tool-running` may land on an already-completed
  frame") — likely the activity label frame is being raced past. Not P0/P1 since 07-streaming
  (next checkpoint) does show equivalent content; flagging in case the activity-label text itself is
  ever simply not implemented for the "thinking" (pre-tool) phase specifically.

## 07-streaming — MATCH (desktop & laptop)

"Deep diving for Ns" progress label, streaming "Summary" heading and partial paragraph text render
equivalently on both sides (reference: "Deep diving for 1s" + "Summary" + "Here is what"; Cognate:
same structure, own activity-dot styling per the 06 note above — P2 only, not re-flagged here).

## 15-completed-session — DIVERGES (desktop & laptop) — P0 (capture defect, not confirmed a UI bug)

Reference's checkpoint 15 is the `[[scenario:plain]] hello there` session completed with a plain
"Summary" (bullet list + code block), "Took 6s", Good/Bad/Branch/Usage row.

Cognate's checkpoint 15 capture instead lands on a **different session** — `[[scenario:delegate]]
delegate this now` — showing a "1 subagent" badge, "Tool result: started subagent …" body, and an
extra "Subagent sessions" tree/"Open … in sidebar" footer bar not present in reference's capture for
this checkpoint. Confirmed via aria: Cognate's session-tree `treeitem` for `[[scenario:delegate]]` is
`[selected]`, not `[[scenario:plain]] hello there` (which exists further down the same list, aged
"1m"/"1h").

- P0 — Wrong session/scenario was captured for this checkpoint, so the intended
  plain-completed-session layout is not actually being compared. The extra subagent chrome shown is
  plausibly correct for *that* scenario (matches the subagent design in DEVIATIONS.md), but it is the
  wrong scenario for checkpoint 15. Fix: correct `tests/capture/*.capture.ts` (or equivalent) to
  select/open the `[[scenario:plain]] hello there` session before taking the "15-completed-session"
  screenshot, matching the reference's capture target.

## 16-session-history — MATCH, one P2 (desktop & laptop)

Both show the `[[scenario:error]] trigger a provider error` session with "Retried model request
(5/5)", "This turn failed / Internal server error / HTTP_500" — content matches (error-code
difference already accepted per prompt). Session list contents differ in count (reference: 3 items;
Cognate: 7 items) — this is scenario/fixture volume from the capture run, not a control-availability
issue; not flagged as a fix item.
- P2 — Reference renders the retry summary as plain inline text ("Retried model request (5/5)");
  Cognate renders it as a bordered, chevron-disclosure pill ("Retried model request (5/5) · 4s ⌄").
  Both are documented as Cognate's own invention for this content (DEVIATIONS.md), but the chrome
  (bordered button vs plain text) is a visible affordance difference worth a polish pass.

## 17-restored-after-reload — MATCH (desktop & laptop)

Same content/layout as 16 (state correctly persists across the simulated reload); no new findings
beyond the 16 P2 already noted.

## 18-error — MATCH (desktop & laptop)

Same "trigger a real provider error" / retry-exhausted / HTTP_500 state as 16/17; matches reference's
equivalent error checkpoint. Error-code/copy difference (HTTP_500 vs reference's TIMEOUT) is
pre-accepted per the task brief.

## 19-cancelled — DIVERGES (desktop & laptop) — P0

Reference (`[[scenario:plain]] cancel me please`):
- Header title correctly shows the session's first-message text.
- Body shows a standalone **"Stopped"** status line, then a rendered "Summary" heading, then a
  second **"Stopped"** tag chip next to the (enabled, per accepted deviation) action icon row.
- Footer stats: "1 turns 1 steps".
- Session appears in the sidebar list as "[[scenario:plain]] cancel me p…".

Cognate, same checkpoint:
- Header title is stuck on **"New Session"** — never updated to the message text, contradicting
  DEVIATIONS.md's own "Session title source" fix (title should be set immediately from the first
  human message).
- Body shows only a plain unlabeled dot; **no "Stopped" text/indicator appears anywhere**, no
  "Summary" heading, no response content at all.
- Footer stats show "0 turns 0 steps · 0 tok/s" / "0% of context used" (should be non-zero once a
  turn has run, even if cancelled).
- The session is **absent from the sidebar session list entirely** — none of the 6 listed sessions is
  the cancelled one.

This reproduces identically at laptop width.

- P0 — Missing "Stopped" status indicator/chip entirely for a cancelled turn (both the standalone
  status line and the response-adjacent tag).
- P0 — Session title/sidebar-listing not persisted for a cancelled turn (stuck on "New Session",
  missing from the session tree), contradicting the project's own documented title-on-turn-start
  behavior.
- P1 — Turn/step counters remain at 0 instead of reflecting the cancelled turn.
Fix: investigate the cancellation path in the capture/app — it looks like this specific session never
got a `session.turn.started`-driven title update or a `run.cancelled`-driven "Stopped" render before
the screenshot was taken; either a capture-timing race (screenshot taken before cancellation event
processed) or a genuine gap in the cancelled-turn UI wiring described in DEVIATIONS.md's
"Cancel/error presentation" section (which describes a "Stopped" system row as implemented — verify
it is actually reachable/rendered).

## 20-theme-variant — MATCH, minor P2s (desktop & laptop)

Both apply the dark theme consistently across sidebar AND main content pane (verified via full-size
screenshots, not just the shrunk triptych thumbnail). Structure (title, tabs, header actions, message
bubble, retry-error content, composer, footer stats) matches reference's dark-mode equivalent.
- P2 — Accent/bubble color divergence (see cross-cutting note).
- P2 — Cognate's dark-mode active-session row uses a blue-tinted highlight; reference uses a neutral
  gray highlight.

---

# Summary

- **P0: 6** — 03 missing "Standard mode" control; 04 missing "Into the Unknown" hero state; 05 same;
  15 wrong session/scenario captured; 19 missing "Stopped" indicator; 19 session title/list not
  persisted for cancelled turn.
- **P1: 4** — 01 Workspaces label typography; 02 configured-provider capture mismatch; 03 blocking
  modal/copy divergence; 19 turn/step counters not updated.
- **P2: 7** — extra Dark/Light theme toggle (cross-cutting); accent-color divergence (cross-cutting);
  01 Continue button color; 02c creation-lifecycle capture mismatch; 06 missing activity-label text;
  16 retry-summary chrome (pill vs plain text); 20 active-row highlight color.

Top 5:
1. (P0) Checkpoints 04/05: Cognate skips the reference's "Into the Unknown" hero landing screen and
   jumps straight to the tabbed session view before any message exists.
2. (P0) Checkpoint 19: cancelled turns show no "Stopped" indicator, no response content, and the
   session title/sidebar entry never update off "New Session".
3. (P0) Checkpoint 15: capture selected the wrong session (`delegate` scenario instead of `plain`),
   so the intended completed-session layout is unverified.
4. (P0) Checkpoint 03: "Standard mode" control missing from the no-workspace state.
5. (P1) Checkpoint 01: "WORKSPACES" is rendered all-caps/bold vs reference's sentence-case label.
