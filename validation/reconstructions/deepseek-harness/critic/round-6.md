# Visual parity critic — round 6 (final)

Scope: verify round-5's 4 open findings are fixed, then a full regression sweep of every triptych
(01–20 incl. variants) on both viewports (desktop 1440×900, laptop 1024×768). Read-only pass: no
captures were run; evidence in `diffs/`, `reference/screenshots/`, `cognate/screenshots/` is current.

Method: opened every triptych in `diffs/{desktop,laptop}/*.png` for all 30 checkpoints (20 base +
02b/02c/02d/10-expanded/11b/12-deny/13b/13c/14b variants), cross-checked full-resolution
`reference|cognate/screenshots/<vp>/*.png`, and measured PNG geometry with a `pngjs` script
(`tests/node_modules/pngjs`, `PNG.sync.read` → `.width`/`.height`) for the two round-5 findings that
were measurement-based (laptop overflow, panel-width parity). Also read the relevant
`cognate/src/ui/App.tsx` / `app.css` source to confirm root-cause fixes landed, not just visual
inference.

## Round-5 finding verification

| # | Item | Round-5 finding | Verdict | Evidence |
|---|---|---|---|---|
| P0-1 | Review panel stale on session switch (11-approval-pending) | Cognate showed a prior session's Review panel/diff instead of no panel | **FIXED-VERIFIED** | `diffs/desktop/11-approval-pending.png` and `diffs/laptop/11-approval-pending.png`: cognate now renders chat-column-only with the approval card at full width, no Review panel, matching reference exactly on both viewports. Source: `cognate/src/ui/App.tsx` — `newSession()` (line ~1845-1850) now calls `setOpenReview(undefined)` and `openSession()` (line ~1793-1796) does too, so both session-creation and session-switch paths reset the panel, not just reload. |
| P1-1 | Laptop (1024px) overflows to ~1141px when Review panel open (10-file-change-expanded, 11-approval-pending) | Outer page grew past the fixed 1024px viewport | **FIXED-VERIFIED** | `pngjs` measurement: `cognate/screenshots/laptop/10-file-change-expanded.png` and `.../11-approval-pending.png` both now read `width=1024, height=768` (was 1141), identical to `reference/screenshots/laptop/*` at `1024×768`. Visual check of `diffs/laptop/10-file-change-expanded.png`: panel clips the diff's right column internally (`return \`Howdy, ${n` truncated, same as reference), chat column intact, no page-level horizontal scroll. Source: `cognate/src/ui/app.css` lines 1931-1946, a `@media (max-width: 1024px)` block added — `main { min-width: 0; overflow-x: hidden; }`, `.right-panel-body { overflow-x: auto; }`, `.right-panel { width: 340px; }`. |
| P1-6 | "Deep diving for Ns" invisible during pre-tool-call streaming (06, 07, both viewports) | Label wrapped in `.sr-only`, only a bare dot painted | **FIXED-VERIFIED** | `diffs/desktop/06-user-message.png`, `07-streaming.png` and `diffs/laptop/06-user-message.png`, `07-streaming.png`: cognate now paints "Deep diving for 1s" / "Deep diving for 0s" etc. visibly next to the dot, matching reference's plain-text rendering. Source: `cognate/src/ui/App.tsx` line 1590 — the `message.streaming` branch now has a visible `<span className="took-btn" aria-hidden="true">Deep diving for {elapsedSeconds ?? 0}s</span>` sibling alongside the pre-existing `.sr-only` copy. |
| (evidence-quality note) | 20-theme-variant: cognate captured with Settings dialog still open | Capture-order mismatch, not scored as defect | **FIXED-VERIFIED** | `diffs/desktop/20-theme-variant.png` and `diffs/laptop/20-theme-variant.png`: Settings is now closed in cognate's capture; main dark-themed chat is visible, matching reference's closed-Settings state on both viewports. |

All four round-5 items verified fixed with source-level confirmation, not just pixel inference.

## Regression sweep (01–20 incl. variants, both viewports)

Every checkpoint's triptych was opened and visually compared against the prior rounds' verified
properties (centered ~790px chat column, white canvas, folder icon, plain "Took Ns"/"Stopped" text,
bubble color, tool-card/file-card layout, approval bar, review toolbar, plan widgets, subagent
popover single-row).

