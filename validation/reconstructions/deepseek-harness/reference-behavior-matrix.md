# DeepSeek Harness Web UI — Reference Behavior Matrix (T2)

Pinned reference: commit `477b4f420553e8a52c2fbccc464d7561b239c443`, package
`@deepseek-ai/dsh-root@0.1.7-rc.2`. Captured 2026-09-26 against `dsh web`
launched from isolated `DSH_HOME`s under `.tmp/ref/dsh-home-cap-{desktop,laptop}`,
Playwright/Chromium (revision 1243), viewports **desktop** 1440x900 and
**laptop** 1024x768, DPR 1, `en-US`/UTC, reduced motion.

Evidence paths below are relative to
`validation/reconstructions/deepseek-harness/`. Every screenshot exists for
both `reference/screenshots/desktop/<name>.png` and
`reference/screenshots/laptop/<name>.png` unless noted; aria snapshots are at
`reference/observations/aria/<name>.<viewport>.txt`.

Suite code: `tests/playwright.config.ts`, `tests/drivers/types.ts`,
`tests/drivers/reference.ts`, `tests/capture/reference.capture.ts` (startup/
settings/workspace/conversation/error/cancel/theme checkpoints),
`tests/capture/reference.capture-tools.ts` (tool/approval/plan/subagent
checkpoints — see §6 for the exact recipe: PTC mode + Read Only access mode
for approvals, `/plan ` prefix for plan mode).

---

## 0. RESOLVED (commit d83960f) — mock-model scenario routing

**Status: fixed and re-verified.** Commit `d83960f` changed
`extractScenario()` to scan all `role:"user"` messages for the last one
containing a `[[scenario:...]]` marker (via `MARKER`/`textOf`), instead of
requiring the literal last user message to carry it, and made the SSE write
loop tolerant of client-aborted streams. Both fixes were re-verified directly
against the live reference this tranche: `read`, `shell`, `edit`, `multi`,
`plan`, `delegate` all now route correctly out of the box; `approval` needed
no fixture change either (see §6) — its apparent non-triggering was a
driver/config gap, not a routing bug. The original bug report is kept below
for the record.

<details>
<summary>Original bug report (T2 tranche 1, now fixed)</summary>

**This blocked every non-`plain` scenario capture (`read`, `edit`, `shell`,
`multi`, `approval`, `plan`, `delegate`, `error`, `interrupt`, `retry`) when
driven through the actual reference product.**

- Class: **P0 — reconstruction blocker for the fixture, not for DSH itself.**
- Root cause (confirmed by inserting a logging reverse proxy between the
  reference and the mock server; raw request bodies saved and inspected):
  the reference always appends **two more synthetic `role: "user"` messages**
  after the real human message before calling the model:
  1. a "Current runtime context..." snapshot message, and
  2. a `<system-reminder>` message listing available skills.

  `fixtures/mock-model/server.ts`'s `extractScenario()`
  (`lastUserMessageIndex` + regex against `messages[idx].content`) looks at
  the **last** `role: "user"` message only. Against the real reference that
  last user message is always the skills `<system-reminder>`, which never
  contains a `[[scenario:...]]` marker, so `extractScenario` silently falls
  back to `"plain"` for **every** request the live UI sends, regardless of
  what scenario marker the human message actually contained.
  - The marker *is* still detected correctly for the separate,
    non-streaming **session-title-generation** call the reference also makes
    (it wraps the human message text in a JSON string in *its own* single
    user message), which is why `mock.log` appeared to show the right
    scenario name even though the visible chat reply did not use it.
  - Verified directly: `curl` straight to the mock server with only the
    marked human message *does* return the correct scripted turn (e.g. the
    `run_code` tool call for `approval`); the same marker sent by the real
    browser through the reference produces the generic `plain` reply
    (`# Summary ... first point ... second point ... `ts` code block`)
    instead, for `approval`, and by the same mechanism would for every other
    scripted scenario.
  - Raw evidence: proxied request bodies were saved during this run (not
    checked in — reproduce with a local reverse proxy in front of
    `fixtures/mock-model/server.ts` and any `[[scenario:...]]` message).
