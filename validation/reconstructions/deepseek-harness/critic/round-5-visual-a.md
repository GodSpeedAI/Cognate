# Round 5 (final) Visual Parity Critic — Batch A

Scope: 01, 02, 02b, 02c, 02d, 03, 04, 05, 06, 07, 15, 16, 17, 18, 19, 20 — both viewports (desktop,
laptop). Read-only: no captures run, evidence is current. Method: opened `diffs/{desktop,laptop}/*.png`
triptychs for every in-scope checkpoint, cross-checked full-resolution
`reference|cognate/screenshots/<vp>/*.png` and `reference|cognate/observations/aria/*.txt` for every
round-4 claim, pixel-measured with a `pngjs` script (`tests/node_modules/pngjs`) where useful, and read
the relevant `cognate/src/ui/app.css` / `App.tsx` source for the one new defect found, to confirm root
cause rather than guess from pixels alone.

## Claim-verification table (vs `critic/round-4-disposition.md`)

| # | Item | Claimed | Verdict |
|---|---|---|---|
| P1-1 | Chat column/composer centered, `~790px` cap | FIXED | **FIXED-VERIFIED** — visually centered with symmetric margins in `15-completed-session`, `06`, `07`, `16`, `19` on both viewports; consistent with disposition's 741px/742px pngjs measurement. |
| P1-2 | Canvas white (not gray) in hero/pre-response/streaming | FIXED | **FIXED-VERIFIED** — `04-workspace-selected`, `06-user-message`, `07-streaming` all render pure white center pane, both viewports. |
| P1-3 | Step counter `+1` applies to completed sessions too | FIXED | **FIXED-VERIFIED** — `15-completed-session` reads "1 turns 1 steps" both viewports, matching reference. |
| P1-4 | Sidebar workspace row folder icon | FIXED | **FIXED-VERIFIED** — folder icon renders before the workspace name in `04`, `06`, `07`, `15`, `16`, `19`, both viewports. |
| P1-5 | "Took Ns" plain text, no pill/dot | FIXED | **FIXED-VERIFIED** — `15-completed-session` ("Took 0s"/"Took 6s") and `16-session-history`'s equivalent ("Took 2s") render as plain text, no border, no dot, both viewports. `19-cancelled`'s "Stopped" likewise plain. |
| P2-1 | Hero heading/badges lighter weight, no pill border | FIXED | **FIXED-VERIFIED** — `04-workspace-selected` heading is regular weight; "ws-cap1"/"Standard mode" render as plain icon+text, both viewports. |
| Batch B P1 | Subagent popover single-row | FIXED (out of batch-A scope) | Not independently re-verified this round; no incidental regression observed in in-scope checkpoints. |

All six of round-4's batch-A dispositions hold under re-verification.

## New findings

### P1-6 — "Deep diving for Ns" status label is invisible during pre-tool-call streaming (both viewports)

Reference shows visible plain-text "Deep diving for Ns" next to (right of) the status dot whenever a
turn is streaming with no tool call yet in progress — confirmed in
`reference/screenshots/{desktop,laptop}/{06-user-message,07-streaming}.png` and their ARIA dumps
(`button "Deep diving for 1s" [disabled] [expanded]` / `status: Deep diving...`). Cognate's equivalent
frame shows **only a bare gray dot, no text at all** — confirmed visually in
`cognate/screenshots/{desktop,laptop}/{06-user-message,07-streaming}.png` (nothing painted right of the
dot) and by a `pngjs` scan of `cognate/screenshots/desktop/07-streaming.png` row-by-row from x=489 to
x=700 at y=195–212: no pixel differs from white beyond the dot itself (x≈489–505). The label text is
present in the accessibility tree (`status: Deep diving for 1s` in
`cognate/observations/aria/07-streaming.desktop.txt`) but not painted, so this is a **visual-only**
defect, not a missing feature.

