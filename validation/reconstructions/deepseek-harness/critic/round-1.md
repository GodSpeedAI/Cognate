# Critic round 1 — DeepSeek Harness reconstruction (checkpoints 01–12)

Scope: checkpoints 01, 02/02b/02c/02d, 03, 04, 05, 06, 07, 08, 09, 10 (collapsed+expanded),
11, 11b, 12 (allow+deny), both `desktop` (1440x900) and `laptop` (1024x768). Checkpoints
13/14/18/19 and their variants are out of scope per instructions (owned by a concurrent
plan/subagent/cancel workstream). Judged by looking at `diffs/{desktop,laptop}/*.png`
triptychs and the raw `cognate`/`reference` screenshots, plus `reference/observations/aria`
vs `cognate/observations/aria` text diffs. Diff percentages were not used as evidence.

**Verdict: REJECT.**

Counts: **P0 = 6, P1 = 5, P2 = 3.**

---

## P0 — missing or wrong behavior/control

### P0-1. First-run notice sequence is entirely absent (checkpoints 01, 03; both viewports)
- Reference evidence: `reference/screenshots/{desktop,laptop}/01-first-launch.png`,
  `reference-behavior-matrix.md` §1 — two modal dialogs on a fresh `DSH_HOME`: dialog 1
  `"Internal Testing Notice"` (heading + two paragraphs + "Continue" button), dialog 2
  `"Add an API key to get started"` (API-key textbox + "Configure later"/"Save and continue").
  Both persist once dismissed (`role="alert"` no-workspace banner shows underneath).
- Cognate evidence: `cognate/screenshots/{desktop,laptop}/01-first-launch.png` and
  `03-no-workspace.png` — no dialog at all; the app lands directly on the empty-workspace
  shell.
- `DEVIATIONS.md` argues this is acceptable because copying DeepSeek's own legal copy would
  be a trademark problem. **Ruled MUST-FIX, not acceptable.** The spec's UI Reconstruction
  Standard says branding/logos may be swapped for Cognate's own, and "Brand substitutions
  may be masked in visual comparison" — it never authorizes dropping the control. A
  first-run notice + first-run "configure a provider" dialog are structural affordances
  (two `dialog` roles, a `heading[level=2]`, specific buttons) that the reference always
  shows on a fresh install; the fix is a Cognate-branded/Cognate-worded pair of dialogs
  with the same roles/heading/button set, not silence. This is exactly the case the spec
  calls out: "No missing control may be excused by screenshots that look similar."
- Fix: add two dialogs on first launch (fresh state = no persisted "seen" flag), Cognate
  copy, same `dialog`/`heading[level=2]` roles, "Continue" then an API-key-configuration
  step with a "Configure later"/"Save and continue" pair (disabled until a key is entered),
  persisted per app-data-home exactly like the reference persists per `DSH_HOME`.

### P0-2. Sidebar auto-collapses to icon rail at laptop viewport; reference keeps it fully expanded
- Reference evidence: `reference/screenshots/laptop/04-workspace-selected.png` — full
  280px-ish sidebar with "DSH Local Build" brand, "New Session" button (with label),
  "Plugins", "Workspaces" header + search/view/add icons, `ws-cap1` workspace, session
  tree, "Settings" (with label) — at 1024×768, same as desktop.
- Cognate evidence: `cognate/screenshots/laptop/04-workspace-selected.png` — sidebar is
  collapsed to a ~56px icon-only rail: no brand text, no "New Session" label, no
  "Workspaces" header, no session tree, no "Settings" label. This reproduces at every
  laptop checkpoint (confirmed also in `diffs/laptop/02-model-settings.png`,
  `10-file-change-expanded.png`).
- This is a real breakpoint failure, not a cosmetic gap: the session tree and workspace
  list — required controls per the Standard's "sidebar widths and hierarchy" and
  "responsive breakpoints" bullets — are not reachable without first clicking to expand,
  which the reference never requires at this width.