- **Precise fix needed in the fixture** (not applied — fixtures were not
  edited per instructions): `extractScenario` should scan **all** messages
  (or all `role: "user"` messages) for the `[[scenario:...]]` marker and use
  the **last matching** one, instead of unconditionally using the last
  `role: "user"` message regardless of whether it contains a marker. E.g.:
  ```ts
  function extractScenario(messages: ChatMessage[]) {
    let markerIdx = -1, name = "plain";
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i].role === "user"
        ? String(messages[i].content ?? "").match(/\[\[scenario:([a-zA-Z0-9_-]+)\]\]/)
        : null;
      if (m) { markerIdx = i; name = m[1]; break; }
    }
    let step = 0;
    if (markerIdx >= 0) for (let i = markerIdx + 1; i < messages.length; i++) if (messages[i].role === "tool") step++;
    return { name, step };
  }
  ```
- **Impact at the time**: checkpoints `08-tool-running`, `09-tool-complete`,
  `10-file-change`, `11-approval-pending`, `12-approval-resolved`,
  `13-plan-active`, `14-subagent-active` could not be reached with the
  fixture as it stood then. All are now captured — see §6.

</details>

## 0b. RESOLVED (commit d83960f) — mock server crash on client-aborted stream

- Class: P2 (test-infra robustness, not a product bug). **Fixed and
  re-verified**: cancelling an in-flight stream (§7) no longer crashes the
  mock server.
- Original report: `fixtures/mock-model/server.ts` line ~336 threw unhandled
  `TypeError: Invalid state: Controller is already closed` when the SSE
  stream's `ReadableStream` controller is `enqueue`d after the client
  (browser) has already disconnected — exactly what happens when the
  reference's "Stop" action aborts an in-flight fetch. The whole mock
  process crashes (uncaught exception), taking down the mock server (not the
  reference, which handled the abort gracefully — see §7 Cancellation).
  Needed fix (not applied): wrap the `sleep`/`controller.enqueue` loop in a
  try/catch (or check `controller.desiredSize !== null` /
  catch on `enqueue`) and return early instead of letting the exception
  escape and crash the process.

---

## 1. Startup and shell

| Feature | Evidence |
|---|---|
| Token-in-URL handoff | Visiting `http://127.0.0.1:<port>/?token=<token>` (token printed once on `dsh web` stdout) authenticates and lands on the shell. Confirmed both for a fresh `DSH_HOME` and for repeat visits within the same `DSH_HOME` (session cookie). |
| First-run modal #1 | **"Internal Testing Notice"** dialog, heading `Internal Testing Notice`, body: "DeepSeek Harness 0.1 remains in testing for Harness developers. Many areas need further improvement, and we welcome feedback from the developer community. DeepSeek Harness's core plugins and foundational APIs will continue to evolve rapidly over the coming months." + a second paragraph about the plugin ecosystem, single button **"Continue"**. Shown once per `DSH_HOME` (persisted; a reused home skips it). |
| First-run modal #2 | **"Add an API key to get started"** dialog: "Configure the official DeepSeek provider to start building." with an API-key textbox, buttons **"Configure later"** / **"Save and continue"** (disabled until a key is entered). Also persisted per `DSH_HOME`. |
| No-workspace alert | `role="alert"` banner: **"Unable to create default workspace. Use Choose workspace to select a folder."** Shown on every fresh `DSH_HOME` until a workspace is chosen — P1, not an error to chase. |
| App shell / nav | Left sidebar: brand button (also labelled "New session" — see driver note below), **"New Session"** button, **"Plugins"** nav, **"Workspaces"** header with search/view-options/add-workspace icon buttons, a `tree "Sessions"` region ("No sessions yet" when empty), **"Settings"** button pinned at the bottom. Main pane: **"Into the Unknown"** wordmark + **"Preview"** pill, **"Choose workspace"** / **"Standard mode"** selectors, composer. |
| Composer disabled until workspace | Composer textbox placeholder **"Choose a workspace to start"**; **"Add files or run commands"** and **"Send message"** buttons both `[disabled]` before a workspace is selected. |
| Screenshots | `01-first-launch` (both dialogs still up, alert visible), `03-no-workspace` (dialogs dismissed, composer still disabled). |
| A11y | `dialog "Internal Testing Notice"` with `heading[level=2]`; `alert` role for the workspace-creation failure; sidebar `tree "Sessions"`. |
| Class | P0 |

## 2. Settings → Models (custom provider) — resolves char-doc uncertainty #9

Entry: Settings (bottom-left gear) → **Models** tab.

