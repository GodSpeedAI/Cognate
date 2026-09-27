# Round-3 critic disposition

Disposition of every finding in `critic/round-3-visual-a.md` and `critic/round-3-visual-b.md`.
Evidence regenerated with `MOCK_CHUNK_DELAY_MS=250 bun R/fixtures/mock-model/server.ts --port=4010`,
`tests/capture/cognate.capture.ts` for desktop (1440×900, port 42180) and laptop (1024×768, port
42181) against fresh `/tmp/dsh-r3/{desktop,laptop}/{home,ws}` dirs, and `tests/visual/compare.ts`.

## Batch A (`critic/round-3-visual-a.md`)

| Item | Severity | Disposition |
|---|---|---|
| P1-1 — Checkpoint 03: onboarding dialog stage no longer aligned | P1 | **FIXED** — `tests/capture/cognate.capture.ts` now takes the `03-no-workspace` screenshot before dismissing either onboarding dialog (previously it dismissed dialog 1 first, landing on dialog 2). Both sides now show the same first dialog ("Internal Testing Notice" / Cognate's equivalent) still open. Evidence: `diffs/{desktop,laptop}/03-no-workspace.png` — both panes show the first-dialog frame; remaining diff is the already-accepted Cognate-branded copy deviation. |
| P1-2 — User message bubble near-black regression | P1 | **FIXED** — `.message-bubble` now uses dedicated `--cg-message-bubble-bg`/`--cg-message-bubble-text` tokens (`#edf3fe` light / `#2a3350` dark, sampled from `reference/screenshots/desktop/15-completed-session.png`) instead of `--cg-accent`. `--cg-accent` (near-black) now only backs modal/approval CTA buttons, matching the reference. Evidence: `diffs/{desktop,laptop}/{06-user-message,15-completed-session,19-cancelled}.png`. |
| P2-1 — Checkpoint 19: extra "Stopped" status dot | P2 | **FIXED** — added `.status-pill.status-cancelled` (transparent, zero-size) so the cancelled-turn status pill renders no visible dot while keeping its `role="status"` accessible text. Evidence: `diffs/{desktop,laptop}/19-cancelled.png`. |
| P2-2 — Checkpoint 19: step counter still 0 | P2 | **FIXED** — turn `stepCount` is now `useToolTimeline(...).length + 1` (the `+1` is the model's own generation step, present even with 0 tool calls or on a cancelled turn). Verified against every reference ARIA dump with a turns/steps footer: 0 tools → "1 steps" (`15-completed-session`, `19-cancelled`), 1 tool → "2 steps" (`12-approval-resolved-{allow,deny}`), 2 tools → "3 steps" (`13c-plan-completed`), 3 tools → "4 steps" (`09-tool-complete`, `10-file-change-*`) — all now match. Evidence: `diffs/{desktop,laptop}/{15-completed-session,19-cancelled}.png` footer text. |

**Verdict for this scope:** all 4 items FIXED — 0 P0/P1/P2 remaining from batch A.

## Batch B (`critic/round-3-visual-b.md`)

| Item | Severity | Disposition |
|---|---|---|
| P0 — user message bubble near-black app-wide | P0 | **FIXED** — same fix as batch A's P1-2 above (dedicated `--cg-message-bubble-*` tokens). `DEVIATIONS.md`'s "Accent color is near-black/gray... matching the reference" claim is corrected — see the new "Accent color audit" entry, which also documents that the composer send/stop button and the active-tab underline are a separate blue (`--cg-accent-interactive`, `#4176e6`) found during the requested full audit of `--cg-accent` usage, not just the message bubble. Evidence: `diffs/{desktop,laptop}/{06-user-message,07-streaming,15-completed-session}.png`; `cognate/DEVIATIONS.md` "Accent color audit" section. |
| P1 — in-chat file-change chip is a text pill, not an icon card | P1 | **FIXED** — `EditDiff` (`src/ui/App.tsx`) now renders `.edit-diff-card`: a `FileIcon`, "Edited `<file>`" heading, and "+N -M" stat line inside a bordered card, matching the reference's icon-card layout. Accessible name (`View changes to <path>: Edited <file> +N -M`) preserved via `aria-label`. Evidence: `diffs/{desktop,laptop}/10-file-change-expanded.png`. |
| P1 — Review panel toolbar missing 3 top-right controls, "Show file location"/"More ways to open", disabled "Open in sidebar" | P1 | **FIXED** — added `Split`/`Fullscreen`/`Collapse right sidebar` icon buttons to the tab-strip row (`ReviewPanel` in `src/ui/App.tsx`, new `FullscreenIcon` in `src/ui/icons.tsx`) and `Show file location`/`More ways to open` buttons to the content toolbar. All five are present-but-inert (`disabled`, `title={NOT_IMPLEMENTED}`) — this tranche has no multi-pane layout engine, real fullscreen, collapsible right sidebar, file-location surface, or external-open integration; the reference's own ARIA also shows `Show file location`/`More ways to open` as `[disabled]`. "Open `<file>` in sidebar" is now enabled (was incorrectly disabled), matching the reference. Documented in `cognate/DEVIATIONS.md` "Round-3 critic fixes". Evidence: `diffs/{desktop,laptop}/10-file-change-expanded.png`. |

**Verdict for this scope:** all 3 items FIXED — 0 P0/P1 remaining from batch B.

## Gates (all green)

- `cd cognate && bun test`: 19 pass, 0 fail.
- `cognate` and root `bun run typecheck`: clean.
- Root `bun run test`: 524 pass, 0 fail.
- `bun test R/tests/architecture`: 62 pass, 0 fail (`R` = `validation/reconstructions/deepseek-harness`).
- `cd R/tests && bun run journeys/run.ts cognate`: 11/11 Cognate PASS (two reference-side journeys were flaky/retried on the reference driver only, unrelated to this batch; Cognate itself passed on first attempt every time).

## Scope note

No files under `packages/` were touched. No code, CSS, or assets were copied from `.tmp/ref/**` —
the file-icon card, new icons (`FullscreenIcon`), and accent-token split are original, hand-authored
to match the reference's *layout and color*, not its implementation.