- Fix: sidebar must default to the reference's expanded state at 1024×768; only collapse
  below the breakpoint the reference itself uses (not observed to collapse in any pinned
  reference laptop screenshot), or make the collapse an explicit user action that isn't
  triggered by viewport width alone in this range.

### P0-3. Session title does not appear until the assistant's answer completes; reference titles immediately from the user's literal message
- Reference evidence (aria): `reference/observations/aria/06-user-message.desktop.txt` —
  `treeitem "Running [[scenario:plain]] hello there now"` appears as soon as the user's
  message is sent, before any assistant text streams. Same at
  `08-tool-running.desktop.txt`: `treeitem "Running [[scenario:multi]] do the multi-step tas now"`.
  Matrix §4 confirms: "Session title Derived verbatim from the literal first human message
  text ... at least at the moment of creation."
- Cognate evidence (aria): `cognate/observations/aria/06-user-message.desktop.txt` —
  `treeitem "New Session now"` is still showing at the same point (message already sent,
  visible in the transcript as `paragraph: "[[scenario:plain]] hello there"`, but the
  sidebar item is untitled). Same gap at `08-tool-running.desktop.txt`, where the title only
  becomes the first *assistant* answer's text once the run has finished.
  `DEVIATIONS.md`'s "Session title source" section documents this as a deliberate choice
  (title = first `message.completed` text) but only checked the reference's *completed*
  state (`15-completed-session`); it did not check the reference's *in-flight* state, where
  the literal user text is what's actually shown.
- This is a confirmed behavioral divergence, not a documented/acceptable deviation: for the
  entire duration of every run (which can be tens of seconds, longer under retry/approval),
  Cognate's sidebar shows "New Session" where the reference already shows the real title.
  It also means the pending-approval and tool-running screenshots (08, 11, 11b) never show
  a real session label in Cognate, unlike the reference.
- Fix: set the session title from the literal first user message text (truncated) at
  creation time, same as the reference; only replace it later if/when a title-generation
  call lands (out of scope here — no evidence this pass that the reference actually
  replaces it visibly).

### P0-4. Settings → Models: no provider list, no "Add model provider" wizard, no tabs, no per-model list — only a single always-open custom form
- Reference evidence: `reference/screenshots/{desktop,laptop}/02-model-settings.png` —
  default view is a **list**: "DeepSeek — deepseek-official" row + API-key field +
  collapsible "Customized settings" + Cancel/Apply, then a separate **"+ Add model
  provider"** button. `02b-model-settings-custom-form.png` — clicking Add opens a real
  `tablist "How to add"` with two tabs, **"Third-party model provider"** (combobox of ~35
  provider ids) and **"Custom model API"**; the custom form has Provider ID / Display name
  / Base URL / API protocol (3-option combobox) / API key, then a **"Models"** region with
  **"Fetch available models"** + **"Add model"**, then Cancel / **"Create provider"**.
  `02c` shows the created provider as a **card** with an "API key configured" checkmark and
  **Edit/Delete** buttons.
- Cognate evidence: `cognate/screenshots/{desktop,laptop}/02*.png` — one inline form is
  shown at all times (Provider id / Base URL / Protocol / Model / API key), no tabs, no
  35-provider combobox, no "Fetch available models"/"Add model" region, no per-provider
  card/list view, no Edit/Delete affordance, buttons are "Close"/"Save" instead of the
  reference's "Cancel"/"Apply" (list view) or "Cancel"/"Create provider" (add-provider
  view).
- `DEVIATIONS.md` argues this is acceptable because "this tranche only ever has one
  provider." **Ruled MUST-FIX.** The spec is explicit: "No missing control may be excused
  by screenshots that look similar," and only branding/timestamps may be masked — a
  provider count of one doesn't excuse omitting the list+wizard structure; it only means
  the list would show one row and the wizard would be exercised for that one case. The
  tabs, the combobox, the Models sub-list, the card+Edit/Delete affordances, and the
  correct button labels are all real, distinct ARIA-visible controls the reference has and
  Cognate does not.
