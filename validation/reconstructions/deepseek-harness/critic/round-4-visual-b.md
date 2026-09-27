# Visual parity critic — round 4 (final, batch B)

Scope: 08-tool-running, 09-tool-complete, 10-file-change-collapsed, 10-file-change-expanded,
11-approval-pending, 11b-approval-pending-after-reload, 12-approval-resolved-allow,
12-approval-resolved-deny, 13-plan-active, 13b-plan-review-prompt, 13c-plan-completed,
14-subagent-active, 14b-subagent-completed-panel. Both viewports (desktop, laptop).

Method: read every triptych in `diffs/{desktop,laptop}/*.png`, cross-checked against full-resolution
`reference/screenshots/<vp>/*.png` and `cognate/screenshots/<vp>/*.png` where the triptych was too
small to resolve detail, and against `{reference,cognate}/observations/aria/`. Verified every
round-3 claim against this (unchanged) evidence. No new captures were run.

## Round-3 claim verification

| Claim (round-3 disposition, Batch B) | Verdict | Evidence |
|---|---|---|
| P0 user-message bubble near-black app-wide → fixed with dedicated `--cg-message-bubble-*` tokens | **FIXED-VERIFIED** | `06-user-message`-adjacent checkpoints in scope (08, 09, 11, 12-allow/deny, 13, 14) all show a light lavender/periwinkle user bubble with dark text on both viewports, matching reference. |
| P1 in-chat file-change chip is now a file-icon card, not a text pill | **FIXED-VERIFIED** | `10-file-change-expanded` (both viewports): cognate renders a bordered card with a square file-type icon (blue "TS" on desktop / plain "D" glyph on laptop — see F1), an "Edited greet.ts" heading, and a "+1 -1" stat line, matching the reference's card layout. |
| P1 Review panel toolbar missing Split/Fullscreen/Collapse-right-sidebar + Show-file-location/More-ways-to-open | **FIXED-VERIFIED** | `10-file-change-expanded` (both viewports): tab-strip row now has 3 icon buttons right of "+"; content toolbar now has "Line wrap", "Open greet.ts in sidebar", "Show file location", "More ways to open", matching reference's control set and order. |
| 08, 09, 10-collapsed, 13, 13b, 13c, 14-active: re-confirmed MATCH | **RE-CONFIRMED** | Consistent on both viewports; the accepted capture-timing and no-right-sidebar-for-plan deviations in `DEVIATIONS.md` still apply and are not contradicted by these images. |

All three round-3 open items are genuinely fixed. No regressions found on the previously-closed items.

## New findings (round 4)

### P1 — subagent popover ("14b") text truncation and internal layout do not match the reference's single-row list item

Reference (`reference/screenshots/{desktop,laptop}/14b-subagent-completed-panel.png`): the popover
under the "1 subagent" badge is a single flat row — a status dot, then
"Summarize project status · Summarize the current state of · continuable · co…" truncated to one
line with an ellipsis, a right-aligned "0 tok / 0s" stat, and a trailing chevron `›` indicating the
whole row is one click target. No internal border/box.

Cognate (`cognate/screenshots/{desktop,laptop}/14b-subagent-completed-panel.png`): the popover is a
two-column split with a hard vertical divider — left side wraps the description across **4 lines**,
including a mid-word cut ("...state of the fixtu" — truncated without an ellipsis, not at a word
boundary), right side is a separate bordered box containing the full sentence "Open Summarize project
status in sidebar" as the click target. This roughly doubles the popover's height/width versus the
reference and exposes an implementation-only string ("fixtu…" — an apparent truncation of a longer
fixture description) that the reference never shows because it truncates before wrapping.

Not listed in `cognate/DEVIATIONS.md`. Confirmed on both viewports (desktop: popover ~280×130px vs
reference's ~330×60px single row; laptop: same pattern, more pronounced due to narrower column).

Fix: constrain `.subagent-tree` / `.subagent-count-wrap` popover row to a single line
(`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`) instead of wrapping; drop the
internal divider/second box and make the whole row one clickable element with a trailing chevron,
matching the reference's list-item pattern instead of a split description+button layout.

### P2 — file-change-card icon differs from the reference's colored file-type glyph on the laptop viewport

`10-file-change-expanded` (laptop): the reference's file icon is a blue square with white "TS" text
(same as desktop). Cognate's laptop card renders a plain outlined document glyph with a small corner
fold and no "TS"/color-coding (`cognate/screenshots/laptop/10-file-change-expanded.png`, card icon at
~x=328,y=374). The desktop viewport does show the correct blue "TS" icon
(`cognate/screenshots/desktop/10-file-change-expanded.png`), so this is a viewport-specific icon
regression, not a missing feature — likely the icon-by-extension mapping isn't reached at the laptop
breakpoint's card size, or a different (generic) `FileIcon` variant renders there.

Fix: verify `FileIcon`'s extension→glyph/color mapping is applied identically regardless of viewport
width; the laptop card should render the same blue "TS" icon as desktop.

### P2 — session header collapses to icon-only controls in the reference when the Review panel is open; cognate keeps full text-label buttons, adding a header row

With the Review panel open (`10-file-change-expanded`, `11`/`11b`/`12-*` after the panel-opening
turn), the reference's narrowed chat-column header is a single compact row: title, then icon-only
affordances (external-link glyph, chevron, "…"). Cognate's header in the same state keeps
"Open in Files" / "More ways to open" as spelled-out text buttons plus the mode badge, occupying two
rows and giving the chat column visibly less vertical space at the top. This is consistent across
both viewports. The existing `DEVIATIONS.md` "Session header actions — inert" entry documents that
these controls are present-but-disabled (an accepted functional deviation); it does not address this
layout/row-count difference, so it is not covered by that entry.

Fix: collapse the header action row to icon-only controls (with the same accessible names, kept
disabled per the existing deviation) once the Review panel narrows the chat column, so the header
stays a single row like the reference.

## Sweep items checked with no new finding

- **Chat column max-width/centering**: consistent between ref/cognate on both viewports across all
  13 checkpoints; no reflow or off-center drift observed.
- **Canvas background**: both apps use the same flat light-gray canvas behind the chat column and
  Review panel on every checkpoint in scope; no color drift.
- **"Took Ns" meta line**: both ref and cognate render this as plain text ("Took 3s ⌄"), not a pill
  with a dot — this is genuinely how the reference renders it (the "pill with a green dot" pattern
  belongs to the *status* indicator next to "Tool result" lines, e.g. `08`/`14b`'s leading colored
  dot, which is present and green in both apps). No mismatch.
- **Approval bar geometry/colors**: amber-tinted card, left accent dot, "Reject" (outline) / "Allow
  once" (solid black) buttons — pixel-consistent between ref and cognate on `11`, `11b`,
  `12-allow`, `12-deny`, both viewports.
- **Plan widgets** (`13`, `13b`, `13c`): to-dos summary button, "Plan review" card with "View full
  plan" disclosure, and the post-approval "Update greeting" plan card with "Open" — all structurally
  and visually consistent with the reference, including the accepted "shown inline, not in a right
  sidebar" deviation for `13b`.

## Verdict

**REJECT** — 0 P0, 1 P1 (subagent popover layout/truncation), 2 P2 (laptop file-icon glyph, header
row-collapse-on-narrow) open. All three round-3 findings are confirmed fixed with no regressions. The
remaining P1 is a genuine, previously-uncaught geometry/typography mismatch in the subagent popover
that must be closed before APPROVE; the two P2s are minor and would not by themselves block approval,
but are documented for completeness per the standard's "tool cards"/"status indicators"/"header
structure" parity requirements.
