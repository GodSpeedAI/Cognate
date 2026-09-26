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
`tests/drivers/reference.ts`, `tests/capture/reference.capture.ts`.

---

## 0. CRITICAL — mock-model scenario routing is broken end-to-end via the real UI

**This blocks every non-`plain` scenario capture (`read`, `edit`, `shell`,
`multi`, `approval`, `plan`, `delegate`, `error`, `interrupt`, `retry`) when
driven through the actual reference product**, and is the single most
important finding of this tranche.

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
- **Impact on this tranche**: checkpoints `08-tool-running`, `09-tool-complete`,
  `10-file-change`, `11-approval-pending`, `12-approval-resolved`,
  `13-plan-active`, `14-subagent-active` from the spec's checkpoint list were
  **not captured** — they cannot be reached with the fixture as committed.
  Journeys C/D/E/F (tool execution, approval, plan, delegation) are equally
  blocked for the *reference* side of the future parity suite until this is
  fixed.
- Everything else in this document (startup, settings/models, workspace,
  plain conversation, session history, reload/restart persistence, a genuine
  provider-level error/retry, cancellation, theme) does **not** depend on
  scenario routing and was captured normally.

## 0b. Secondary bug — mock server crashes on client-aborted stream

- Class: P2 (test-infra robustness, not a product bug).
- `fixtures/mock-model/server.ts` line ~336 throws unhandled
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
| Process restart | Not exercised this pass (would require killing and relaunching the `dsh web` process against the same `DSH_HOME` — planned for the parity-journey suite, Journey G). Flagged under "Still unresolved". |
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

## 6. Tools, Approvals, Plans, Subagents — BLOCKED this tranche

Per §0, `[[scenario:read/edit/shell/multi/approval/plan/delegate]]` all
resolve to the generic `plain` reply through the live reference UI because of
the fixture's last-user-message assumption. **No tool card, approval panel,
plan panel, or subagent card was observed this pass**, and none of
uncertainties #4–#6, #10, #12 from `product-characterization.md` §13 could be
resolved. This is recorded as the primary blocker (§0) rather than restated
per-feature here. Re-run Phase 3/4 for these sections once the fixture fix in
§0 lands (or a hand-crafted, non-marker-based mock request is substituted for
this investigation only).

The driver (`tests/drivers/reference.ts`) ships best-guess locators for
`approveButton`/`denyButton`/`toolCard`/`planPanel`/`subagentCard` (regex on
likely button text / class-name substrings) but **these are unverified** —
marked clearly in code comments — and must be corrected once real approval/
plan/tool UI can be reached.

Class: **P0 (blocked)**.

## 7. Cancellation

| Feature | Evidence |
|---|---|
| Trigger | While a (slowed, 250ms/chunk) stream is in flight, the composer's send button is replaced by a filled **square "Stop"-shaped icon button** (send-button slot; exact accessible name not confirmed — see below) — clicking it aborts the stream. |
| Visible result | Status line changes to **"Stopped"** (also repeated as a small pill under the truncated `heading "Summary"` that had already streamed in); no duration badge is shown; the partial reply (here, just the heading, since cancellation happened right after the first chunk) is kept, not discarded. |
| Session list | The cancelled session's sidebar entry remains, labelled with its literal message text and a "now" timestamp — no distinct "cancelled" badge in the sidebar itself. |
| A11y gap | The stop-button's accessible name was **not confirmed** — the capture script located it by CSS/positional heuristics, not a stable role/name query; **flagged for follow-up** (see "Still unresolved"). |
| Screenshot | `19-cancelled`. |
| Class | P0 |

## 8. Errors and automatic retry

