# Subsystem: the web UI

`cognate/src/ui/` — `App.tsx` (2,300 lines), `app.css` (2,130 lines), `icons.tsx`, `markdown.ts`.
The UI is one file by choice and circumstance, and that fact is documented rather than hidden: see
"Known structural debt" below.

## Purpose

Render the durable state as an operator surface: first-run onboarding, a workspace chooser, a session
list, a streaming transcript with tool activity, and the three cards that can take over the composer
(approval, plan review) — plus Settings, a review panel, and a subagent transcript panel.

## Responsibilities

- Subscribe to projections and to the active run's event stream, and derive everything it shows from
  them.
- Invoke the four operator capabilities (`model.configure`, `workspace.select`, `onboarding.dismiss`,
  `settings.changeWorkDetails`) and start/cancel runs.
- Keep the small amount of state that is genuinely browser-local (theme, last-open session, which
  panel is open, the in-flight transcript).
- Provide the interaction contracts: modal focus trap and Escape, the Enter/Escape decision contract on
  waiting cards, live regions for streaming.
- Present the current design system. `cognate/DESIGN.md` is authoritative for the visual language;
  `app.css`'s `:root` block is the enforced token source.

## Non-responsibilities

- It does not own application state. Nothing it renders is authoritative.
- It does not compute the model's state. It does not infer "this run is finished" from the absence of
  activity — it reads `message.completed`, `run.cancelled`, `run.failed` from the event stream.
- It does not persist anything but two `localStorage` keys.
- It does not validate the workspace path; `workspace.select` does, and the error is rendered from the
  rejected invoke.
- It does not recompute step counts from its own knowledge of tools; it reads `stepCount` from
  `session.history` for history and from the timeline for the live turn, using the same `+1` rule.

---

## Structure

### Data hooks — one per projection

| Hook | Projection | Returns |
|---|---|---|
| `useCurrentWorkspaceId` | `workspaces` | the `current` row's value |
| `useWorkspaces` | `workspaces` | all `record/*` rows |
| `useSessions` | `sessions` | all session rows |
| `usePlanState(sessionId)` | `plans` | that session's row |
| `useSubagents(sessionId)` | `subagents` | rows for that session |
| `usePlanReviewPendingSessions` | `plans` | the set of sessions with `review.status === "pending"` |
| `useModelConfig` | `model-config` | the `current` row |
| `useWorkDetails` | `settings` | the mode, defaulting to `standard` when the row is absent |
| `useOnboardingDismissed(step)` | `onboarding` | whether that step's row exists |

Two of these are the load-bearing idea in the whole UI: **absence is a value.** No `settings` row means
`standard`; no `onboarding` row means "show the dialog".

### Run-state hooks

**`useStreamingTurn(runId)`** — subscribes to the run and returns `{text, status, retries, failure}`.
It handles four event types:

- `run.invocation.progress` with `kind === "text"`. It tracks the highest `metadata.attempt` seen. A
  delta from a *higher* attempt **replaces** the accumulated text (a retry started fresh); a delta
  from the current attempt appends; a delta from a **superseded lower** attempt is discarded. Without
  that attempt comparison, a retried request would concatenate the failed attempt's partial text with
  the successful one.
- `model.request.retried` — appends to `retries`, which drives the "Retried model request (k/5)" row.
- `turn.failed` — records `{code, message}` for the failure block.
- `message.completed` → `status: "completed"`; `run.cancelled` → `"cancelled"`; `run.failed` →
  `"failed"`.

**`useToolTimeline(runId)`** — folds `tool.call.*` and `tool.approval.*` into an ordered
`ToolEntry[]` keyed by `toolCallId`, each with a `status` of `running | success | failed` and an
optional `approval.status` of `pending | approved | denied`. Because the agent's loop is sequential,
at most one entry is ever `running` and at most one approval is ever `pending` — which is why
`ApprovalBar` can be driven by "the first entry with a pending approval" rather than by correlating
ids.

**`useElapsedSeconds`** — a one-second tick while streaming, purely so "Deep diving for Ns" updates.

### `App` — the composition root

State it holds: `collapsed`, `showSettings`, `activeSessionId`, `transcript`, `activeRunId`, plus
panel toggles and a `runStartedAtRef` clock.

The four flows it owns:

