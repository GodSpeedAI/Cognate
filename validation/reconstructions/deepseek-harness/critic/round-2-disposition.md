# Round-2 critic disposition

Evidence regenerated this pass: `cognate/screenshots/{desktop,laptop}/*.png`,
`cognate/observations/aria/*.txt`, `diffs/{desktop,laptop}/*.png`, `diffs/summary.md`. Journey suite:
`tests/journeys/results/cognate.json` (11/11 passed). Gates: APP `bun test` 19/19, APP
`bun run typecheck` clean, root `bun run typecheck` clean, root `bun run test` 524/524, `bun test
tests/architecture` 62/62.

## Batch A (`critic/round-2-visual-a.md`)

| Item | Severity | Disposition |
|---|---|---|
| 03 missing "Standard mode" control | P0 | **FIXED** — `WorkspaceChooser` in `cognate/src/ui/App.tsx` now renders a disabled "Standard mode" pill. Evidence: `cognate/screenshots/{desktop,laptop}/03-no-workspace.png`. |
| 04 missing "Into the Unknown" hero | P0 | **FIXED** — new `HeroLanding` component; shown whenever the active session has zero messages. Evidence: `cognate/screenshots/{desktop,laptop}/04-workspace-selected.png` (desktop diff dropped from a full-chrome mismatch to 1.25%). |
| 05 same root cause | P0 | **FIXED** — same `HeroLanding` gate. Evidence: `05-empty-session.png`, desktop diff 1.25%. |
| 15 wrong session/scenario captured | P0 | **FIXED** — `tests/capture/cognate.capture.ts` now reselects the `hello there` session (`button.session-row[title*="hello there"]`) before the 15 checkpoint. Evidence: `15-completed-session.png` shows the plain-scenario "Summary"/list/code-block content, not the delegate scenario. |
| 19 missing "Stopped" indicator | P0 | **FIXED** — `MessageBubble` renders a disabled "Stopped" chip (was omitted entirely) plus a second `text: Stopped` tag in the actions row, matching reference aria. Evidence: `19-cancelled.png`. |
| 19 session title/list not persisted | P0 | **FIXED, root-caused as a capture-script race, not an app bug.** Confirmed via `app.sqlite`'s `events` table: a `run.cancelled` row existed with no matching `session.turn.started` for the same `session:<id>` correlation — the capture clicked Stop before the run's body (queued behind a still-streaming background delegate subagent from the 14-delegate checkpoint) ever executed its first line. Fixed by draining that background subagent to completion before checkpoint 15/19 (poll for "· completed ·" in the subagent popover) plus waiting 600ms after Send before looking for Stop, mirroring `reference.capture.ts`. Evidence: `19-cancelled.png` now shows the literal message as the title, and the session listed in the sidebar. |
| 19 turn/step counters at 0 | P1 | **FIXED** — `ChatMessage.stepCount` recorded at turn-finalize time (`toolEntries.length`); footer now shows real `{turns} turns {steps} steps`. Evidence: `19-cancelled.png` footer reads "1 turns 0 steps". |
| 01 "WORKSPACES" typography | P1 | **FIXED** — `.workspaces-header` set to sentence-case/regular-weight/13px. Evidence: `01-first-launch.png`. |
| 02 configured-provider capture-state mismatch | P1 | **DEVIATION** — reason: architecture/capture-lifecycle, not a UI defect. Reference's `02` capture happens to already show a configured provider; Cognate's `02` is genuinely first-visit unconfigured (the only state consistent with `01`/`03` needing no model yet). Both states are individually correct; `02d-model-settings-redacted-key` already demonstrates the configured-card layout. Documented in `cognate/DEVIATIONS.md` "Round-2 critic fixes". |
| 03 blocking-modal/copy divergence | P1 | **FIXED (sequencing) / DEVIATION (copy)** — capture script now takes the `03` screenshot with the second first-run dialog still open (matching reference's still-gated state), fixing the sequencing half. The dialog's own copy remains Cognate-branded wording (accepted per round-1 P0-1, unchanged). |
| extra Dark/Light sidebar toggle | P2 (cross-cutting) | **FIXED** — removed; theme switch moved to Settings → General → Appearance, matching where the reference exposes it (`reference.capture.ts`'s `20-theme-variant` step). Evidence: `20-theme-variant.png`. |
| accent color blue vs near-black | P2 (cross-cutting) | **FIXED** — `--cg-accent`/`--cg-active` retoned to near-black/gray (light and dark palettes). Evidence: any checkpoint with a primary button or active row, e.g. `01-first-launch.png` ("Continue" now black), `16-session-history.png` (active row neutral gray). |
| 02c creation-lifecycle capture mismatch | P2 | **DEVIATION** — same family as the 02 item above; not separately reworked. |
| 06 missing activity-label text | P2 | **DEVIATION (unchanged)** — already documented in `DEVIATIONS.md` as the fast-local-timing class of issue; not touched this pass (07-streaming already shows the equivalent content). |
| 16 retry-summary chrome (pill vs plain text) | P2 | **DEVIATION (unchanged)** — already documented as Cognate's own invention for this content; not touched this pass (time-boxed against the P0/P1 items). |
| 20 active-row highlight color | P2 | **FIXED** — covered by the accent-color retone above (`--cg-active` now neutral gray-based, not blue-tinted). |

## Batch B (`critic/round-2-visual-b.md`)

| Item | Severity | Disposition |
|---|---|---|
| 10-file-change-expanded missing Review split-diff panel | P0 | **FIXED** — new `ReviewPanel` component reuses the same right-panel shell the subagent child view opens: tab strip (`Review · turn N` + close + disabled "+"), a list/split/code toolbar, and a two-column gutter'd diff with an `@@` hunk header (`diffHunk()` in `cognate/src/ui/App.tsx`). The old inline-in-message diff card is gone; "Edited `<file>` +N -M" now only opens the panel. Geometry per product-characterization.md §2 (`.review-right-panel`: min 300px, max 70vw, default 45vw). Evidence: `diffs/{desktop,laptop}/10-file-change-expanded.png`. |
| 11/11b/12-allow/12-deny mode badge always "Standard mode" | P1 | **FIXED** — `sessions` projection now sets `mode: "ptc"` the first time a session's run emits `tool.approval.requested` (sticky), and the header badge reads it (`currentSession?.mode === "ptc" ? "PTC mode" : "Standard mode"`) instead of a hardcoded string. Evidence: `11-approval-pending.png` header badge. |
| 14b subagent panel renders as bottom banner, not anchored dropdown | P1 | **FIXED** — moved `SubagentTree` to render inside `.subagent-count-wrap` (position: relative) directly under the header badge, with `.subagent-tree` now `position: absolute` (anchored dropdown, min/max width, box-shadow) instead of a full-width banner above the composer. Evidence: `14b-subagent-completed-panel.png`. |

## P2s not addressed this pass (time-boxed)

06's missing activity-label text and 16's retry-summary chrome were left as documented deviations
(both pre-existing, low-value relative to the P0/P1 list, and already explained in `DEVIATIONS.md`).
No other P2s from either batch were skipped.
