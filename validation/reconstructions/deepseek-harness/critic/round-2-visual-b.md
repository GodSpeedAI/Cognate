# Visual parity critic — round 2 (batch B)

Scope: 08-tool-running, 09-tool-complete, 10-file-change-collapsed, 10-file-change-expanded,
11-approval-pending, 11b-approval-pending-after-reload, 12-approval-resolved-allow,
12-approval-resolved-deny, 13-plan-active, 13b-plan-review-prompt, 13c-plan-completed,
14-subagent-active, 14b-subagent-completed-panel. Both viewports (desktop, laptop).

Method: opened every triptych in `diffs/{desktop,laptop}/*.png`, and the individual
`reference/screenshots` vs `cognate/screenshots` PNGs plus ARIA snapshots where detail was small.
Cross-checked every divergence against `cognate/DEVIATIONS.md` before flagging.

## Per-checkpoint verdicts

| Checkpoint | Desktop | Laptop |
|---|---|---|
| 08-tool-running | MATCH (timing frame per accepted deviation) | MATCH |
| 09-tool-complete | MATCH | MATCH |
| 10-file-change-collapsed | MATCH | MATCH |
| 10-file-change-expanded | **DIVERGES** | **DIVERGES** |
| 11-approval-pending | **DIVERGES** | **DIVERGES** |
| 11b-approval-pending-after-reload | **DIVERGES** | **DIVERGES** |
| 12-approval-resolved-allow | **DIVERGES** | **DIVERGES** |
| 12-approval-resolved-deny | **DIVERGES** | **DIVERGES** |
| 13-plan-active | MATCH | MATCH |
| 13b-plan-review-prompt | MATCH (right-sidebar gap is accepted deviation) | MATCH |
| 13c-plan-completed | MATCH (accepted deviation) | MATCH |
| 14-subagent-active | MATCH | MATCH |
| 14b-subagent-completed-panel | **DIVERGES** | **DIVERGES** |

## Divergences

### P0 — 10-file-change-expanded (both viewports): missing Review split-diff panel
Reference: clicking "View changes" opens a **dedicated Review panel** that splits the window —
chat stays on the left, a new right pane appears with its own tab strip (`Review · turn N` tab,
`×`, `+` add-tab), a toolbar (list-view icon, split/unified toggle, code-view icon, layout dropdown,
panel-layout icons top right), and a full-height two-column diff with gutter line numbers and
`@@ -1,3 +1,3 @@` hunk headers.
Cognate: the diff renders **inline inside the chat message** as a small card (`src/greet.ts`,
side-by-side code without line numbers) with `Split view` / `Line wrap` / `Open greet.ts in sidebar`
buttons below it. No second pane opens, no Review tab, no toolbar icons exist anywhere in the app.
Not listed in DEVIATIONS.md (only the subagent right-panel and plan right-sidebar gaps are recorded
there; the Review diff panel is a separate, unaddressed feature).
Fix: implement a real split Review panel matching the reference's tab strip + toolbar + gutter'd
diff, opened by "View changes"/"View full plan"-style triggers, or explicitly document this as an
accepted architecture gap in DEVIATIONS.md if out of scope for this tranche.

### P1 — 11, 11b, 12-allow, 12-deny (both viewports): session-mode badge always says "Standard mode"
Reference's header badge reads **"PTC mode"** for these approval-gated sessions
(confirmed in `reference/observations/aria/11-approval-pending.desktop.txt` line 18, and the same
for 11b/12-allow/12-deny). Cognate's badge always reads "Standard mode" in every one of these
checkpoints. Not listed in DEVIATIONS.md.
Fix: derive the header mode badge from the session's actual permission mode instead of a hardcoded
"Standard mode" string; show "PTC mode" (or whatever the real mode enum resolves to) when the
session runs under the permission-to-continue/approval-gated mode.

### P1 — 14b-subagent-completed-panel (both viewports): subagent detail renders as a bottom banner, not a header-anchored dropdown
Reference: clicking/expanding the "1 subagent" header badge opens a compact **anchored dropdown
popover** directly under the header (`Summarize project status · 0 tok · ... · continuable · 0s ›`),
same accessible state (`button "1 subagent" [expanded]`) reflected as a small floating card.
Cognate: ARIA also marks `button "1 subagent" [expanded]`, but visually the same content renders as
a **full-width bar fixed above the composer at the bottom of the page** ("Summarize project status ·
... · running · 0 tok · 0s" + "Open Summarize project status in sidebar" button) — a completely
different position/affordance from the reference's small header dropdown. Not listed in
DEVIATIONS.md (only the *right-panel contents* being minimal is recorded, not this positioning
divergence).
Fix: render the subagent-list disclosure as an anchored dropdown under the "N subagent(s)" header
badge (reference position/size), not as a persistent bottom banner.

## Accepted deviations re-confirmed (not re-flagged)
- 08-tool-running / 13-plan-active capture-timing frames (both viewports) — image content is
  consistent with the documented capture-timing race, not a UI defect.
- 13b/13c: no right-sidebar plan tab; full plan shown inline via `PlanReviewCard`'s "View full plan"
  disclosure instead of a populated right pane, and "Open plan: `<title>`" is present-but-disabled —
  both match the documented deviation exactly, images do not contradict it.
