# Impeccable technical audit — Cognate Console (pre-redesign baseline)

Independent pass: measurable implementation quality. Static analysis of `src/ui/App.tsx` /
`app.css` plus a live run of the dev server. Baseline tooling note up front, since it constrains
what could be verified here and later phases.

## Baseline tooling note

- `bun run typecheck`: **clean, 0 errors** (after `bun install`, which regenerated `bun.lock`'s
  format header — see redesign commit notes; a harmless bun-version artifact, not a dependency
  change).
- `bun test test`: **fails to run** — every test importing `@cognate/client`/`@cognate/protocol-
  connect`/`@cognate/protocol-connect-bun` hits `error: EISDIR reading file: ".../src/index.ts"`
  even though those files are ordinary files on disk. Root cause: this monorepo pins
  `"packageManager": "bun@1.4.0"` (`package.json:6`); the sandbox has `bun 1.3.11`, and this looks
  like a test-runner/workspace-resolution regression specific to that older version, not a defect in
  this app. Upgrading was attempted (`bun.sh` install script) and blocked by this environment's
  network policy (403 on `CONNECT bun.sh:443` — confirmed via the proxy status endpoint, not this
  repo). **The dev server itself is unaffected**: `bun run dev` boots cleanly and serves `200` on
  `/` — live/Playwright-based verification in later phases is not blocked, only the `bun test test`
  unit/journey suite is. This is recorded as a known limitation for Phase 9, not silently worked
  around.

## Accessibility

- **Zero `aria-live` regions anywhere in the app** (grep confirms no matches). Streaming assistant
  text (`MessageBubble` with `streaming: true`), tool-activity status ("Deep diving for Ns"),
  approval/plan-review cards appearing, and turn completion are all purely visual updates — a screen
  reader user gets no announcement that anything changed unless they're already focused inside the
  changed region. This is the single largest accessibility gap given how async-state-heavy this
  product is.
- **The Settings modal has `role="dialog" aria-label="Settings"` but no `aria-modal="true"`**
  (`App.tsx:613`, contrast with `FirstRunNotice`/`FirstRunApiKey` at `App.tsx:288, 318` which do set
  it). Only 2 of 3 modal-shaped surfaces in the app declare themselves modal to assistive tech.
- **No focus trap and no focus-return on any modal** (`FirstRunNotice`, `FirstRunApiKey`,
  `SettingsModels`) — no `trapFocus`/`restoreFocus`/`previousActiveElement` pattern found anywhere in
  `App.tsx`. A keyboard user can Tab out of an open modal into the (visually obscured but still
  focusable) background; closing a modal does not return focus to whatever opened it.
- **Escape-to-close is implemented in exactly 2 of 5 dismissable surfaces**: the work-details
  dropdown (`App.tsx:488-499`) and `ApprovalBar` (`App.tsx:1149`, Escape = reject). The Settings
  modal and both first-run dialogs have no Escape handling at all — inconsistent keyboard contract,
  not just a missing-feature gap.
- **`outline: none` on the composer textarea** (`app.css:1412`) is paired with a `:focus-visible`
  rule at `app.css:1411`, so a replacement focus style likely exists — confirm it's actually visible
  (sufficient contrast, not just a color shift) rather than assuming the pairing is correct; flagged
  for the accessibility pass in Phase 7, not resolved here.
- **Positive baseline to preserve**: real ARIA roles/names throughout (`role="dialog"`,
  `role="alert"` ×6, `role="tree"`/`"treeitem"`, `role="tablist"`/`"tab"`, `aria-expanded`,
  `aria-selected`, `aria-pressed`, `.sr-only` text for status pills at `app.css:862`) — built to match
  the reference's accessible-name tree for parity scoring, this is a genuinely more disciplined ARIA
  baseline than a typical from-scratch build and should be extended, not replaced.

## Responsive behavior

- **Exactly one breakpoint in the entire stylesheet**: `@media (max-width: 1024px)` at
  `app.css:2033`, which auto-collapses the sidebar to a 56px rail. There is no tablet, narrow-
  desktop-but-above-1024px, or mobile-specific treatment anywhere else. Fixed-pixel values are used
  pervasively (`--cg-chat-column-max-width: 790px`, `--cg-sidebar-min/max`, etc.) with no evidence of
  behavior below ~700-800px viewport width beyond the one collapse rule.
- **Composer, message bubbles, settings modal, and the right-hand panel have no documented narrow-
  viewport behavior** — untested territory, flagged for Phase 7 (`adapt`) rather than assumed broken
  or assumed fine.

## State handling / loading / error / empty states

- **`busy` boolean state (`WorkspaceChooser`, `SettingsModels`, etc.) only disables buttons** — no
  visible loading indicator (spinner, skeleton, progress text) anywhere in the app; a slow network or
  slow provider response reads as "nothing is happening," not "in progress."
- **Generic `empty-state`/`empty-state small` class reused across at least 4 semantically different
  situations** (no workspace, no sessions, no model provider, no subagent output) — functionally
  fine, but no distinct empty-vs-loading-vs-error visual language exists to extend later without
  restructuring.
- **Error surfacing is a single pattern everywhere**: `role="alert"` + a plain string
  (`err.message`), whether the failure is a validation error, a network failure, or a thrown
  exception from `client.invoke`. No differentiation between "you made a mistake" (fixable inline)
  and "something failed" (needs retry) states.

## Semantic HTML / focus behavior

- Reasonable use of native `<button>`, `<nav>`, `<aside>`, `<header>`, `<main>` — this is not a
  div-soup implementation. `<label>` wraps inputs correctly in the Settings forms.
- `ApprovalBar` (`App.tsx:1143`) is the only surface with deliberate programmatic focus
  (`tabIndex={-1}` + `ref.current?.focus()` on mount) — the plan-review card, right-hand panels, and
  modals all rely on default browser focus behavior (i.e., focus stays wherever it was, or resets to
  `<body>`), which is inconsistent with the one surface that got this right.

## Performance / layout instability

- No virtualization on the session tree or the message transcript — fine at today's realistic
  session counts, unverified at hundreds/thousands (Phase 7 `harden` territory, not a current
  regression).
- `MessageBubble`/`ToolActivity`/`RetryDisclosure` re-render is driven by whole-projection
  subscriptions (`useProjection`) rather than scoped selectors in a few places (e.g. `useSessions`,
  `useWorkspaces` re-map and re-sort on every projection change) — likely fine at current scale, worth
  re-checking only if Phase 7's dense-data pass surfaces jank.
- No obvious sources of layout shift (CLS) were found in static analysis — no images without
  dimensions, no late-loading web fonts declared in `app.css` (system font stack loads instantly).
  This should be confirmed visually once the dev server is used for live verification (Phase 9), not
  assumed from source alone.

## Technical inconsistencies

- Two different button-disabling idioms carry the same meaning ("not implemented"): a
  `title={NOT_IMPLEMENTED}` tooltip vs. no title at all on some disabled controls (e.g., the Delete
  provider button at `App.tsx:713` has the tooltip; compare with plain `disabled` composer dropdowns
  mentioned in `DEVIATIONS.md` without one) — worth normalizing to one convention when these are
  resolved in Phase 5, whichever way each one is resolved (implement, remove, or genuinely defer with
  a real explanation).
