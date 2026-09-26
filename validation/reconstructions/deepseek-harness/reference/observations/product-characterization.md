# DeepSeek Harness — Web UI Product Characterization

Reference clone: `/home/sprime01/projects/cognate/.tmp/ref/deepseek-harness`, pinned at commit
`477b4f420553e8a52c2fbccc464d7561b239c443` (v0.1.7-rc.2). Read-only. All paths below are relative
to that repo root unless given as absolute paths.

## 1. Doc/source map

- `README.md` — root: run commands, `npx @deepseek-ai/dsh-ai/dsh web`, Web UI URL, dev commands.
- `docs/architecture.md` — turn/step lifecycle, agent-loop pre-step/request/post-step model.
- `docs/user/guide/index.md` — "Use the Web UI": configure model, choose workspace, run task, continue.
- `docs/user/guide/providers.md` — provider/model configuration guide (DeepSeek, third-party, custom endpoint).
- `docs/subsystems/README.md` — subsystem index/map.
- `docs/subsystems/settings.md` — settings seam (schema, namespaces, forms).
- `docs/subsystems/session.md` — session event vocabulary, `SessionEventMap`, model catalog, selectModel.
- `docs/subsystems/session-title.md` — title generation (`first-prompt` / `all-prompts` modes).
- `docs/subsystems/sidebar-right.md` — right sidebar tab types (guide, text, files, browser, document preview).
- `docs/subsystems/workspace.md` — workspace entity, registry, default-workspace init, session pinning.
- `docs/subsystems/web-client.md` — client architecture layers, data paths, package boundaries.
- `docs/subsystems/web-server.md` — HTTP server, `authenticatedUrl` token handoff, connection trust.
- `docs/subsystems/approval.md` — user-approval seam, policy, request/outcome vocabulary.
- `docs/subsystems/plan.md` — plan mode logged state, `exit_plan_mode` tool, `/plan` command.
- `docs/subsystems/goal.md` — same-session goals: phases, blocked reasons, activation.
- `docs/subsystems/subagent.md` — subagent runtime, catalog, continuable children, statuses.
- `docs/subsystems/conversation.md` — conversation assembly, target snapshots (chat/trajectory).
- `docs/subsystems/tools.md` — tool definitions, execution waterfall, tool-presentation UI vocabulary.
- `docs/subsystems/todo.md` — `TodoItem` durable list entry.
- `docs/persistence-catalog.md` — session persistence event catalog (approval/*, goal/*, plan/*, etc.).
- `docs/tool-catalog.md` — model-facing tool schemas (`exit_plan_mode`, `get_goal`, etc.).
- `docs/ui-radius.md` — DSH corner-radius design tokens (H/R scale).
- `docs/web-styling.md` — web styling ownership (`ui-theme`, `ui-layout`, CSS Modules).
- `packages/client/*` package READMEs (30+ `ui-*` packages) — per-feature UI contracts; used selectively below.
- `packages/client/ui-approval/src/client/locales.ts` — exact approval strings (English/Chinese).
- `packages/client/ui-workspace/src/client/locales.ts` — workspace strings incl. failure copy.
- `packages/client/ui-layout/src/client/columns.ts` — exact sidebar/column geometry constants.
- `packages/client/ui-settings-models/src/onboarding-copy.ts` — onboarding notice versioning.
- `apps/web/tests/expected/*` — ~90 named Playwright/snapshot fixture directories enumerating UI states (see §13).
- `git log --oneline -40` — recent web-affecting changes (schedule/time-context disabled, model-selection background save, auto-review approval localization, user-questions styling).

## 2. Startup & shell

- **Launch**: `npx @deepseek-ai/dsh web` starts the Web UI at `http://127.0.0.1:3080` by default and opens
  the default browser for a local launch; an SSH launch only prints the host URL (README.md "Run from npm").
  `--no-open` suppresses the browser open. `pnpm run dev:web` / `make dev-web` for source dev (builds + serves +
  rebuilds client bundles on edit).
- **Auth handoff**: `ctx.connection.authenticatedUrl(baseUrl)` "Add[s] the fresh process token to an ordinary
  Web application URL" for "initial login" — confirms a **token-in-URL** handoff pattern for first load; a
  mount proxy strips its prefix before `authorizeIndex` (`docs/subsystems/web-server.md` §`ctx.connection`,
  source `packages/client/connection/src/rpc.ts`). `authorizeIndex` "owns a token redirect or 401" for the
  frontend index request.
- **Shell geometry** (`packages/client/ui-layout/src/client/columns.ts`):
  - `CENTER_MIN = 400` px — center (chat) column protected minimum.
  - `SIDEBAR_MIN = 264`, `SIDEBAR_MAX = 420`, `SIDEBAR_DEFAULT = 280` px (left sidebar, drag-resizable).
  - `SIDEBAR_COLLAPSED = 56` px — collapsed rail ("24px icon column between 16px horizontal paddings").
  - `SIDEBAR_AUTO_COLLAPSE = 1024` px viewport — sidebar auto-collapses to rail below this width (a manual
    toggle can re-expand over the squeezed center; state in `stores.ts narrowExpanded`).
  - `RIGHTBAR_MIN = 300` px, `RIGHTBAR_MAX_RATIO = 0.7` of frame, `RIGHTBAR_DEFAULT_RATIO = 0.45` of frame
    on first open. Right column loses its track entirely (0) if remaining space would fall below
    `RIGHTBAR_MIN` after `CENTER_MIN` is honored.
  - On macOS desktop (`html[data-platform='darwin']`, desktop-only), a collapsed sidebar hides its whole
    column and a single `shell.leading` slot near the traffic lights hosts reopen + New Session controls;
    frame publishes `--dsh-frame-leading-clearance` and `--dsh-frame-top-clearance: 48px` CSS vars for
    inset-safe padding (`packages/client/ui-layout` README, Chinese section "窗口 chrome 座"). Windows
    Electron reserves title-bar height via `data-windows-titlebar` and removes the collapsed sidebar track;
    only the top-left content corner keeps a 16px radius (`--dsh-windows-content-radius`,
    `--dsh-windows-sidebar-width`).
  - Right sidebar can go fullscreen: `--dsh-sidebar-width` becomes `100vw`
    (`packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx:318`).
- **App shell layers** (`docs/subsystems/web-client.md` "Layers and ownership"): Host application →
  Transport/API assembly (`client/connection`, `api/gateway`, `api/remotes`) → Client models
  (`api/session-controller/client`, `api/workspace-controller/client`) → UI adapters (`ui-session`,
  `ui-workspace`) → Conversation data (`ui-conversation`, `ui-chat`/`ui-trajectory`) → Composition/rendering
  (`ui-slots`, `ui-renderer`, `ui-layout`).
- **Navigation**: left sidebar lists Workspaces/Sessions with hover cards; a right sidebar hosts a tabbed
  strip of panes (guide/text/files/browser/document-preview — see §7/§10). Sidebar rows: workspace directory
  path, session display title; a "New Session" affordance renders a masked/placeholder label until named.
- **First-use / empty states**: `defaultWorkspace.failed` copy: *"Unable to create default workspace. Use
  Choose workspace to select a folder."* (`packages/client/ui-workspace/src/client/locales.ts:127`). A
  provisional blank "New Session" card is read-only (placeholder, not real content) per
  `ui-workspace` README "Hover cards" section. Onboarding steps exist for native desktop, DeepSeek
  credential-only config, and a general welcome notice (`ui-settings-models/src/onboarding-copy.ts`,
  `WELCOME_NOTICE_VERSION = '2026-08-13.1'`; snapshot fixtures `onboarding-native`, `onboarding-deepseek-config`,
  `onboarding-usable-provider`, `desktop-onboarding`).
- **Theme**: light/dark preference owned by `ui-theme` (`--dsw-*` static scale, semantic aliases, motion,
  shadows, scrollbar styling); `ui-layout` applies the resolved snapshot to the document
  (`docs/web-styling.md`). Snapshot fixture `settings-appearance` covers the Appearance settings page.
- **Responsive breakpoints**: only one documented numeric breakpoint — `SIDEBAR_AUTO_COLLAPSE = 1024`px
  (deepsuite "LG" breakpoint). A `plan-narrow-viewport` snapshot fixture exists, implying at least one
  additional narrow-viewport behavior for Plan UI not otherwise documented (see §13 uncertainties).

## 3. Settings

Settings is a plugin-registered set of pages/tabs; package inventory (from `packages/client/`) gives the
full page list — each is a separate `ui-settings-*` package registering into the `ui-settings` shell:

- `ui-settings` — domain base: shared config forms, schema service, canonical settings-slot contract;
  renders no UI itself, other packages register pages/tabs into it (`README.md` Summary).
- `ui-settings-general` — general page (stores `welcomeNoticeVersion` etc.).
- `ui-settings-account` — account page.
- `ui-settings-models` — **Models** page (see below).
- `ui-settings-agent-loop` — agent-loop related settings (e.g., plan/goal toggles?).
- `ui-settings-shell` — shell/command execution settings.
- `ui-settings-subagent` — subagent-related settings.
- `ui-settings-web-search` — web search provider settings.
- `ui-settings-plugins` / `ui-settings-plugin-inventory` — plugin manager pages.
- Appearance is a page too (test fixture `settings-appearance`; owned by `ui-theme`/`ui-layout` per
  `docs/web-styling.md`).
- Test fixtures confirm page names: `apps/web/tests/expected/{settings-appearance,settings-chrome,
  models-settings,models-settings-recovery,deepseek-messages-settings,plugin-config,plugin-manager}`.

**Settings → Models** (`docs/user/guide/index.md` "Configure a model", `docs/user/guide/providers.md`,
`packages/client/ui-settings-models`):
- Steps: open **Settings → Models**, enter a DeepSeek API key (link to platform.deepseek.com), save.
  "The model route becomes usable immediately without restarting the server" — confirms **hot-apply**,
  no server restart needed; "Model changes take effect on the next request" (`providers.md`).
- Providers guide covers: Configure DeepSeek, Add a third-party provider, Add a custom (OpenAI-compatible)
  endpoint — three configuration flows (`docs/user/guide/providers.md` headings).
- Editor component is `ProviderEditor`; onboarding reuses it "in credential-only mode inside the shared
  onboarding modal" for the DeepSeek step — implies the full editor exposes more than credentials (base
  URL, model list, etc.) when not in that restricted mode.
- Credential writes go through `credentials.set` exclusively ("the only secret write"); provider settings
  (non-secret) are written separately — i.e., **credential values and provider config are stored/edited
  through separate channels**, consistent with redaction (secrets never round-trip to the client
  unmasked — inferred; not directly quoted, see uncertainty in §13).
  Backing seam: `packages/credentials` ("the credential-reference seam this page writes keys through").
- Screenshots referenced in docs: `docs/user/guide/providers-custom-form.png`,
  `docs/user/guide/providers-models-page.png` (and `.zh.png` variants) — visual reference for the Models
  page and custom-provider form (not read as images; filenames indicate a "models page" list view and a
  "custom form" for endpoints).
- **Model/route selector in session UI**: `SessionController.selectModel(request)` — "Select one
  Session-local model after explicitly resuming the Session; save the default in the background"
  (`docs/subsystems/session.md`). `modelCatalog()` — "Describe every currently routable model for
  Host-generation selectors": returns provider-grouped models, deployment default, and isolated provider
  failures. `initializeDefaultModel()` picks "the first available account model after login when no
  provider API key is configured." Client package: `ui-model-selection`. Recent commit
  `24f28dfdb6`/`cad6fef2fd` area: "model-selection-background-save" — selecting a model saves the new
  default asynchronously without blocking the UI (fix commit `86331673d9` "save default model settings in
  the background"). Snapshot fixture: `default-model`.

## 4. Workspace

- A **workspace** = "the persistent record of a directory the user works in: a stable id over a canonical
  path, a display title, and the ordered account of sessions that belong to it"
  (`docs/subsystems/workspace.md`). Host-side only capability — "invisible to models (no tools, no prompt
  text, no session events)".
- **Choose/add**: "Click **Choose workspace**, add the project directory where you started `dsh`, and
  select it" (`docs/user/guide/index.md`). Backed by `ctx.directoryPicker`/`DirectoryPickerController`
  (native or browse variants: packages `host/directory-picker-{auto,browse,native}`,
  `client/ui-directory-picker-{browse,native}`).
- **Composer disabled → enabled**: "The session composer remains unavailable until a workspace is
  selected" (`docs/user/guide/index.md` "Choose a workspace"). Snapshot fixtures:
  `default-workspace`, `workspace-management`, `workspace-new-session-folding`.
- **Persistence**: stored via the storage domain (`docs/persistence.md`/`storage.md` referenced); validated
  against `SessionHeader.cwd` so a session's declared cwd must match its workspace — "mandatory startup
  dependencies: an unavailable persistence peer leaves the plugin pending."
- **Default workspace init**: attempted automatically at boot; on failure shows
  `defaultWorkspace.failed` copy (§2) directing the user to Choose workspace manually.
- **Workspace↔session relation**: one workspace has "the ordered account of sessions that belong to it";
  "Session pinning" section exists (a session can be pinned within its workspace — exact UI affordance not
  read; see uncertainty). Hover card on a Workspace row copies "its full directory path"; hover card on a
  Session row copies "its full display title" (`ui-workspace` README "Hover cards").

## 5. Sessions

- **Create**: `SessionController.create(request)` — "Create or idempotently adopt one ordinary Session"
  given identity, location (workspace path/cwd), and Agent preset.
- **List/history**: `SessionController.list()` returns "visible Session summaries ordered by activity"
  (i.e., sidebar session list is activity-sorted, not creation-order). `search()` does literal
  message-content search without resuming an Agent.
- **Titles**: generated by the session-title subsystem. Two automatic cadences:
  `SessionTitleAutomaticMode = 'first-prompt' | 'all-prompts'` (`docs/subsystems/session-title.md`). A
  provider snapshots eligible human messages through one revision and returns a proposed title; service
  normalizes, enforces a byte limit, and appends with source-message seqs. Auxiliary LLM call is logged
  before dispatch (`SessionTitleLlmRequestEventData`: title provider id, message seqs, route, system
  prompt, messages, max-tokens cap) — i.e., title generation is itself an auditable, replayable LLM call,
  separate from the main conversation route. Snapshot fixture: `deepseek-messages-settings` (settings
  toggle), `cordis-history`.
  There is also a manual-title-provider variant referenced by package names
  `session-title-first-prompt-llm`, `session-title-all-prompts-llm`.
- **Navigation**: sidebar → click a session row to open it in the center column; `ui-session` package owns
  view-level navigation/status policy (client model in `api/session-controller/client`).
- **Reload/restart restoration**: `SessionInspection` lets a client "Inspect one attached or persisted
  Session without activating its Agent," returning "current attached state or persisted header and event
  prefix" — i.e., the sidebar can show session status without fully resuming the agent loop. Durable Session
  display path: Host Session log → packed Remote `follow`/`page` history → Client window →
  Conversation Contexts → target snapshot (chat/trajectory) → Slot view → React
  (`docs/subsystems/web-client.md` "Data paths").
- **States**: model catalog carries "isolated provider failures"; `api-session/status` and
  `api-session/error` events exist (`docs/subsystems/session.md` Cordis events) implying at least
  active/error/idle-style status surfaces. Turn model: a turn is "zero or more steps ... opens before its
  first input is claimed and closes once nothing is owed" (`docs/architecture.md`) — so a session's
  observable state cycles through idle → running (turn open) → idle, with error and interrupted as
  terminal/side states (interrupt confirmed via `subagent` interrupt API, §10). Snapshot fixtures:
  `cold-blank-session`, `new-session-refused`, `session-archive-active`, `stats-paged-history`.
- **Fork/resume**: "Live-session fork API" documented in `docs/subsystems/session.md`; snapshot fixture
  `fork-mid-turn` confirms forking is possible while a turn is in progress. Session archive is a distinct
  state (`session-archive-active` fixture) — sessions can be archived while remaining viewable/active.

## 6. Conversation

- **Assembly**: `docs/subsystems/conversation.md` — durable event correlation projects the session log into
  target-specific "Conversation Contexts," compacting historical Assistant runs into independent target
  snapshots (`chat`, `trajectory`, or other registered targets). `ui-chat` and `ui-trajectory` implement
  parallel logic against the same event stream — i.e., **Chat view and Trajectory view are two independent
  renderers over the same underlying event log**, not variants of one component.
  Package boundary rule: "Target-specific Conversation Definitions ... stay with their target package even
  when Chat and Trajectory intentionally implement parallel logic."
- **Streaming**: LLM streaming subsystem is `docs/subsystems/llm-streaming.md` (not fully read; referenced
  by `ContentBlock`/`MessageId` types used across subagent/session docs).
- **Reasoning display**: snapshot fixtures `declared-reasoning`, `reasoning-preview`, `thinking-markdown` —
  reasoning/thinking content is rendered distinctly from the final answer, with a preview state and
  markdown formatting for "thinking" blocks.
- **Markdown/code**: fixtures `markdown-cjk-strong`, `markdown-images`, `markdown-inline-code-links`,
  `markdown-wide-table`, `math-rendering`, `clickable-links-gallery` — markdown renderer supports CJK bold,
  inline images, inline-code-as-link, wide tables (own scroll container per artifact responsive rules),
  math (LaTeX-style), and a "gallery" of clickable link types.
- **Attachments**: fixture `file-upload-round` — file upload with a round-trip confirmation state; backed by
  `packages/attachment/{attachment,attachment-local}`, client `ui-attachment`.
- **Running indicators / stop/cancel**: fixture `steer-all` — a "steer" action can redirect an in-flight
  turn (see also `agent.steer()` used by `/plan <message>`, §9). Subagent interrupt API
  (`interruptByParent`) "authorizes the address against the live Activation ... keeps a live child
  interruptible while its parent Agent is offline" — cancel/interrupt works even for a currently-detached
  parent.
- **Retry/errors**: fixtures `bonus-notice`, `quota-notice`, `max-tokens-notice` — distinct inline notices
  for promotional/bonus state, quota exhaustion, and hitting the max-token cap (each likely a dismissible
  banner in the composer/conversation area, exact copy not confirmed — see §13).
- **Virtualization**: fixture `trajectory-virtualization` — the Trajectory view virtualizes long histories
  for performance.

## 7. Tools

Built-in tool families found under `packages/` (each with a `dsh-tool-*` model-facing schema):
`tool-fs` (read/write/edit files), `tool-fs-search`, `tool-str-replace-editor`, `tool-bash` (shell,
under `packages/shell`), `tool-goal`, `tool-ask-user` (user-questions), `tool-jobs`, `tool-session-query`,
`tool-present` (deliverables), plus provider tools under `web` (search/fetch), `computer-use`,
`browser-use`, `mcp` (external tools), `todo_write` (`packages/todo`). Full machine-facing catalog:
`docs/tool-catalog.md`.

**Tool call rendering** (`docs/subsystems/tools.md` "Tool-presentation UI vocabulary";
`packages/client/ui-tool` README "Cards"):
- "Every card is read in place in the call tree; there is no second, full-height presentation of a
  selected call" — i.e., no modal/detail-view for a tool call, only inline expand.
- "Row renderers share one pure card model for each terminal, read, diff, search, and web card" — five
  card kinds: **terminal**, **read**, **diff**, **search**, **web** (plus an **image** card with its own
  gallery via slot `tool.call.images`).
- Models "validate raw call arguments, result content, failure state, persisted metadata, PTC dispatch
  `parentCallId`, and Session path facts." Unsupported/malformed input falls back to flattened tool-result
  text.
- File-path summary → click opens the file via `openFile`, routed by the chat view to the **right
  Sidebar's text preview** (cross-links §2/§10). An `inspect` action opens the **trajectory view**
  (omitted/absent when trajectory view unavailable).
- **Diff card**: "keep nine rows before folding, enough for a file header, one removed/added pair, and
  three context lines on either side." The collapsed tool row shows exact-or-coarse replacement counts;
  expanded card omits a totals footer.
- **Denial rendering**: "An Auto denial takes precedence over keyed specialized views" — generic row
  preserves call identity, omits raw arguments, normalizes the stored reason for display (trim whitespace,
  collapse line separators to spaces).
- Pending/success/fail states are implied by `tools/pre-execute`, `tools/execute`, `tools/post-execute`,
  `tools/result` Cordis waterfall events (`docs/subsystems/tools.md`), each presumably driving a card's
  visual state transition (exact CSS/labels not confirmed — §13).
- Fixtures: `search-card`, `todo-row`, `trajectory-virtualization`.

## 8. Approvals

- **Seam**: `docs/subsystems/approval.md` — `ctx.approval` dispatch service, `approval/request` answerer
  waterfall (agent-scoped), log-only audit pair (`approval/asked`→`approval/decided`), per-session
  `ask`/`never` policy (`ApprovalPolicy`). "Callers ... consume the closed outcome and fail closed unless
  it is `allowed-once`" — **default-deny**: anything other than an explicit `allowed-once` outcome blocks
  the action.
- **When triggered**: policy is per-session (`approval/policy` event, "the LAST such event is the
  session's override"); a `source: 'delegation'` marks an override seeded into a child session at
  delegation time (so a subagent can inherit/override its parent's approval policy).
- **UI wording** (exact, English — `packages/client/ui-approval/src/client/locales.ts`):
  | key | English string |
  |---|---|
  | `waiting` | "Waiting for approval" |
  | `detail.aria` | "Approval details" (used as `aria-label` on the detail region) |
  | `escalation` | "Tool {toolName} requests privileged execution" |
  | `reject` | "Reject" |
  | `allowOnce` | "Allow once" |
  (Chinese equivalents: 等待审批 / 审批详情 / 工具 {toolName} 请求越权执行 / 拒绝 / 允许一次.)
  Only two decision buttons are confirmed in this component: **Reject** and **Allow once** — no
  persistent "always allow" button surfaced here (a separate `permission-presets` package may own
  broader policy changes; not confirmed as a same-panel button — see §13).
- **Keyboard behavior**: "Focus the approval detail region to approve with Enter or reject with Escape.
  ... Enter on the focused Reject button retains its native reject action." Keyboard and pointer actions
  share one pending-request lock: "a withdrawn or replaced request cannot accept another answer, and an
  earlier failed answer cannot unlock its replacement."
- **Persistence of pending approvals**: approval requests are dispatched live (waterfall), and outcomes are
  logged (`approval/decided`, exactly one per `approval/asked` id) — the request itself is not shown to
  be durably replayed as a re-askable UI state across reload (a fail-closed `'unavailable'` outcome is
  recorded if no answerer responds, e.g., across a reload/disconnect) — see §13 for confirmation via
  running the app.
- **After decide**: `approval/decided` outcome is appended; the tool call proceeds (`allowed-once`) or the
  tool call fails (`Reject`/`unavailable`). Recent fix commit `0a134ef94e` "localize the approval prompt
  and sync docs with the ask fallback"; `f84891eaff`/`374b9cc1fb` involve "auto-review-user-approval" —
  an automated review path can also request approval.

## 9. Plans/goals

**Plan mode** (`docs/subsystems/plan.md`, `packages/client/ui-plan`):
- Mechanism: `plan/mode` is a log-only whole-value-replace session event `{active: boolean}` — never in
  the model transcript. `ctx.planMode.set(agent, active)` returns `'committed' | 'queued' | 'cancelled' |
  'noop'` — mid-turn toggles are **queued** until the next accepted in-turn pre-step, not applied
  instantly.
- Exit tool `exit_plan_mode` (model-facing, `docs/tool-catalog.md`): takes `{plan: string}` (markdown,
  must start with `#` heading); presents the plan for user review via the user-questions seam; user may
  **approve** (carry out from next step) or **keep planning** (feedback returned as a failed tool call, model
  revises and re-presents).
- `/plan [off|message]` command: bare `/plan` enables plan mode; `/plan <text>` enables it and submits
  `<text>` as the next step's user message via `agent.steer()`; `/plan off` disables (cancels a pending
  queued entry if not yet applied).
- **UI presentation** (`ui-plan` README, Chinese "徽章显示什么" = "What the badge shows"): while plan mode
  is the effective target, a **blue "计划" (Plan) status badge/button** renders with a plan icon before the
  label; on hover/keyboard-focus while active/clickable, the icon morphs into a circular **×** button,
  clicking which runs `/plan off`. Otherwise the slot renders empty (host without plan-mode composed, or a
  Draft with no session yet, show nothing). While plan mode is the effective target, the composer
  placeholder switches to a plan-specific prompt: **"describe your task to generate plan"** (unless the
  hosting surface supplies its own placeholder).
- **Status values**: plan mode is boolean (`active`/inactive) with a `pending` (queued) transitional flag
  exposed to clients as `{ active, pending? }`. Snapshot fixtures: `plan-review`, `plan-narrow-viewport`,
  `goal-command-presentation` (shared fixture naming with goals).

**Goals** (`docs/subsystems/goal.md`, `packages/client/ui-goal`, tool `get_goal`/`update_goal`):
- `GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'` — four durable lifecycle states.
- `blocked` carries a `GoalBlockReason { code (lower-kebab), message }` shown to humans and models.
- `GoalSnapshot` also carries `objective` (human-requested completion text) and `maxGoalRounds` (round cap);
  `GoalView` adds `roundsStarted`, `createdAt`, `updatedAt`, and process-local `activation` (continuation
  eligibility, not persisted). `goal/activation-changed` is a live (non-durable) event UI consumes for
  status.
- Tool `get_goal` reads id/revision needed for `update_goal` — goals use optimistic **compare-and-set**
  via `GoalRef{id, revision}`.
- **UI**: a "goal bar" (fixture `goal-bar`) presumably renders `objective` + `phase` + progress
  (`roundsStarted`/`maxGoalRounds`); exact copy/labels not directly read (§13).

Note: recent commits `f9564a0d48`/`cad6fef2fd` "disable shipped schedule and time context plugins" — the
`schedule` (packages/schedule) and `context/time-context` plugins are **disabled by default** as of this
pin, with a matching test change (`374b9cc1fb`).

## 10. Subagents/delegation

- Seam: `docs/subsystems/subagent.md`, `packages/subagent/subagent`, client `packages/client/ui-subagent`.
- Two capability kinds, "discovered two ways": one-shot (`SubagentRun`/`start()`) vs. continuable children
  (resident, addressable, interruptible) — `SubagentProvider` registry is `ctx.subagents.registerProvider`.
- **Status model**: model-facing `list_agents` reports only `'running' | 'inactive'` — "These values do not
  describe task completion or guarantee that `send_message` will succeed." So the UI's own richer status
  must derive from Session status/catalog, not the model tool surface.
- **Enumeration**: `listChildren(parentSessionId)` returns direct children in parent event order (no child
  log reads); `listDescendants(rootSessionId)` recurses pre-order, marking `hasChildren`, `depth`
  (edge-distance from root), and diagnostics `unsupported`/`corrupt`/`unavailable` per unreadable branch.
  "Browser rows derive membership from the shared projection store and add activity from Session status;
  the control stream pushes complete catalog updates" — i.e., **subagent list in the UI is a live-pushed
  catalog**, not polled.
- **UI presentation**: fixtures `sidebar-subagent-activity`, `agent-preset-authoring`,
  `agent-preset-selection` — subagents surface as a **sidebar activity view** (not a full separate page),
  alongside an "Agent preset" authoring/selection UI (`ui-agent-preset` package) for configuring subagent
  presets. Cross-agent "send_message" from a browser/UI actor is possible: "Deliver one browser-authored
  message to a continuable child through the exact live direct parent"; queue vs. steer delivery targets a
  later turn vs. the nearest step, respectively. Image parts are supported in these delegated messages if
  the child's model accepts image input.
- **Return to parent**: no explicit "return value bubble" UI described in docs read; `SubagentResult` is
  "the terminal result" type consumed by the parent — implies the parent conversation renders the child's
  terminal result inline (likely as part of the parent's own tool-call/tool-result card per the
  `PTC dispatch parentCallId` field noted in §7) — not independently confirmed for the child's own view; see
  §13.
- **Persistence**: children are recorded in the parent's durable `subagentCatalog` projection (survives
  reload/resume; catalog reads never require resuming the child Agent). Fork isolation and creation/ordering
  rules are owned by an internal Agent Note (`2026-09-01-parent-owned-subagent-catalog.md`, not read).
- **Interrupt**: `interruptByParent(childId, parentId, mode: 'continuable')` works even while the parent
  Agent is offline; absent/idle/already-completed targets are accepted no-ops.

## 11. Exact user-visible strings & aria roles/names

| Area | Control/text | Exact string (source) |
|---|---|---|
| Approval | waiting banner | "Waiting for approval" (`ui-approval/src/client/locales.ts:17`) |
| Approval | detail region aria-label | "Approval details" (`locales.ts:18`, applied at `ApprovalPanel.tsx:72`) |
| Approval | escalation notice | "Tool {toolName} requests privileged execution" (`locales.ts:19`) |
| Approval | reject button | "Reject" (`locales.ts:20`) |
| Approval | allow-once button | "Allow once" (`locales.ts:21`) |
| Workspace | default-workspace failure | "Unable to create default workspace. Use Choose workspace to select a folder." (`ui-workspace/src/client/locales.ts:127`) |
| Workspace | choose-workspace control | "Choose workspace" (`docs/user/guide/index.md`) |
| Plan | composer placeholder while planning | "describe your task to generate plan" (`ui-plan` README) |
| Plan | badge label | "计划" (Chinese doc only; confirmed English label not read — likely "Plan", see §13) |
| Model | onboarding welcome notice version | `2026-08-13.1` (internal id, not user text) |
| Web launch | default URL | `http://127.0.0.1:3080` (README.md) |

Full component-level aria roles beyond `detail.aria` were not enumerated from source in this pass (time-
boxed); §13 lists this as a Playwright follow-up.

## 12. Candidate P0/P1/P2 classification

**P0 (must-have for a recognizable rebuild):**
- App shell: resizable/collapsible left sidebar (workspace+session list), center chat column, optional
  right sidebar with tabs; documented geometry constants (§2).
- Workspace choose/select gating the composer.
- Session create/list/open/title (first-prompt title generation at minimum).
- Conversation rendering: markdown, code blocks, streaming, running/stop indicator.
- Tool call cards (read/edit/shell at minimum) with pending/success/fail and expand/collapse.
- Approval flow: waiting banner, Reject/Allow-once buttons, fail-closed default.
- Settings → Models: provider config (DeepSeek at minimum), save, hot-apply without restart.
- Model/route selector in session UI.

**P1 (important, differentiates fidelity):**
- Plan mode: badge, composer placeholder swap, `/plan` command, exit-plan review UI.
- Goals: bar/status with phase + objective + round counter.
- Subagent sidebar activity view + preset authoring/selection.
- Diff/search/web/terminal specialized tool cards (not just generic).
- Session fork, archive, reload/restore inspection without resuming agent.
- Theme (light/dark), responsive auto-collapse at 1024px.
- Reasoning/thinking display, math rendering, wide-table handling.

**P2 (nice-to-have / long tail):**
- Right-sidebar document preview, browser tab, files tree tab.
- Desktop-specific chrome (macOS traffic-light slot, Windows title bar radius rules).
- Plugin manager UI, agent-team panel, schedule/time-context UI (currently disabled by default upstream).
- Bonus/quota/max-tokens notices, GitHub review integration, MCP-memory guide.
- i18n (Chinese localization) parity.

## 13. Open uncertainties to verify by running the app with Playwright

1. Exact English text of the Plan mode badge label (doc only gives Chinese "计划"/"计划任务提示").
2. Full list and exact copy of Settings tabs/pages (only inferred from package names, not a rendered nav).
3. Whether pending approval requests persist and re-render across a page reload, or are lost
   (`'unavailable'` fail-closed) if no answerer is present at ask time.
4. Exact goal-bar UI copy/layout (objective text truncation, round counter format, blocked-reason display).
5. Whether a subagent's terminal result renders inline in the parent's tool-card or has any dedicated
   view when the sidebar subagent activity item is clicked.
6. Exact tool-card pending/success/fail visual states (colors, icons, ARIA roles) — not found in docs.
7. Full ARIA role/name inventory for composer, send button, session list items, sidebar toggle buttons.
8. Exact behavior/copy for `bonus-notice`, `quota-notice`, `max-tokens-notice` banners.
9. Whether Settings → Models exposes a base-URL/model-list field for custom providers beyond the
   credential-only onboarding mode (screenshots exist but weren't rendered/read).
10. The `plan-narrow-viewport` snapshot implies extra narrow-viewport plan-mode behavior beyond the
    1024px sidebar breakpoint — mechanism unconfirmed.
11. Exact session status vocabulary shown in the UI (active/failed/interrupted labels) — only inferred from
    event names (`api-session/status`, `api-session/error`), not rendered copy.
12. Whether "Allow once" is the only approval option or whether a "permission-presets" broader policy
    control appears in the same panel/menu (adjacent package exists but link to this panel not confirmed).
