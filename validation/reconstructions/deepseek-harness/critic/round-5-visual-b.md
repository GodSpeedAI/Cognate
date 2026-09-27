# Visual parity critic — round 5 (batch B)

Scope: 08-tool-running, 09-tool-complete, 10-file-change-collapsed, 10-file-change-expanded,
11-approval-pending, 11b-approval-pending-after-reload, 12-approval-resolved-allow,
12-approval-resolved-deny, 13-plan-active, 13b-plan-review-prompt, 13c-plan-completed,
14-subagent-active, 14b-subagent-completed-panel. Both viewports (desktop 1440x900, laptop
1024x768). Read-only pass: no new captures were run; the evidence in `diffs/`, `reference/screenshots/`
and `cognate/screenshots/` was current as of the pass (all files timestamped 2026-09-27 09:59-10:02,
i.e. from the same capture run the round-4 fixes were evidence for).

Method: opened every triptych in `diffs/{desktop,laptop}/*.png` for the 13 checkpoints, cross-checked
against full-resolution `reference/screenshots/<vp>/*.png` and `cognate/screenshots/<vp>/*.png`, and
measured geometry with a `pngjs` script (background-color-diff edge scan) against
`tests/node_modules/pngjs` rather than eyeballing pixel offsets.

## Round-4 claim verification

| Claim (round-4 disposition, batch B) | Verdict | Evidence |
|---|---|---|
| P1 subagent popover (14b) — now a single-row, ellipsis-truncated list item, no internal divider | **FIXED-VERIFIED** | `14b-subagent-completed-panel` both viewports: cognate now renders one flat row ("Summarize project status Β· Summarize the current stateΒ… Β· 0 tok 0s") with a trailing chevron, matching the reference's single-row pattern. No 4-line wrap, no split box. |
| P2 laptop file-change card icon — blue "TS" glyph now renders on laptop, matching desktop | **FIXED-VERIFIED** | `10-file-change-expanded` laptop: cognate card now shows the blue "TS" square (previously a generic outline glyph), matching both the desktop cognate render and the reference on both viewports. |
| P2 session header collapses to icon-only controls once Review panel narrows the chat, staying one row | **FIXED-VERIFIED** | `10-file-change-expanded`, `11`/`11b`/`12-*` (when narrowed): cognate's header now shows icon-only affordances in a single row, matching the reference's row count/structure. |
| 08, 09, 10-collapsed, 13, 13b, 13c, 14-active re-confirmed MATCH | **RE-CONFIRMED**, with one exception | Bubble color, tool-card layout, approval-card geometry/colors, plan widgets, and subagent-active banner-timing (accepted deviation) all still match on both viewports. **Exception: `11-approval-pending` is not a clean match — see P0-1 below, a state-leak bug the round-4 pass's evidence apparently did not yet exhibit (or was not caught).** |

All three round-4 items are genuinely fixed with no regressions on the states they targeted.

## New findings (round 5)

### P0-1 — Review panel does not close on session switch; a *new* session shows the *previous* session's stale diff