- Fix: implement the provider-list view (row(s) + "+ Add model provider"), the two-tab add
  dialog (Third-party combobox — may be a short/placeholder list, but the tab and combobox
  controls must exist — plus Custom model API form), the Models sub-list with Fetch/Add
  controls, the post-create card view with Edit/Delete, and correct button labels
  (Cancel/Apply, Cancel/Create provider) in place of Close/Save.

### P0-5. Sidebar gives no visual indicator that a session is waiting on approval
- Reference evidence: `reference-behavior-matrix.md` §6.2 — "Session sidebar label prefix:
  'Waiting for approval `<title>`', with a small 'Approval' badge and an orange/amber dot."
  Confirmed in `reference/screenshots/desktop/11-approval-pending.png` (sidebar row visibly
  badged, left of the main pane).
- Cognate evidence: `cognate/screenshots/desktop/11-approval-pending.png` — because of
  P0-3, the sidebar session item is still just "New Session" with no badge, no dot, no
  "Waiting for approval" prefix at all. This is compounded by, but distinct from, P0-3: even
  once titles land, there's no evidence of an "Approval" badge/dot being implemented
  anywhere in the sidebar tree markup.
- Fix: add the "Waiting for approval `<title>`" prefix + badge + amber dot to the session
  tree item while a continuation is open, matching the reference's sidebar state machine
  (also applies to "Plan awaiting review" per the matrix, for whichever agent owns plan
  checkpoints).

### P0-6. File-change "Review" panel is missing its bottom toolbar controls
- Reference evidence: `reference-behavior-matrix.md` §6.1 and
  `reference/screenshots/{desktop,laptop}/10-file-change-expanded.png` — the Review split
  view has toggles for **"Split view"** and **"Line wrap"**, and an **"Open `<file>` in
  sidebar"** button, in addition to the header close (✕) and view icons.
- Cognate evidence: `cognate/screenshots/{desktop,laptop}/10-file-change-expanded.png` — the
  split-diff view itself is present and correctly rendered (line-numbered, red/green
  highlighted, +1/-1 stat, file path selector — good match), but there is no bottom toolbar:
  no "Split view" toggle, no "Line wrap" toggle, no "Open in sidebar" button are visible in
  either viewport's screenshot.
- Fix: add the three missing controls to the Review panel (Split view toggle, Line wrap
  toggle, "Open `<file>` in sidebar" button), matching the reference's accessible names.

---

## P1 — significant visual divergence

### P1-1. Settings dialog missing "Open configuration file" link
Reference (`02-model-settings.png`, both viewports) shows an **"Open configuration file"**
button top-right of the Settings dialog header. Not present in any Cognate Settings
screenshot. Small but a real, named control — flag alongside P0-4's Models-tab rebuild.