- **`send(message)`** — assigns or reuses a session id, appends the user's bubble (plus an optimistic
  `"plan · Plan mode on. Use /plan off to leave."` system row when the message starts with `/plan ` and
  plan mode is off), then `client.startRun("agent.coding", {sessionId, workspaceId, message},
  {idempotencyKey: crypto.randomUUID(), correlationId: "session:" + sessionId})`.
- **Finalisation effect** — when `useStreamingTurn` reports `completed` / `cancelled` / `failed`, it
  appends the corresponding assistant row (with `tookMs`, `stepCount: toolEntries.length + 1`, the
  last successful `edit` summary for the diff card, and a `steps` snapshot for Verbose mode) and
  clears `activeRunId`.
- **`openSession(sessionId)`** — reattaches to a still-in-flight run when the row's `lastStatus` is
  `running` or `waiting` (this is what makes a pending approval survive a page reload, and it works
  after a full restart too, because both fields are durable), resets the duration clock, remembers the
  session in `localStorage`, and loads the transcript by invoking `session.history`.
- **`stop()`** — `client.cancelRun(activeRunId, "user-cancelled")`.

**Composer gating**: `composerDisabled = !currentWorkspaceId || !modelConfig`. The composer is
enabled only when a workspace is selected *and* a model is configured. This is the settlement condition
of journey `J-A-first-use`.

**Three states replace the composer**, in priority order: a pending approval (`ApprovalBar`), else an
open `plan-review` continuation (`PlanReviewCard`), else the composer. `PlanReviewCard` reads its
heading and markdown from the *continuation payload*, not from the projection, so the card renders
even if the projection has not caught up.

### Presentational components

`FirstRunNotice`, `FirstRunApiKey`, `FirstRunDialogs`, `WorkspaceChooser`, `SettingsModels`,
`ToolActivity`, `RetryDisclosure`, `FailureBlock`, `ApprovalBar`, `TodoWidget`, `SubagentTree`,
`RightPanel`, `PlanReviewCard`, `EditDiff`, `ReviewPanel`, `CodeBlocks`, `Composer`, `MessageBubble`,
`HeroLanding`, plus the hooks `useModalFocus` and `useTheme`.

Three composition decisions worth naming:

- **One right-hand slot, two contents.** `ReviewPanel` (split diff) and `RightPanel` (subagent
  transcript) are mutually exclusive; opening one closes the other.
- **`diffHunk` derives from `diffLines`.** The review panel's gutter numbers and hunk bounds are
  computed from the diff the `tool.edit` result already carried. No second source of truth.
- **Inert controls are explicit.** The constant `NOT_IMPLEMENTED` supplies a `title` for every
  disabled control, and each such control is catalogued in
  [../reference/deviations.md](../reference/deviations.md). The pattern is: the control keeps the
  reference's accessible name, is disabled, and says why in visible text.

### Accessibility contracts

- `useModalFocus` — focus trap, Escape to close, focus returned to the trigger. Applied to all three
  modals.
- `Enter` = affirmative and `Escape` = negative, on every "the agent is waiting on you" card.
- `aria-live="polite"`, `aria-atomic="false"`, `aria-relevant="additions text"` on the message region.
- `role="alert"` on the workspace chooser's error and on its persistent notice.
- The session tree uses `role="tree"` / `role="treeitem"` with `aria-selected`.
- Real role/name selectors throughout — which is what let the Playwright drivers target the same
  journeys on both systems.

## State

| State | Lifetime | Mechanism |
|---|---|---|
| Projections | durable-derived | `useProjection` |
| Transcript | per browser session | React state, rebuilt from `session.history` on open |
| Streaming text, tool timeline, retries | per run | React state, rebuilt from the event stream on reattach |
| Theme | per browser | `localStorage["cognate.theme"]`, default `light`, toggles light/dark |
| Last open session per workspace | per browser | `localStorage["cognate.lastSession.<workspaceId>"]` |
| Open panel, sidebar collapse, dialogs | per page load | React state |

Two consequences of the last-open-session key: a reload lands back where you were, and clearing
storage costs you nothing but the theme and the position. It is explicitly *not* durable app state —
`App.tsx`'s comment says so, and the reattach path reads durable state instead.

## Failure modes

