# Impeccable UX critique — Cognate Console (pre-redesign baseline)

Independent pass: UX comprehension and interaction quality, not visual identity. Written without
reference to `hallmark-audit.md`'s findings (some overlap is expected and reconciled in
`backlog.md`, not here).

## Information hierarchy / reading order

- **The approval gate — the single most consequential moment in this product per `PRODUCT.md`
  Product Principle #2 — has no more visual weight than a settings row.** `ApprovalBar`
  (`App.tsx:1134`) docks where the composer sits with a small colored dot and one line of body text;
  a user skimming could plausibly click "Allow once" without registering what permission they just
  granted. The justification/permission line (`App.tsx:1160`) is plain prose interpolated into one
  sentence — the specific tool, args, and permission level are the least visually distinct part of
  the card.
- **The session header packs six unrelated concerns into one row**: breadcrumb title, subagent
  count, mode badge, 4 mostly-disabled action buttons, and a 2-item tab bar (`App.tsx:2193-2261`).
  Nothing establishes which of these is primary; reading order is left-to-right DOM order with no
  visual hierarchy distinguishing "this session's identity" (breadcrumb) from "mostly-dead chrome"
  (the 4 disabled buttons).
- **The composer footer's stats ("N turns · N steps · N tok/s · N% context") sit at equal visual
  weight to the actual message input** (`Composer`, `App.tsx:1548` region) despite being static/
  placeholder data for tok/s and context (`PRODUCT.md` Capabilities: "always renders zeros"). A user
  has no way to distinguish a real number (turns, steps) from a decorative one (tok/s, context %) —
  this is a comprehension problem, not just a "remove dead code" one.

## Cognitive load / affordance clarity

- **36 controls are rendered, focusable-looking, and disabled with only a tooltip explaining why**
  (`title={NOT_IMPLEMENTED}` sites). A tooltip is not discoverable without hovering, so from a
  keyboard or screen-reader user's perspective these are simply buttons that do nothing when
  activated, with no explanation at all (see technical audit for the accessibility angle). From a
  sighted mouse user's perspective, it's a guessing game of which of ~10 header/sidebar/settings
  controls actually work.
- **Two different card types for "waiting on you" states** (`ApprovalBar` and `PlanReviewCard`,
  `App.tsx:1134` and `App.tsx:1269`) use different header treatments (a bare dot + label vs. a dot +
  label + separate disclosure button), different action-button class names/colors
  (`approval-allow`/`approval-reject` vs. `plan-review-approve`/`plan-review-changes`), and different
  keyboard contracts (`ApprovalBar` binds Enter/Escape at the card root; `PlanReviewCard` binds
  nothing). A user who has learned one doesn't get free comprehension of the other, despite both
  being the same interaction category ("the agent is blocked on your decision").
- **The "Customized settings" disclosure in Settings → Models** (`App.tsx:729-742`) and the plan
  review's "View full plan" disclosure (`App.tsx:1289-1297`) and the subagent tree's row-click
  affordance (`App.tsx:1211-1224`) each use a distinct visual pattern for "reveal more" — no shared
  disclosure primitive exists, so a user re-learns the affordance in each surface.

## Task flow / navigation

- **First run has no path back.** `FirstRunNotice`/`FirstRunApiKey` (`App.tsx:285-336`) are
  one-directional — dismissed, permanently, per `COGNATE_HARNESS_HOME` (`PRODUCT.md`/`DEVIATIONS.md`).
  There is no "what does this app do" surface a returning or confused user can reopen; the closest
  is the disabled "Built-in plugins"/"Agent presets" nav items, which is a dead end, not a fallback.
- **Workspace selection is a single unlabeled text input with no browse affordance**
  (`WorkspaceChooser`, `App.tsx:352-399`): the user must already know (and correctly type) an
  absolute filesystem path. There's no recent-workspaces list, no file-picker integration, and the
  only feedback on failure is a generic thrown-error string surfaced via `role="alert"`.
- **Switching between the right-hand panel's two occupants (code review vs. subagent transcript) is
  implicit, not chosen.** `openReviewPanel` unconditionally clears `openChildToolCallId`
  (`App.tsx:1891-1894`) and vice versa — a user who opens a subagent transcript and then triggers a
  review loses the transcript silently, with no tab, breadcrumb, or "closed because you opened X"
  message.

## Visual emphasis / interaction clarity

- **Failure and success read at the same volume.** `FailureBlock` (`App.tsx:1120-1128`, "This turn
  failed") and a normal completed turn use comparable typographic weight and the same border/surface
  treatment family — a scanning user has to read the text to know a turn failed, rather than
  perceiving it from the shape of the message alone.
- **The retry disclosure defaults collapsed** (`RetryDisclosure`, `App.tsx:1094-1115`) even while a
  retry is actively in progress and about to fail the turn — a user watching a stalled turn sees only
  "Retried model request (k/5) · Ns" with no visual urgency cue distinguishing "still trying, likely
  fine" from "on its last attempt."

## Weak or missing states

- **No empty state for "no workspaces yet" vs. "workspace exists but has zero sessions"** — both
  collapse to the same generic `empty-state small` paragraph class used everywhere else (models list,
  subagent panel, etc.), so the same visual/textual pattern means several different things depending
  on where it appears.
- **No loading state distinct from empty state.** Between clicking "Choose workspace" and the
  projection updating, or between opening Settings and the model config loading, there's no skeleton
  or spinner — the UI either shows stale content or nothing, and `busy` booleans (`App.tsx:356` etc.)
  only disable buttons, they don't communicate "in progress" visually elsewhere on the surface.
- **Zero-results / large-dataset behavior is unverified.** The session tree and models list have no
  virtualization or pagination and no documented behavior for hundreds of sessions/models; not
  necessarily broken, but untested (flagged for the Phase 7 harden pass, not assumed fixed here).

## Product comprehension

A first-time user landing on this product, before knowing anything about DeepSeek Harness or
Cognate, would have a hard time answering "what is this and why would I trust it with my
filesystem" from the UI alone — the durability guarantee that `PRODUCT.md` names as the actual
differentiator (SQLite-backed continuations surviving a restart) is completely invisible; nothing in
the interface communicates it. The onboarding notice talks about "Cognate's core capabilities...
evolving rapidly" (internal/meta framing) rather than what the product does for the user in front of
it.