| Feature | Evidence |
|---|---|
| Trigger used | A **second custom provider** pointed at a closed TCP port (`http://127.0.0.1:4099/v1`, nothing listening) — a genuine network-level provider error, independent of the broken `[[scenario:error]]` marker path (§0). |
| Visible result | Status line **"Deep diving for \<N\>s"** (a generic in-flight/thinking label — not itself an error string) persists across the failure; an expandable, collapsed-by-default row appears: **"Retried model request (\<k\>/5) · \<N\>s"** with a right-chevron affordance, confirming an **automatic retry budget of 5 attempts** with per-attempt elapsed time shown. |
| Terminal failure copy | **Not captured** — even after ~15s / 1 visible retry, the reference had not yet exhausted its retry budget and shown a terminal error banner. Exact terminal error copy, icon, and any manual "Retry"/"Dismiss" affordance are **unresolved** — would need a longer wait (the 5-attempt budget with observed ~1s per early attempt suggests real backoff growth; plan for ≥60s in a follow-up capture). |
| Screenshots | `18-error` (desktop, 15s wait — still "Deep diving"), `18-error` (laptop, same wait — shows the "Retried model request (1/5) · 1s" disclosure row, not visible in the desktop capture at the same elapsed time, suggesting some timing variance between runs). |
| Class | P0 (the retry/backoff behavior itself is now confirmed; the terminal state is P1/unresolved). |

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
- Partial **#11** — session status vocabulary: confirmed **"Worked"**
  (success), **"Stopped"** (user-cancelled), **"Deep diving for \<N\>s"**
  (in-flight/retrying) as real, rendered strings. `active`/`failed` terminal
  labels beyond these were not reached (see unresolved).

## Still unresolved (carried forward / newly identified)

1. **§0 fixture bug** — blocks tool/approval/plan/delegate/subagent capture
   entirely; needs the `extractScenario` fix described in §0 before Phase 3/4
   can be completed for those sections.
2. **§0b fixture robustness** — mock server crashes (uncaught exception) on
   client-aborted stream; needs a try/catch around the SSE write loop.
3. Exact terminal error banner copy/affordances (§8) — retry budget (5
   attempts) confirmed, terminal state not reached within this pass's wait
   budget.
4. Exact accessible name of the in-flight "Stop" button (§7) — currently
   located heuristically, not via a confirmed role/name query.
5. Whether the sidebar session title is ever replaced by the model-generated
   title (a real, separate title-generation call was proven to happen — see
   §0 — but its effect on the visible title was not confirmed within this
   pass's session lifetimes).
6. "Trajectory" tab contents (present whenever "Coding Tools" is enabled,
   which is the default) — not explored.
7. Exact shape of "Choose workspace" when a workspace is already added
   (dropdown vs. file browser) — noted in §3, not screenshotted.
8. Theme preference persistence across reload/restart — plausible but not
   re-verified.
9. Original uncertainties #1 (plan-mode badge English text), #2 (full
   Settings tab inventory beyond General/Models — Built-in plugins/Agent
   presets tabs exist per the aria dump but their contents weren't opened),
   #3 (approval persistence across reload), #4–#6, #10, #12 (all
   plan/approval/subagent/narrow-viewport specifics) remain **fully
   unresolved**, gated on fixing §0.

---

## P0/P1/P2 counts (this tranche)

- **P0**: 8 sections carry a P0 classification (§1 Startup/shell, §2 Models,
  §3 Workspace, §4 Sessions, §5 Conversation, §6 Tools/Approvals/Plans —
  *blocked*, §7 Cancellation, §8 Errors/retry).
- **P1**: 2 (§9 Theme, "Work details" tool-call verbosity setting in §10).
- **P2**: remaining §10 inventory items (Permission mode default, Language,
  Font size, Performance & usage detail, Coding Tools toggle itself,
  Keyboard shortcuts, Send-behavior-while-busy) plus §0b (fixture crash
  robustness) and the §3 "already-added workspace" picker shape.

All P0 behaviors that were reachable this pass were captured for both
viewports; the P0 behaviors gated on §0 (tools/approvals/plans/subagents)
are the primary carry-over into the next tranche.