| Symptom | Cause | Where |
|---|---|---|
| Composer permanently disabled | no workspace, or no `model-config` row | `composerDisabled` |
| First-run dialogs reappear | fresh `COGNATE_HARNESS_HOME`, or `onboarding.dismiss` never invoked | `useOnboardingDismissed` |
| Sidebar shows "No workspace selected" | `workspaces/current` row absent | `useCurrentWorkspaceId` |
| "Waiting for approval" prefix never clears | a `tool-approval` continuation is open but the projection row was written by `run.waiting` before a row existed | `sessions.ts` guard |
| Subagent banner shows before the child finishes | the row is created at `subagent.spawned`, i.e. at start | by design; catalogued as a deviation |
| Verbose mode shows folded steps on a reloaded turn | `session.history` returns `stepCount` but not per-step detail | catalogued as a documented gap |
| Turn looks idle too early for a multi-step tool turn | the `streaming` flag suppresses the status row until the turn actually ends | `MessageBubble`'s `streaming` prop; the Cognate driver's `waitForIdle` depends on it |
| "0 tok/s · 0% of context used" | no accounting is implemented | a known limitation, deliberately not faked |
| `tokens`/`n%` never change | same | same |
| Theme resets to light | `localStorage` unavailable (private mode, blocked) | `useTheme` swallows the error |

## Extension points

- A new presentational component: a function in `App.tsx` plus a rule in `app.css`. There is no
  component directory, so a new file needs a new import in `App.tsx`.
- A new event-driven view: add a `useXxx` hook in the same file, subscribing through
  `client.subscribe`.
- A new settings toggle: this is a *vertical* change, not a UI change — the option set lives in
  `src/workDetails.ts`-style shared module, the capability, the event, the projection, and the
  Settings section. [../how-to/add-a-capability.md](../how-to/add-a-capability.md) is the template.
- A new inert control: give it the reference's accessible name, `disabled`, and
  `title={NOT_IMPLEMENTED}`, and add a line to `cognate/DEVIATIONS.md`.

## Known structural debt

`cognate/PRODUCT.md` records two constraints that this subsystem still has: the UI is one 2,300-line
component file with no decomposition, and it has no separate design-token file — the token layer lives
in `app.css`'s `:root`. `PRODUCT.md` describes a token layer as expected-but-absent; since then
`app.css` has grown a real `--cg-*` token set, so the second point is now partially out of date. Treat
`cognate/DESIGN.md` plus `app.css` as the pair that describes the visual system today, not
`PRODUCT.md`'s constraints list.

## Source trail

- `cognate/src/ui/App.tsx:133-241` — the nine projection hooks
- `cognate/src/ui/App.tsx:242-320` — `relativeTime`, `useModalFocus`, `useTheme`
- `cognate/src/ui/App.tsx:321-404` — first-run dialogs, `onboarding.dismiss` invocation
- `cognate/src/ui/App.tsx:406-454` — `WorkspaceChooser` and `workspace.select`
- `cognate/src/ui/App.tsx:456-470` — `THIRD_PARTY_PRESETS`, `API_PROTOCOL_OPTIONS`
- `cognate/src/ui/App.tsx:488-508` — `SettingsModels` signature and `settings.changeWorkDetails`
- `cognate/src/ui/App.tsx:626-655` — the two `model.configure` call sites
- `cognate/src/ui/App.tsx:962-1027` — `useStreamingTurn`, including attempt-aware delta handling
- `cognate/src/ui/App.tsx:1043-1093` — `useToolTimeline`
- `cognate/src/ui/App.tsx:1098-1118` — `toolActionLabel` and the work-details gate
- `cognate/src/ui/App.tsx:1439-1468` — `diffHunk`
- `cognate/src/ui/App.tsx:1891-2300` — `App`
- `cognate/src/ui/App.tsx:1982-2021` — `openSession`, reattach, and history load
- `cognate/src/ui/App.tsx:2041-2067` — `send`
- `cognate/src/ui/App.tsx:2267-2288` — composer gating and the three-way composer replacement
- `cognate/src/ui/markdown.ts:16-72` — the minimal renderer
- `cognate/src/ui/icons.tsx` — original inline SVGs
- `cognate/src/ui/app.css:11-60` — the token layer
- `cognate/DESIGN.md` — the design system