### P1-2. First-launch/no-workspace screen: everything under the missing dialogs (P0-1) also differs in copy/geometry once dialogs are added
Once P0-1 is fixed, re-diff 01/03 — currently ~76–85% pixel difference is dominated by the
dialog absence per `diffs/summary.md`, but the underlying shell (sidebar width, "Into the
Unknown" wordmark position, composer disabled state) already matches well; keep that intact
while adding the dialogs.

### P1-3. Composer stats footer and message action row are present but always-zero/inert (turns/steps/tok/s, context %, Good/Bad/Branch/Usage)
Structurally present with correct labels per `DEVIATIONS.md` and confirmed in the
04–12 screenshots, so not a missing-control issue — but flag that this makes every
"completed" screenshot look artificially identical regardless of scenario (0 turns 0
steps · 0 tok/s everywhere), which will make later checkpoints (15–17, owned elsewhere)
harder to visually verify. Not this round's blocker; note for the builder doing durability
work.

### P1-4. Button-label mismatches in Settings (Cancel/Apply vs Close/Save; Cancel/Create provider vs Save)
Called out under P0-4 but worth restating as its own line item since it's an easy,
independent fix once the list/wizard structure exists: match the reference's exact button
labels per state (list view: Cancel/Apply; add-provider view: Cancel/Create provider).

### P1-5. Laptop-viewport Review panel inherits the same missing toolbar as desktop (P0-6), and the sidebar-collapse issue (P0-2) also cuts off the workspace label truncation width in Settings' left nav
`diffs/laptop/02-model-settings.png` shows Cognate's Settings left-nav column narrower and
missing the small chevron/hierarchy affordance the reference has next to "Models" — minor,
but confirm after the sidebar/Models fixes land.

---

## P2 — polish

### P2-1. Icon set is original/simplified (declared, acceptable)
`DEVIATIONS.md`'s "Icons" section — original monochrome SVGs instead of visual copies of
DeepSeek's iconography. **ACCEPTABLE**: icons are exactly the kind of non-trademark visual
asset the spec expects to be substituted; shapes/placement look equivalent in every
screenshot reviewed.

### P2-2. `run_code` sandbox is an original harness, not `dsh-tools` (declared, acceptable)
**ACCEPTABLE**: this is a backend implementation detail invisible in every screenshot and
ARIA snapshot reviewed; the UI behavior (approval card, escalation text, reflection text)
matches the reference exactly per `11`/`11b`/`12` evidence above.

### P2-3. Pending approvals surviving a full server restart (declared, acceptable)
**ACCEPTABLE** on the terms `DEVIATIONS.md` gives (durable SQLite continuation state is a
stated Cognate architectural invariant) — this is a durability/backend behavior, not
observable in the checkpoint screenshots in scope for this round, and the spec's Phase 8
purpose (proving the app is genuinely built on Cognate) supports keeping the durable
behavior rather than deliberately regressing to match a reference data-loss quirk.

---

## Deviation-by-deviation rulings (from `cognate/DEVIATIONS.md`)

| Deviation | Ruling | Reason |
|---|---|---|
| No first-run dialog sequence | **MUST-FIX** | See P0-1. |
| Settings → Models single form vs list+wizard | **MUST-FIX** | See P0-4. |
| Settings General/Built-in plugins/Agent presets inert | **ACCEPTABLE** | Controls are present with correct names/roles, just disabled — matches "structural parity, feature stubbed" pattern the spec tolerates when the control itself isn't missing. |
| Sidebar "Plugins" panel inert | **ACCEPTABLE** | Same reasoning — control present, feature stubbed. |
| Session header actions inert (Open in Files, More ways to open, More actions, right sidebar) | **ACCEPTABLE** | Present with correct accessible names; out of scope for this tranche's behavior. |
| Trajectory tab inert | **ACCEPTABLE** | Present, correct name, disabled. |
| Message action row inert/static (Good/Bad/Branch/Usage) | **ACCEPTABLE for now** | Present with correct names; flagged as P1-3 for follow-up once durability/usage accounting exists. |
| Composer permission-mode/model dropdowns inert | **ACCEPTABLE** | Only one real value exists this tranche; control present with correct accessible-name pattern. |
| Composer stats footer static | **ACCEPTABLE for now** | Same as message action row; P1-3. |
| Session title source (assistant-answer titling) | **MUST-FIX** | See P0-3 — this deviation's own justification cites only the *completed*-session aria dump, not the *in-flight* one, which contradicts it. |
| Cancel/error presentation not reference-identical | **Out of scope this round** (checkpoint 18/19 territory, excluded per instructions). |
| Approval-gate access-mode default | **ACCEPTABLE** | Matches the reference's own observed default in the approval scenario; documented rationale is sound. |
| Pending approvals survive restart | **ACCEPTABLE** | See P2-3. |
| `run_code` original sandbox | **ACCEPTABLE** | See P2-2. |
| `08-tool-running` may land on completed frame | **ACCEPTABLE** | Timing artifact of a fast local mock, not a missing feature; correctly cross-verified against `11-approval-pending`'s genuinely-blocking running state. |
| Icons | **ACCEPTABLE** | See P2-1. |