Root cause, confirmed by reading source: `cognate/src/ui/App.tsx` lines 1585–1590, the
`message.streaming` branch (used for 06/07's "streaming, no tool call yet" state) renders:
```
<span className="status-pill status-streaming" role="status">
  <span className="sr-only">Deep diving for {elapsedSeconds ?? 0}s</span>
</span>
```
— the label is wrapped in `.sr-only` (clipped to 1px, `cognate/src/ui/app.css` lines 763–773), so it is
accessible-only and never visible. This differs from the sibling `ToolActivity` component (App.tsx
960–976, used once a real tool call starts, e.g. `08-tool-running`) which at least renders a
`<button className="tool-activity-btn">` with visible children (`toolActionLabel(current)`) — that path
is unaffected. Only the earlier "streaming, no tool entries yet" branch lost its visible text, most
likely a regression introduced alongside round-4 P1-5's fix (which correctly made `.status-pill` itself
invisible for "Took Ns" but over-reached by hiding this state's label too instead of giving it a
visible sibling like `.took-btn`).

Affects: `06-user-message`, `07-streaming`, both viewports (4 screenshots), and structurally any other
checkpoint that can be captured mid-stream before a tool call starts. Not documented in
`DEVIATIONS.md`.

Fix: in the `message.streaming` branch, add a visible text sibling next to the dot, e.g.
`<span className="took-btn">Deep diving for {elapsedSeconds ?? 0}s</span>` (reusing the existing plain
unstyled `.took-btn` treatment), and drop or keep the `.sr-only` duplicate only if avoiding a doubled
accessible name — reference's own accessible name for this state is exactly "Deep diving for Ns", so a
single visible element with no separate `sr-only` copy is cleanest.

## Evidence-quality note (not a cognate defect)

`reference/screenshots/desktop/{16-session-history,17-restored-after-reload,18-error}.png` (and their
ARIA dumps) are all still mid-stream ("Deep diving for Ns", "Stop generating" button present) — the
reference capture's 15s wait after sending `"trigger a real provider error"`
(`tests/capture/reference.capture.ts` line ~181) is insufficient for the real closed-port retry-backoff
sequence to settle, so none of these three reference screenshots ever reach the completed/failed state
cognate correctly renders (`Took 2s`, `Retried model request (5/5)`, `alert: This turn failed / Internal
server error / HTTP_500`). This was already true in earlier rounds too (`DEVIATIONS.md` lines 283–286
already note "the reference's own expanded-state content ... was not captured"), so it is not a new
regression and not scored against cognate — but it does mean checkpoints 16/17/18 cannot be pixel/ARIA
compared 1:1 against reference for their settled content this round either; comparison there relied on
structural/spec judgment instead. Recommend increasing the reference capture's wait (or polling for
settlement) so a future round can do a real side-by-side for these three checkpoints.

Separately, `cognate/screenshots/desktop/20-theme-variant.png` still shows the Settings dialog open
(dark-themed) while `reference/screenshots/desktop/20-theme-variant.png` shows Settings closed, main
chat visible. Root cause is `tests/capture/cognate.capture.ts` lines 328–337: the checkpoint is taken
*before* `Close settings` is clicked, while `reference.capture.ts` closes Settings first. The underlying
dark theme is correctly applied throughout the shell in both (sidebar, header, chat, composer all
consistently dark) — this is a capture-script ordering difference, not a rendering defect. Recommend
swapping the checkpoint/close order in `cognate.capture.ts` to match `reference.capture.ts` for a
cleaner future diff, but not scoring it as a P1 against the app itself since the dark-mode styling
visible in the current screenshot is correct.

## P2 findings

None new this round beyond what round-4 already fixed (P2-1 verified fixed above).

## Verdict for this scope: **REJECT**

All six round-4 batch-A claims re-verified and hold. One new P1 found and root-caused: the
"Deep diving for Ns" status label is accessible but not visually painted during pre-tool-call streaming
(`06-user-message`, `07-streaming`, both viewports), contradicting the spec's "loading states" match
requirement (spec lines 556–569). Not documented in `DEVIATIONS.md`. Two evidence-quality notes are
recorded for the harness but not scored against the app. Cannot approve with one open P1.

## Summary

- **P0: 0**
- **P1: 1** — "Deep diving for Ns" streaming status text invisible (visible-only regression, root
  cause identified at `App.tsx` line ~1588, `.sr-only` wrapping with no visible sibling)
- **P2: 0**