`11-approval-pending` (both viewports, full-resolution screenshots, not just the triptych): the
reference shows **no** Review panel at all in this state — chat column only, approval card visible at
full chat width (`reference/screenshots/{desktop,laptop}/11-approval-pending.png`). Cognate's capture
sequence runs `driver.newSession(page)` before this checkpoint (a fresh session, "Waiting for approval
[[…]" / "run something risky"), yet the Review panel from the **prior** checkpoint's session
(`[[scenario:multi]] do the multi-step task`, "Review Β· turn 2", `src/greet.ts` diff) is still open and
still showing that unrelated session's diff
(`cognate/screenshots/desktop/11-approval-pending.png`, `cognate/screenshots/laptop/11-approval-pending.png`).
This is not a capture-timing artifact: `11b-approval-pending-after-reload`, `12-approval-resolved-allow`
and `12-approval-resolved-deny` (later in the same script, after `driver.reload(page)`) all correctly
show **no** Review panel, confirming a reload resets the state but switching sessions via "+ New
Session" / `newSession()` does not. Not documented in `cognate/DEVIATIONS.md` (no entry addresses
Review-panel lifecycle on session switch).

Impact: roughly half the viewport width is occupied by an extra panel the reference does not show at
this checkpoint, and the panel's content (file path, diff, turn number) belongs to a different,
unrelated session — a user familiar with the reference would immediately notice both the extra chrome
and the wrong content.

Fix: close/reset the Review panel (`openReview` state in `src/ui/App.tsx`) whenever the active session
changes (new session created or a different session selected in the sidebar), not only on a full page
reload.

### P1-1 — Laptop viewport (1024px) overflows to ~1141px when the Review panel is open, instead of staying within the fixed viewport like the reference

Measured with `pngjs` (background-edge scan at y=350): on `10-file-change-expanded`, both reference and
cognate laptop screenshots have the sidebar ending at x=279 and the Review panel starting at x=680 β€”
same chat-column width. But the **reference** image is 1024px wide total (panel width clipped to
1024-680=344px, with the diff's right column visibly truncated: `return \`Howdy, ${n` cut off
mid-token, no horizontal scroll/overflow of the outer page). The **cognate** image is **1141px** wide
(`cognate/screenshots/laptop/10-file-change-expanded.png`, confirmed via `PNG.sync.read` β†’
`png.width === 1141` vs reference's `1024`) β€” the panel renders its full ~461px (β‰ˆ45vw of the intended
1024 viewport, correct proportion) but the outer page grows to accommodate it rather than clipping
within the 1024px viewport, so the capture (and, by extension, the live app) shows real horizontal
overflow at this breakpoint. The same 1141px overflow reproduces on `11-approval-pending` laptop (compounded
there by P0-1's stale panel). All other checkpoints in scope stay at the correct 1024Γ—768 on laptop.

This is a responsive-breakpoint defect the spec explicitly calls out ("responsive breakpoints used by
the selected journeys" is a required-match category). The reference's chat column plus Review panel fit
inside a fixed 1024px viewport (by clipping/truncating internal content, not by growing the page); the
cognate layout instead lets total required width exceed the viewport.

Fix: constrain the flex row containing `.messages`/chat column and `.right-panel` (Review panel) to
`100%`/`100vw` of the app shell on narrow viewports (e.g. `overflow-x: hidden` plus a `min-width: 0` on
the chat column's flex item, or clamping the chat column's own min-width lower at the laptop
breakpoint) so the two panels share the fixed viewport width instead of forcing it wider.

## Sweep items checked with no new finding

- **Chat column max-width/centering**: unaffected by the above β€” outside Review-panel states, every
  checkpoint in scope (08, 09, 10-collapsed, 11b, 12-allow, 12-deny, 13, 13b, 13c, 14, 14b) renders at
  the expected 1440Γ—900 / 1024Γ—768 canvas with the chat column centered, matching round-4's prior
  `pngjs` measurement (no re-measurement needed β€” no code affecting centering changed since).
- **Review panel width when correctly scoped to one session** (desktop `10-file-change-expanded`):
  measured β€” sidebar ends x=279, panel starts x=792 on a 1440px canvas, panel width 648px = 45.0% of
  viewport, exactly matching the spec's default 45vw and the reference's own panel start position
  (x=792, identical).
  affordances all still pixel/structurally consistent with the reference on both viewports; the
  accepted plan-mode deviations (`13b`/`13c` no right sidebar) are unaffected by anything found this
  round.
- **Approval bar / bubble color / status dots / "Took Ns" / folder icon / step counts**: all still
  correct on 08, 09, 11, 11b, 12-allow, 12-deny per direct re-inspection β€” no regressions.
- **Subagent-active banner-timing** (`14-subagent-active`): cognate shows the "1 subagent" badge
  already present at capture time where the reference does not yet β€” this is the pre-existing, accepted
  `DEVIATIONS.md` "14-subagent-active may already show the banner" timing note; unchanged, still
  applies on both viewports.

## Verdict

**REJECT** β€” 1 P0 (Review panel state leaks across session switches, showing another session's stale
diff at `11-approval-pending`), 1 P1 (Review panel + chat column overflow the fixed 1024px laptop
viewport instead of clipping within it), 0 P2 open. All three round-4 findings verified fixed with no
regressions on the states they targeted. Both new findings are in the Review-panel/right-panel
subsystem and were not exercised by round-4's own verification pass (round-4's evidence for `11` was a
"re-confirmed MATCH" against presumably-different capture data); they must be fixed and re-captured
before APPROVE.
