# Round-4 critic disposition

Scope: all findings from `critic/round-4-visual-a.md` and `critic/round-4-visual-b.md`. Where the two
batches disagreed (chat-column width/centering, and the "Took Ns" line), batch A's findings are taken
as correct per the orchestrator's verification against `10-file-change-collapsed`.

## Batch A

| # | Finding | Severity | Disposition |
|---|---|---|---|
| P1-1 | Chat column/composer not width-constrained/centered | P1 | **FIXED** — `.messages` and every element docked at the composer's position (`.composer-card`, `.approval-card`, `.plan-review-card`, `.todo-widget`) now share a `--cg-chat-column-max-width: 790px` cap with `margin-inline: auto`. Measured with a `pngjs` script against `reference/screenshots/desktop/15-completed-session.png`: reference content spans x=485..1227 (742px); cognate now spans x=489..1230 (741px) — a 1px match. Laptop is close (672px reference vs 695px cognate). `src/ui/app.css`. |
| P1-2 | Main canvas gray instead of white in hero/pre-response/streaming | P1 | **FIXED** — `.center-column`'s background changed from `var(--cg-bg)` (gray) to `var(--cg-surface)` (white), unconditionally, so every state (hero, pre-response, streaming, completed) is white. `src/ui/app.css`. |
| P1-3 | Step counter regressed to "0 steps" for a session reopened from history | P1 | **FIXED** — root cause: `openSession` (`App.tsx`) populated the transcript from `session.history`, which never carried a `stepCount`. `sessionHistoryComponent` (`src/capabilities/sessionHistory.ts`) now counts each run's `tool.call.started` events via `service.events({runId})` and attaches `stepCount = toolCallCount + 1` to each assistant message; `openSession` consumes it. Verified against reference ARIA for 09 (4 steps), 12-allow/deny (2 steps), 13c (3 steps), 15 (1 step, was 0), 19 (1 step) — all match on both viewports. |
| P1-4 | Sidebar workspace row missing folder icon | P1 | **FIXED** — added `FolderIcon` to `src/ui/icons.tsx`, rendered before the workspace name in `.workspace-row-label`. |
| P1-5 | "Took Ns" rendered as a bordered pill with a status dot | P1 | **FIXED** — `.took-btn` is now border/background-free plain text; the leading `.status-pill` dot (default, no modifier) is now zero-size/transparent for completed and failed turns alike (matching the already-fixed cancelled "Stopped" treatment). The in-progress "Deep diving" tool-activity dot (a different, legitimately-visible indicator per batch B's sweep) was given its own `.status-active` modifier so it keeps its visible green dot. |
| P2-1 | Hero heading/badges bolder and bordered vs. reference | P2 | **FIXED** — `.hero-heading` weight 600→500; `.hero-preview-badge`/`.hero-pill` lost their border/background, now plain text+icon. |

## Batch B

| # | Finding | Severity | Disposition |
|---|---|---|---|
| P1 | Subagent popover (14b) wraps to 4 lines with an internal divider instead of one ellipsis-truncated row | P1 | **FIXED** — `SubagentTree` now renders one `<button role="treeitem" className="subagent-row">` per child: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` on the description, a trailing `0 tok / 0s` stat, and a trailing `ChevronRightIcon`; the whole row is the "Open ... in sidebar" click target (aria-label), no internal divider/second box. |
| P2 | Laptop file-change card icon lacks the colored "TS" glyph | P2 | **FIXED** — `EditDiff` now derives the file extension and renders a blue "TS" square for `.ts`/`.tsx` (falls back to the generic `FileIcon` otherwise), independent of viewport width, so laptop matches desktop. |
| P2 | Session header keeps full text-label buttons (two rows) once the Review panel narrows the chat | P2 | **FIXED** — `header-actions` now renders `ExternalLinkIcon`/`ChevronDownIcon` icon-only buttons (same accessible names, still disabled per `DEVIATIONS.md`) when `openReview` is set, keeping the header a single row. |

## Files changed

- `cognate/src/ui/app.css` — chat-column centering, canvas background, took-btn/status-pill, hero
  heading/badges, subagent-row, edit-diff-icon TS coloring, workspace-row-label icon layout.
- `cognate/src/ui/App.tsx` — `FolderIcon` in the workspace row, `SubagentTree` single-row rewrite,
  `EditDiff` extension-aware icon, session-header icon-only collapse when Review panel is open,
  `openSession`'s `stepCount` plumbing.
- `cognate/src/ui/icons.tsx` — added `FolderIcon`, `ChevronRightIcon`, `ExternalLinkIcon`.
- `cognate/src/capabilities/sessionHistory.ts` — per-message `stepCount` derived from recorded
  `tool.call.started` events.

## Gates

- APP `bun test`: 19 pass, 0 fail.
- APP `bun run typecheck` / root `bun run typecheck`: clean.
- Root `bun run test`: 524 pass, 0 fail.
- `bun test validation/reconstructions/deepseek-harness/tests/architecture`: 62 pass, 0 fail.
- `cd tests && bun run journeys/run.ts cognate`: 11/11 cognate journeys PASS.

## Evidence

Regenerated via `MOCK_CHUNK_DELAY_MS=250 bun fixtures/mock-model/server.ts --port=4010`, then
`tests/capture/cognate.capture.ts` for desktop (1440×900, port 42180) and laptop (1024×768, port
42181) against fresh `/tmp` home/ws dirs, then `tests/visual/compare.ts`. Triptychs for 04, 06, 07,
10-collapsed, 10-expanded, 14b, 15, 19 (both viewports) were read directly and confirm: centered
white-canvas chat column, correct step counters, folder icon, unstyled "Took Ns", single-row subagent
popover, and the TS glyph on both viewports. No regressions found in the surrounding checkpoints
covered by the same evidence (spot-checked 01, 03, 08, 09, 12, 13c, 16, 17, 18, 20).