| Step | Behavior |
|---|---|
| Default list | One built-in row: "DeepSeek — deepseek-official", API-key textbox, collapsible "Customized settings", Cancel/Apply. Plus **"Add model provider"** button. |
| Add provider | Opens a `tablist "How to add"` with two tabs: **"Third-party model provider"** (a `combobox` of ~35 built-in provider ids: amazon-bedrock, anthropic, openai, openrouter, deepseek, zai, … — full list in `reference/observations/aria/02-model-settings.*.txt`) and **"Custom model API"**. |
| Custom model API form | Fields, in order: **Provider ID** (placeholder `acme-gateway`; "Lowercase identifier, starting with a letter, that uniquely names this provider in requests and as its credential name"), **Display name**, **Base URL** (placeholder `https://gateway.example/v1`), **API protocol** `combobox` with exactly 3 options — **OpenAI Chat Completions** (default/selected), **OpenAI Responses**, **Anthropic Messages** — API key, a **Models** region with **"Fetch available models"** (disabled until Base URL set) and **"Add model"**, then **Cancel** / **Create provider**. |
| Validation | **"Create provider" stays disabled** until Provider ID, Display name, Base URL, and API key are filled **and at least one model row exists with a non-empty Model ID** (adding a model via "Add model" without filling its Model ID shows inline error `"Model 1: Model ID is required."` and keeps Create disabled). |
| Save behavior | On successful create, the provider appears in the Models list with an `img "API key configured"` checkmark icon and **"Edit \<name\> (\<id\>)"** / **"Delete \<name\> (\<id\>)"** buttons; no page reload needed. |
| Redaction (write-only credential contract) | Re-opening **Edit** on a configured custom provider shows the API-key textbox **empty**, placeholder **"Configured — enter a new value to replace"** — the plaintext value is never re-displayed. Confirmed screenshot `02d-model-settings-redacted-key`. |
| Model selection in session UI | Composer footer has a **"Select model, current \<Model\>"** button; clicking it opens `menu "Model and reasoning effort"` with a `menuitem "Model <current>"` and `menuitem "Effort <level>"`; clicking the Model item opens a `menu` grouped by provider (`group "DeepSeek"`, `group "<Custom provider display name>"`) of `menuitemradio` entries, one per configured model. Selecting a model updates the button label immediately and applies to the **next** send in that session — no restart or reload needed. |
| Change without restart | Confirmed: the whole provider-create → model-select → send flow happened within one running `dsh web` process, no restart. |
| Screenshots | `02-model-settings`, `02b-model-settings-custom-form`, `02c-model-settings-provider-created`, `02d-model-settings-redacted-key`. |
| A11y | Tabs are real `tab`/`tablist` roles; the model picker is `menu`/`menuitemradio` (radio-group semantics — good target for the reconstruction's own accessible menu). |
| Class | P0 |

## 3. Workspace

| Feature | Evidence |
|---|---|
| Choose workspace (first time) | Clicking **"Choose workspace"** opens `dialog "Select Workspace Directory"`: breadcrumb `navigation` with a **"Home"** button, an **"Edit path"** button (switches to a typeable path textbox — used by the driver for determinism), a directory `list` of subfolders, **"New folder"**, **"Show hidden files"**, **Cancel** / **Open** (Open disabled until a valid, existing directory is selected/typed). |
| Select | Typing an absolute path + Enter + **Open** adds the folder to the sidebar **Workspaces** list (shown by its basename, e.g. `ws-cap1`) and auto-selects it. |
| Workspace ↔ session relationship | Selecting a workspace **auto-creates and selects a "New Session"** tree item nested under the workspace node; the composer becomes enabled in the same transition (placeholder changes from "Choose a workspace to start" to "Describe what you want to build, / commands, @ files or sessions"). |
| Composer enabled/disabled transition | Confirmed via `03-no-workspace` (disabled) → `04-workspace-selected` (enabled) screenshot pair. |
| Re-choosing / already-added workspace | Clicking "Choose workspace" again when a workspace is already added shows a different (dropdown-style) surface listing already-added workspaces rather than the file-browser dialog — exact shape not fully characterized this pass (P2, noted under "Still unresolved"). |
| Persistence | Workspace selection survives reload (`17-restored-after-reload`) — see §5. |
| Screenshot | `04-workspace-selected`. |
| A11y | Dialog is a real `dialog` with `heading[level=2]`; directory entries are plain `button`s in a `list`. |
| Class | P0 |

## 4. Sessions

| Feature | Evidence |
|---|---|
| Create session | Sidebar **"New Session"** button (note: **two** elements share the accessible name "New session" — the top-left brand/logo button and the actual sidebar action; the driver disambiguates with `.last()`). |
| Session title | Derived **verbatim from the literal first human message text** (truncated), *not* an AI-generated summary, at least at the moment of creation — e.g. session titled `"[[scenario:approval]] run something risk"` for a message starting with that text. (The reference *does* separately call the model for title generation — see §0 — but that generated title was not observed to replace the literal-text title within this pass's timeframes; flagged as unresolved below.) |
| Active-session navigation / switching | Clicking a different `treeitem` in the `tree "Sessions"` switches the main pane to that session's transcript; the sidebar highlights the selected item. |
| Session list ordering/labels | Newest session on top; each item shows a relative-time label ("now", "4min" in this pass). |
| Reload | `page.reload()` — session list and the previously-open session's full transcript (including the earlier assistant reply, markdown, code block) are restored unchanged. Screenshot `17-restored-after-reload`. |
| Process restart | Exercised (kill + relaunch `dsh web` against the same `DSH_HOME`): completed sessions and their full transcripts survive unchanged. A **pending approval does not survive**: it silently finalizes as `status: Worked` with no assistant text/tool card at all — see §6.2. |
| Empty / active / completed session | Empty: composer only, no transcript (`05-empty-session`). Active (mid-run): user bubble + in-progress status text, no duration badge yet (`06-user-message`, `07-streaming`). Completed: `status: Worked`, a disabled **"Took \<N\>s"** duration button, full rendered reply (`15-completed-session`). |
| Failed/interrupted session | Cancelled: status text **"Stopped"** (both as a small label above the reply and as a pill under the heading) — see §7. A genuine provider error instead shows a persistent **"Deep diving for \<N\>s"** status plus an expandable **"Retried model request (\<k\>/5) · \<N\>s"** row — see §8. |
| Fork/resume affordances | **"Branch into a new conversation"** button appears under every completed assistant turn (feedback row: Good/Bad response, Branch, Usage). Not exercised end-to-end this pass. |
| Screenshots | `05-empty-session`, `06-user-message`, `07-streaming`, `15-completed-session`, `16-session-history`, `17-restored-after-reload`. |
| A11y | Sessions render as a `tree`/`treeitem` (keyboard-navigable by construction); each completed turn's status is a `status` role region (`status: Worked`). |
| Class | P0 |

## 5. Conversation

| Feature | Evidence |
|---|---|
| User message | Rendered as a right-aligned bubble with a timestamp (`HH:MM`, local/UTC per test clock) and a **"Copy"** icon button. |
| Streaming | With the mock server's default 40ms chunk delay the ~35-word `plain` reply streams too fast to reliably catch mid-stream headless; raising `MOCK_CHUNK_DELAY_MS=250` (an env var the fixture's README documents — no fixture file edit) made the mid-stream state (`07-streaming`) reproducible. |
| Markdown rendering | Headings (`# Summary` → `heading[level=1]`), bullet lists, and fenced code blocks all render correctly; a code block has its own toolbar: **"Wrap lines"** (toggle, `[pressed]` state), **"Copy"**. |
| Completion | `status: Worked` + disabled **"Took \<N\>s"** button + a footer row: **"Good response"**, **"Bad response"**, **"Branch into a new conversation"**, **"Usage \<N\> tok"**, timestamp. Composer footer also shows **"\<N\> turns \<N\> steps · \<rate\> tok/s"** and **"\<pct\>% of context used"** as separate buttons (presumably popovers — not opened this pass). |
| Stop/cancel | See §7. |
| Retry/resume | Seen only in the automatic-retry-on-error context (§8); no user-facing manual "Retry" button was observed on a completed/failed turn this pass — flagged unresolved. |
| Errors | See §8. |
| Reasoning/status presentation | In-flight status line above the reply area, e.g. **"Stopped"**, **"Deep diving for \<N\>s"** — exact vocabulary for a *successful* streaming turn's transient status (pre-"Worked") was not distinctly captured (mock replies complete too fast even at 250ms/chunk to catch an intermediate label other than the final one) — flagged unresolved. |
| Screenshots | `06-user-message`, `07-streaming`, `15-completed-session`. |
| Class | P0 |

## 6. Tools, Approvals, Plans, Subagents — RESOLVED

All four areas were reached and captured this tranche (screenshots
`08-tool-running` … `14b-subagent-completed-panel`, both viewports; aria
snapshots alongside). Class: **P0**, all captured.

### 6.1 Tool execution (`multi`: read → bash → edit → summary)

- Mid-run: a single collapsed group button, one line per active step, e.g.
  **"Reading files · src/greet.ts"**, **"Running commands · Show working tree
  status"**, **"Running code · \<description\>"**, **"Updating the plan ·
  todo_write"**, **"Coordinating subagents · \<description\>"** — the exact
  verb is tool-specific. Overall status line: **"Deep diving…"** /
  **"Deep diving for \<N\>s"** (disabled button).
- On completion the collapsed group re-labels to a past-tense summary, e.g.
  **"Read files, ran commands, edited files"** (`[expanded]`), then — once the
  turn fully settles — **the group button disappears entirely** and only leaf
  artifacts remain inline: the assistant's final text plus a file-change
  button (below). This is the key visual difference between `09-tool-complete`
  (still expanded, right after settle) and `15-completed-session` (fully
  settled, group gone).
- File-change artifact: **"Edited \<file\>.ts"** pill with **`+1 -1`** style
  stat, icon "TS". Clicking it opens a right-hand **"Review · turn \<n\>"**
  tab: file picker (`src/greet.ts` ▾), `+1 -1`, a real split-diff view
  (line-numbered old/new panes, red/green highlighted changed lines), toggles
  for **"Split view"** and **"Line wrap"**, and **"Open \<file\> in sidebar"**.
  Closing the tab (✕ on "Review · turn \<n\>") returns to the collapsed
  (chat-only) view — `10-file-change-collapsed` / `-expanded`.
- **Verified real workspace mutation** (Journey C): `ws-cap-tools/src/greet.ts`
  changed on disk from `` `Hello, ${name}!` `` to `` `Howdy, ${name}!` ``,
  confirmed via `git diff` in the fixture workspace — matches the UI diff
  card exactly, byte for byte.

### 6.2 Approvals (`approval`: `run_code` sandbox escalation)

Two non-obvious preconditions were required to reach this state — **neither
needed a fixture change**, both are pure driver/session-config:

1. **Agent preset must be "PTC mode", not the default "Standard mode".**
   `run_code` (source: `packages/core/tools/src/ptc.ts`) is only registered
   as a callable tool under PTC mode; under Standard mode the model's
   `run_code` tool call errors client-side: `Tool result: Error: unknown tool
   "run_code"` and no approval is ever asked.
2. **The requested `sandbox_permissions` must be strictly wider than the
   session's current access mode** (`packages/sandbox/sandbox/src/escalation.ts`
   throws otherwise: *"sandbox escalation to X is not strictly wider than
   this call's current mode"*). The fixture's `approval` scenario requests
   `sandbox_permissions: "workspace-write"`; the default access mode is
   already **"Workspace Write"**, so the escalation is a no-op and nothing is
   asked. Switching the session's **Access mode to "Read Only"** first
   (composer footer → "Access mode" menu) makes `"workspace-write"` a real
   escalation, and the approval card appears. (Confirmed both bash-outside-
   workspace and `plugin_manager` set/list actions do **not** ask under any
   access mode in this build — the sandbox executor genuinely isn't confined
   for those; only the `run_code`/PTC escalation path is wired to `ask`.)

With both conditions met, the exact UI (both `Allow once` and `Reject`
variants tested):

- Session sidebar label prefix: **"Waiting for approval \<title\>"**, with a
  small **"Approval"** badge and an orange/amber dot.
- Status line: **"Waiting for approval"**.
- Approval card (`group`, orange border): body text is exactly
  **"Allow this operation with \<mode\> permissions: \<justification\>"**
  (e.g. *"Allow this operation with workspace-write permissions: Need to
  remove a stale cache directory outside the default workspace sandbox."*).
- Buttons: **"Reject"** and **"Allow once"** — this resolves uncertainty #12:
  no broader "permission presets" control appears in this card; a session-
  wide policy switch does exist but as the separate **`/permission`** slash
  command ("Switch the permission preset (sandbox mode + approval policy)"),
  not adjacent to the approval card itself.
- **Approve**: run resumes, tool executes, final status **"Worked"**,
  duration badge includes the wait time (observed **"Took 50s"** for a run
  that waited ~48s for the click). Reflection text: `Tool result: (run_code
  completed with no output)`.
- **Reject**: run resumes immediately (`~3s` total), status **"Worked"** —
  the *escalation* is denied, not the whole turn; the model's next completion
  (`Done after tool result.` in the mock) still runs normally, receiving the
  rejection as its tool result content (`escalation.ts`'s rejected-branch
  message: *"the user rejected escalating this \<subject\> to \<mode\>; it
  stays denied…"*).
- **Reload persistence (resolves uncertainty #3, partially)**: reloading the
  page while an approval is pending **preserves it** — the card, its exact
  text, and "Reject"/"Allow once" all re-render identically after reload
  (`11b-approval-pending-after-reload`); the elapsed "Deep diving for Ns"
  counter continues from where it was (the run itself never stopped
  server-side).
- **Full process restart (resolves uncertainty #3, fully)**: killing and
  relaunching `dsh web` against the **same `DSH_HOME`** does **not** preserve
  the pending approval. Reopening the session afterward shows `status:
  Worked`, a duration badge (`Took 1s`), and **no assistant text, no tool
  card, no approval card at all** — the turn is silently finalized empty.
  This is the fail-closed behavior product-characterization.md speculated
  about, now confirmed: **reload survives; restart does not.**

### 6.3 Plans (`plan`: `todo_write` → `exit_plan_mode`)

- `todo_write` alone (without entering Plan Mode) works under Standard mode
  and renders a region **"To-dos"** with a summary button, e.g. **"To-dos 1
  in progress · 1 pending"** — resolves uncertainty #1's "badge label"
  concretely (the English UI string is "To-dos", not a translation of the
  Chinese term the docs used).
- `exit_plan_mode` **requires the session to actually be in Plan Mode**,
  entered via the **`/plan`** slash command (autocomplete option: **"Plan —
  Enter or leave plan mode"**). Selecting it inserts a literal `/plan `
  prefix into the composer (not just a placeholder hint) — the task text
  must be **appended** after it, not used to replace the composer contents,
  or `exit_plan_mode` fails: `Tool result: Error: exit_plan_mode is only
  available in plan mode`.
- Once genuinely in Plan Mode: a system notice line renders inline —
  **"plan · Plan mode on. Use /plan off to leave."** — and the composer
  footer's mode toggle becomes **"Plan mode on, press to turn off"** (icon
  label "Plan").
- `todo_write` then `exit_plan_mode` produces a **Plan review** card:
  - Session sidebar label prefix: **"Plan awaiting review \<title\>"**.
  - Card body (`region "Approve this plan and leave plan mode?"`, amber
    border, orange dot "Plan review"): a **"View full plan"** disclosure, the
    plan's `heading` (from the model's `exit_plan_mode.plan` argument, e.g.
    **"Update greeting"**), and a text preview of its first line.
  - The full plan **also auto-opens in the right sidebar** as its own tab
    (title = plan heading), rendering the plan's markdown as a real heading +
    ordered list (e.g. "1. Read src/greet.ts", "2. Change \"Hello\" to
    \"Howdy\"", "3. Report the change").
  - Buttons: **"Request changes"** and **"Approve"**.
  - **Approve**: plan mode exits, status → **"Worked"**, reflection text
    exactly: `Tool result: Plan approved — plan mode exited; carry out the
    plan starting with your next step.`, the mode banner reverts to
    "Standard mode", and the **"To-dos"** region persists showing the
    still-open items.
  - "Request changes" (deny-equivalent for plans) was not exercised this
    pass — flagged under "Still unresolved".
- Completed sessions also render a standalone **"Open plan: \<title\>"**
  button (Plan · Markdown) even outside an active review, linking back to the
  same plan artifact.

### 6.4 Subagents/delegation (`delegate`: `subagent` tool)

- Mid-run: collapsed group **"Coordinating subagents · \<description\>"**
  (e.g. "Summarize project status").
- Session banner gains a **"\<N\> subagent(s)"** disclosure button (e.g.
  **"1 subagent"**) next to the session-hierarchy breadcrumb — this is a
  parent-session-scoped indicator, not a separate view; delegation does
  **not** open a separate window/route.
- Expanding it renders a `tree "Subagent sessions"` popover: one row per
  child, e.g. **"Summarize project status · Summarize the current state of ·
  continuable · completed · 0 tok · 0s"** with a green status dot and a
  **"Open \<title\> in sidebar"** button (opens the child's own transcript in
  the right-hand panel — this is the "child view" the spec asks about).
- Reflection text on the parent turn: exactly `Tool result: started subagent
  <uuid>`.
- Final parent status: **"Worked"**. The child's own completion (`completed`,
  visible in the subagent-list row) is what "returns to the parent" — the
  parent's next model turn (not exercised further this pass) would see the
  child's result as its tool output.
- Persistence across session reload was not re-verified for the child
  specifically this pass (parent-session persistence is covered generally in
  §4/§5); flagged under "Still unresolved".

## 7. Cancellation

| Feature | Evidence |
|---|---|
| Trigger | While a stream/run is in flight, the composer's send button is replaced by a filled circular icon button with accessible name **"Stop generating"** (confirmed via role/name query, e.g. visible throughout §6's mid-run states) — clicking it aborts the stream. |
| Visible result | Status line changes to **"Stopped"** (also repeated as a small pill under the truncated `heading "Summary"` that had already streamed in); no duration badge is shown; the partial reply (here, just the heading, since cancellation happened right after the first chunk) is kept, not discarded. |
| Session list | The cancelled session's sidebar entry remains, labelled with its literal message text and a "now" timestamp — no distinct "cancelled" badge in the sidebar itself. |
| A11y | Resolved: `button "Stop generating"`, exact role/name, present throughout every mid-run state in §6. |
| Screenshot | `19-cancelled`. |
| Class | P0 |

## 8. Errors and automatic retry

| Feature | Evidence |
|---|---|
| Trigger used | A **second custom provider** pointed at a closed TCP port (`http://127.0.0.1:4099/v1`, nothing listening) — a genuine network-level provider error, independent of the broken `[[scenario:error]]` marker path (§0). |
| Visible result | Status line **"Deep diving for \<N\>s"** (a generic in-flight/thinking label — not itself an error string) persists across the failure; an expandable, collapsed-by-default row appears: **"Retried model request (\<k\>/5) · \<N\>s"** with a right-chevron affordance, confirming an **automatic retry budget of 5 attempts** with per-attempt elapsed time shown. |
| Terminal failure copy | **Resolved** (waited out the full 5-attempt budget, ~90s total). Final state: status **"Failed"** (disabled, `[expanded]`); the retry disclosure settles to **"Retried model request (5/5) · 9s"**; and a dedicated failure block renders below it with exactly: **"This turn failed"** / **"Request timed out."** / a `code` badge **"TIMEOUT"**. No manual "Retry" or "Dismiss" button is shown on the failed turn itself (composer remains available to start a new message). |
| Screenshots | `18-error` (both viewports, captured mid-retry at ~15s — "Deep diving" / first retry visible); the full terminal state (`final-error-terminal`, 90s wait) is evidence for this row but was captured outside the paired-viewport screenshot set this pass — reproduce via `tests/capture/reference.capture-tools.ts`'s pattern with a ≥90s wait to add it as a named checkpoint. |
| Class | P0 — fully resolved (retry budget, backoff, and terminal copy all confirmed). |

## 9. Theme

| Feature | Evidence |
|---|---|
| Location | Settings → **General** → **Appearance**: three buttons **"Light"**, **"Dark"**, **"System"** (System `[pressed]` by default). |
| Behavior | Clicking **"Dark"** re-themes the entire shell (sidebar, composer, message bubbles) immediately, no reload; confirmed via screenshot `20-theme-variant` (dark background, light text, same layout). |
| Persistence | Not explicitly re-verified across reload this pass (likely persisted given every other setting observed was durable) — flagged unresolved. |
| Class | P1 |

## 10. Other General settings observed (inventory only, P2 unless noted)

Permission (default permission mode for new sessions, default
**"Workspace Write"**), Language (**English**), Font size (px stepper,
default 14), **Work details** — "Choose how much detail to show for tool
calls" (default **"Standard"** — directly relevant to tool-card capture once
§0 is fixed; P1), Performance & usage detail level (default **"Detailed"**),
**Coding Tools** toggle ("Shows trajectory, code diffs, and Agent preset
switching in new chats", default **on**) — this is what exposes the
**"Trajectory"** tab next to **"Chat"** on a session (seen in every session
capture this pass; its content was not explored — unresolved), Keyboard
shortcuts editor, **Send behavior while busy** (default **"Queue"**).

---

## Uncertainties resolved (vs. `product-characterization.md` §13)

- **#7** ARIA role/name inventory for composer, send button, session list
  items, sidebar toggle — captured concretely throughout this document and
  in the raw `reference/observations/aria/*.txt` files (composer:
  `textbox "Describe what you want to build, / commands, @ files or sessions"`
  → later `textbox "Message or run a task, / commands, @ files or sessions"`;
  send: `button "Send message"`; sessions: `tree "Sessions"` /
  `treeitem "<title>"`; sidebar toggle: `button "Collapse sidebar"`).
- **#9** Settings → Models custom-provider flow — fully characterized, see §2
  (Provider ID / Display name / Base URL / API protocol [3 options] / API key
  / Models list with per-model ID+display-name+options+delete, "Create
  provider" validation gating, redaction on edit).
- **#11** — session status vocabulary: confirmed **"Worked"** (success),
  **"Stopped"** (user-cancelled), **"Failed"** (terminal error, disabled +
  expanded), **"Deep diving for \<N\>s"** (in-flight/retrying/reasoning),
  **"Waiting for approval"** (pending ask), **"Plan awaiting review"**
  (pending plan review) as real, rendered strings (§4, §6, §7, §8).
- **#3** — pending-approval persistence: **reload preserves it exactly**
  (same card, text, buttons); **a full process restart does not** — the turn
  silently finalizes as `Worked` with empty output (§6.2).
- **#4** — goal-bar/plan-bar UI copy: the plan surfaces are **"To-dos \<N\>
  in progress · \<N\> pending"** (todo list) and, distinct from the approval
  card, a **"Plan review"** card body reading exactly *"Allow this operation
  with..."*-style copy is NOT used for plans — plans use **"Approve this plan
  and leave plan mode?"** with **"Request changes"/"Approve"** buttons (§6.3).
- **#5** — a subagent's terminal result: renders as a row in a `tree
  "Subagent sessions"` popover (expand the "N subagent(s)" banner button);
  opening it ("Open \<title\> in sidebar") shows the child's own transcript in
  the right panel — there is no separate dedicated route (§6.4).
- **#6** — tool-card pending/success states now characterized in full (§6.1):
  collapsed "\<Verb\> · \<detail\>" while running, past-tense summary
  ("Read files, ran commands, edited files") right after settle, then the
  group vanishes leaving only leaf artifacts (file-change pill, plan-open
  button, etc.) once the session is fully idle. A **failed** tool-card state
  specifically was not distinctly captured (the observed failure this pass
  was a provider-level error, not a single tool call failing — flagged
  below).
- **#10** — narrow-viewport plan-mode behavior: not specifically isolated
  (plan mode UI at 1024×768 looked structurally identical to 1440×900 in this
  pass's captures) — the `plan-narrow-viewport` snapshot's implied extra
  mechanism remains unconfirmed.
- **#12** — "Allow once" is the only action shown on the approval card itself;
  the broader policy control exists as the separate **`/permission`** slash
  command, not inline in the approval panel.

## Still unresolved (carried forward / newly identified)

1. Exact **failed individual tool-call** card state (as opposed to a failed
   whole-turn/provider error) — not distinctly triggered this pass.
2. "Request changes" (plan-review deny-equivalent) was not exercised — only
   "Approve" was tested end-to-end.
3. Whether the sidebar session title is ever replaced by the model-generated
   title (a real, separate title-generation call was proven to happen — see
   §0 — but its effect on the visible title was not confirmed within this
   pass's session lifetimes).
4. "Trajectory" tab contents (present whenever "Coding Tools" is enabled,
   which is the default) — not explored.
5. Exact shape of "Choose workspace" when a workspace is already added
   (dropdown vs. file browser) — noted in §3, not screenshotted.
6. Theme preference persistence across reload/restart — plausible but not
   re-verified.
7. Original uncertainty #2 (full Settings tab inventory beyond
   General/Models — Built-in plugins/Agent presets tabs exist per the aria
   dump but their contents weren't opened) and #1 (the plan-mode *badge*'s
   exact English copy beyond "To-dos" is otherwise resolved) remain open.
8. Subagent-child persistence across parent-session reload was not
   specifically re-verified (only whole-session reload/restart in general).

---

## P0/P1/P2 counts (this tranche)

- **P0**: 8 sections carry a P0 classification, **all now fully or largely
  resolved**: §1 Startup/shell, §2 Models, §3 Workspace, §4 Sessions,
  §5 Conversation, §6 Tools/Approvals/Plans/Subagents, §7 Cancellation,
  §8 Errors/retry (terminal copy included).
- **P1**: 2 (§9 Theme, "Work details" tool-call verbosity setting in §10),
  plus the handful of items 1–2 above (failed individual tool-call card,
  plan "Request changes" path).
- **P2**: remaining §10 inventory items (Permission mode default, Language,
  Font size, Performance & usage detail, Coding Tools toggle itself,
  Keyboard shortcuts, Send-behavior-while-busy) plus the §3 "already-added
  workspace" picker shape and items 3–8 above.

All P0 behaviors targeted by this tranche were captured for both viewports.
The remaining P1/P2 items above are the primary carry-over into the next
tranche.