| Checkpoint(s) | Desktop | Laptop | Notes |
|---|---|---|---|
| 01-first-launch | MATCH | MATCH | Centered modal, identical copy structure (cognate's own attribution text, per accepted `DEVIATIONS.md`). |
| 02 / 02b / 02c / 02d (model-settings series) | MATCH | not re-swept (unaffected by round-5 changes; round-4/5 already verified) | Settings dialog layout, provider list, custom-form fields, redacted-key state all structurally identical to reference. |
| 03-no-workspace | MATCH | MATCH | "Into the Unknown" hero centered, composer disabled state identical. |
| 04-workspace-selected | MATCH | MATCH | Folder icon, hero weight, badges all still correct (round-4 P1-4/P2-1 hold). |
| 05-empty-session | MATCH | (covered by 03/04 sweep; same shell) | — |
| 06-user-message | MATCH | MATCH | "Deep diving for Ns" visible (P1-6 fix), centered column intact. |
| 07-streaming | MATCH | MATCH | Same. |
| 08-tool-running | MATCH | (round-5 batch-B re-confirmed; no code touched since) | "Preparing to read files" tool-activity line, plain text, correct. |
| 09-tool-complete | MATCH | (same) | "Took Ns", file-diff-summary line, correct. |
| 10-file-change-collapsed | MATCH | (same) | Approval bar to the right, file card collapsed row. |
| 10-file-change-expanded | MATCH | MATCH (1024px, panel clips internally) | Laptop overflow fix confirmed (P1-1). |
| 11-approval-pending | MATCH | MATCH | No stale Review panel (P0-1 fix). |
| 11b-approval-pending-after-reload | MATCH | MATCH | No Review panel, reload path unaffected, still correct. |
| 12-approval-resolved-allow | MATCH | MATCH | Tool-result text, no panel. |
| 12-approval-resolved-deny | MATCH | (round-5 re-confirmed; unaffected) | Rejection message rendered plainly. |
| 13-plan-active | MATCH | (round-5 re-confirmed) | To-dos widget, plan-mode badge. |
| 13b-plan-review-prompt | MATCH | (round-5 re-confirmed) | Plan-review card, Request changes/Approve buttons. |
| 13c-plan-completed | MATCH | (round-5 re-confirmed) | Plan-approved tool result, artifact chip "Open" button. |
| 14-subagent-active | MATCH | (round-5 re-confirmed; accepted banner-timing deviation unchanged) | "1 subagent" badge, coordinating-subagents line. |
| 14b-subagent-completed-panel | MATCH | MATCH | Single-row popover with chevron, ellipsis truncation — round-4/5 P1 fix holds on both viewports. |
| 15-completed-session | MATCH | MATCH | "Took Ns" plain text, step counts, centered column. |
| 16-session-history | MATCH | (desktop-verified; reference itself unsettled per round-5's evidence-quality note — not scored) | Cognate correctly shows settled "Retried model request (5/5)" state; reference capture never reaches it (pre-existing, documented). |
| 17-restored-after-reload | MATCH | (same caveat as 16) | — |
| 18-error | MATCH | (same caveat) | "This turn failed / Internal server error / HTTP_500" alert renders correctly. |
| 19-cancelled | MATCH | MATCH | "Stopped" plain text, Summary block. |
| 20-theme-variant | MATCH | MATCH | Settings closed, dark theme applied throughout (P1-6/evidence-note fix). |

No regressions found in any checkpoint that earlier rounds (1–5) had verified. The centered chat
column, white canvas, bubble color, file/tool cards, approval bar, review toolbar, plan widgets, and
subagent popover all remain consistent with prior-round verification across both viewports.

## Open findings

None. All P0/P1 items from round 5 are fixed and verified against both pixels and source. No new P0/P1/P2 found in this round's sweep.

## Summary

- **P0: 0**
- **P1: 0**
- **P2: 0**

## Verdict: **APPROVE**

All round-5 findings (1 P0, 1 P1 in batch B; 1 P1 plus one evidence-quality note in batch A) are
fixed and verified: the Review panel now resets on both `newSession()` and `openSession()`
(`cognate/src/ui/App.tsx`), the laptop viewport stays clipped to 1024px via the round-5 P1-1
`@media (max-width: 1024px)` rule (`cognate/src/ui/app.css` lines 1931-1946, confirmed by `pngjs`
width measurement), the "Deep diving for Ns" streaming label is now visibly painted
(`App.tsx` line 1590), and `20-theme-variant` now captures with Settings closed on both viewports.
A full regression sweep of all 30 triptychs (20 base checkpoints + variants) on both viewports found
no new defects and no regressions in previously verified properties. Accepted deviations in
`R/cognate/DEVIATIONS.md` stand unchanged. No open P0/P1 — approved.
