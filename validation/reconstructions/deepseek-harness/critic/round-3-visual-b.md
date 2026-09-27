# Visual parity critic — round 3 (batch B)

Scope: 08-tool-running, 09-tool-complete, 10-file-change-collapsed, 10-file-change-expanded,
11-approval-pending, 11b-approval-pending-after-reload, 12-approval-resolved-allow,
12-approval-resolved-deny, 13-plan-active, 13b-plan-review-prompt, 13c-plan-completed,
14-subagent-active, 14b-subagent-completed-panel. Both viewports (desktop, laptop).

Method: opened every triptych in `diffs/{desktop,laptop}/*.png`, cross-checked against the
individual `reference/screenshots` and `cognate/screenshots` PNGs and the ARIA snapshots in
`{reference,cognate}/observations/aria/` for the Review panel and approval checkpoints, and
verified every round-2 claim in `round-2-disposition.md` against the regenerated evidence.
No new captures were run.

## Round-2 claim verification

| Claim (round-2 disposition) | Verdict | Evidence |
|---|---|---|
| P0 10-file-change-expanded: real split Review panel with tab strip + toolbar + gutter'd diff | **FIXED-VERIFIED** (structure) | Both viewports: a genuine right-hand `Review · turn N` panel now opens with a two-column gutter'd diff and `@@ -1,4 +1,4 @@` hunk header, replacing the old inline diff card. See new findings below for toolbar completeness gaps. |
| P1 11/11b/12-allow/12-deny: mode badge reads "PTC mode" for approval-gated sessions, "Standard mode" otherwise | **FIXED-VERIFIED** | `11-approval-pending` and `11b` header badge reads "PTC mode" on both viewports (matches reference ARIA); `12-approval-resolved-allow`/`12-approval-resolved-deny` correctly show "Standard mode" (matches reference, which also reverts). |
| P1 14b: subagent detail renders as anchored dropdown under header badge, not bottom banner | **FIXED-VERIFIED** | Both viewports: `14b-subagent-completed-panel` now shows a small floating card directly under the "1 subagent" header badge ("Summarize project status · 0 tok · 0s · continuable · running" + "Open ... in sidebar"), matching reference's position/size. No bottom banner remains. |

08, 09, 10-file-change-collapsed, 13-plan-active, 13b, 13c, 14-subagent-active: re-confirmed MATCH
on both viewports, consistent with round-2's disposition and the accepted-deviation entries in
`cognate/DEVIATIONS.md` (capture-timing frames, right-sidebar-plan gap). Not re-flagged.

## New / carried-forward findings

### P1 — in-chat file-change chip is a text pill, not the reference's icon card (both viewports, 10-file-change-expanded)
Reference (`reference/screenshots/{desktop,laptop}/10-file-change-expanded.png`): the chat message
renders a distinct **file-chip card** — a blue "TS" file-type icon, filename "Edited greet.ts" as a
heading line, and "+1 -1" stat on a second line, inside a bordered card.
Cognate: the same control renders as a single-line **text button** reading "View changes to
src/greet.ts: Edited greet.ts +1 -1" with no icon and no card layout. ARIA accessible names are
equivalent in both apps (`button "View changes to src/greet.ts": Edited greet.ts +1 -1`), so this is
a pure visual/component-type mismatch, not a missing control — but the standard treats it as a
control needing pixel-level correspondence, and it is not listed in `cognate/DEVIATIONS.md`.
Fix: give the chat file-change control the reference's file-icon card layout (icon, filename
heading, stat line) instead of a text-pill button.

### P1 — Review panel toolbar is missing 3 top-right controls (both viewports, 10-file-change-expanded)
Reference ARIA (`reference/observations/aria/10-file-change-expanded.desktop.txt`): the tab-strip row
has `tab "Review · turn 1 Close"`, `button "New tab"`, **`button "Split"`, `button "Fullscreen"`,
`button "Collapse right sidebar"`** — 3 layout-control icons at the top right of the panel. The
content toolbar below it also has `button "Show file location" [disabled]` and
`button "More ways to open" [disabled]` beside "Open src/greet.ts in sidebar".
Cognate ARIA: the tab-strip row has only `tab "Review · turn 2 Close"` and `button "Add tab"
[disabled]` — **Split, Fullscreen, and Collapse-right-sidebar are entirely absent**. The content
toolbar also lacks "Show file location" and "More ways to open"; its "Open greet.ts in sidebar" is
disabled where the reference's equivalent is not. Visually confirmed in both viewport triptychs
(cognate panel header shows no icon cluster right of the "+" tab button). Not listed in
`cognate/DEVIATIONS.md`.
Fix: add the missing Split/Fullscreen/Collapse-right-sidebar tab-strip controls and the
Show-file-location/More-ways-to-open toolbar buttons to `ReviewPanel`; audit why
"Open ... in sidebar" is disabled when the reference leaves it enabled.

### P0 — user message bubble is near-black in Cognate app-wide; reference is light lavender (both viewports, every checkpoint in scope)
Reference (e.g. `reference/screenshots/desktop/08-tool-running.png`,
`10-file-change-expanded.png`, `11-approval-pending.png`, `13-plan-active.png`,
`14-subagent-active.png`): the user's own chat bubble is a **light lavender/periwinkle fill** with
dark text.
Cognate (same checkpoints, same files under `cognate/screenshots/`): the user bubble is **near-black**
with white text, on every single checkpoint reviewed in this scope (both viewports).
`cognate/DEVIATIONS.md` claims "Accent color is near-black/gray (`--cg-accent`), ... matching the
reference" — that claim is contradicted by the actual reference screenshots, which show a light
lavender user bubble, not black. This is a cross-cutting, high-visibility mismatch (present in
every message the user sends) and the DEVIATIONS.md entry documenting it as "matching the reference"
is itself wrong, so it cannot be treated as an accepted deviation.
Fix: give the user-message bubble its own light-lavender token (do not tie it to `--cg-accent`,
which correctly went near-black for buttons); correct the `DEVIATIONS.md` claim once fixed.

## Verdict

**REJECT** for this scope. Round-2's three claimed fixes are genuinely fixed (mode badge, subagent
anchored popover, and the Review panel's existence/basic structure), but two new P1s (file-change
chip styling, incomplete Review-panel toolbar) and one P0 (near-black user bubble, contradicting
DEVIATIONS.md's own "matches reference" claim) remain open. 3 open findings: 1 P0, 2 P1.
