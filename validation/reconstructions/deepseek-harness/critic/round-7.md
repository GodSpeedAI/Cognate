# Critic round 7 — "Work details" setting (matrix §10/§10a)

Scope: `reference-behavior-matrix.md` §10a. Read-only check of triptychs
`diffs/desktop/21-work-details-{compact,standard,detailed,verbose}.png`, matching
`reference/screenshots/desktop` and `cognate/screenshots/desktop`, ARIA dumps in
`reference/observations/aria/21-*` and `cognate/observations/aria/21-*`, the durability test, and
`cognate/src/ui/App.tsx` vs. `.tmp/ref/deepseek-harness/packages/client/ui-chat/src/client/transcript-view.ts`.

## Findings

### P1-1 — Settings → General "Work details" control uses the wrong ARIA widget pattern

`cognate/src/ui/App.tsx` lines 637-650 renders Work details as `role="group"` containing four
plain `<button type="button" aria-pressed={...}>` toggles (Compact/Standard/Detailed/Verbose all
visible at once, segmented-control style) — the same pattern used for the Appearance/Theme row
immediately above it (lines 629-636).

The reference implements Work details as a single dropdown button whose accessible name is the
*currently selected* label, `aria-haspopup="menu"`, opening a menu of four `menuitem`s (matrix
§10a lines 399-403, confirmed against the reference's own `PreferenceRow.tsx`; also visible in
`reference/observations/aria/21b-persistence-after-reload.desktop.txt` line 71: `text: ... Work
details ... - button "Verbose"` — a single button, not a 4-button group). Reference's Appearance
row, by contrast, *is* a 3-button toggle row (`button "Light"`, `button "Dark" [pressed]`, `button
"System"`) — so the reference itself uses two different widget shapes for these two settings, and
cognate collapsed both to the same (Appearance-style) shape.

Labels ("Compact"/"Standard"/"Detailed"/"Verbose"), the default ("Standard" — `workDetails.ts`
`DEFAULT_WORK_DETAILS_MODE = "standard"`), and the four-option set are all correct. Only the
interaction/ARIA pattern (menu-button vs. button-group) diverges.

**Evidence gap**: no `cognate/screenshots/desktop` or `cognate/observations/aria` capture of the
Settings → General panel itself exists (only `21-work-details-*` transcript checkpoints and
`02*-model-settings*` captures are present). This divergence was only found by reading
`App.tsx` directly, not from the triptych evidence — a future visual-only pass would miss it.

**Fix**: re-render the Work details control as a single button (`aria-haspopup="menu"`, accessible
name = current mode's label) opening a menu of four `menuitem`s, matching the Appearance-vs-Work
details shape split the reference itself uses; capture a `22-settings-general` (or similar)
screenshot+ARIA checkpoint for both apps so this control has direct visual evidence going forward.

### P2-1 — Verbose triptych: which step fails differs between reference and cognate captures

Reference verbose ARIA (`21-work-details-verbose.desktop.txt`) shows **Read** and **Edit** both
failing ("Error: cannot read/edit ...: not found"), Bash succeeding. Cognate's capture shows only
**Edit** failing (`tool.edit: old_string not found`); Read and Bash both succeed. The failed-step
*styling* itself matches where it does occur (red text, raw error message inlined on the step's own
row, `list "Tool call steps"` / `listitem` in cognate vs. flat buttons in reference) — this is a
mock-scenario/workspace-state difference between the two capture runs (each was captured against a
freshly-seeded workspace whose exact file contents differ slightly), not a work-details rendering
bug. Non-blocking; note for anyone re-running captures that the two fixtures aren't byte-identical
at this checkpoint.

### Confirmed correct (no issue)

- Compact/Standard/Detailed: reference and cognate both render the same folded "Took Ns" + final
  answer text at this single-turn depth; no visible difference in either the pixel diff or ARIA
  (`button "Took Ns"` + `paragraph` final answer in both, modulo cognate's captures having
  `[disabled]` on most session-chrome controls — a pre-existing capture-harness pattern seen across
  all prior rounds' captures generally, not specific to work-details, not a new finding).
- Verbose: both unfold into a per-step list ("Read · path", "Bash · description", "Edit · path")
  with no "Took Ns" fold rendering as a plain summary line — matches matrix's described effect.
  Failed-step styling (red, inline raw error) is present and correctly triggered on cognate's Edit
  step.
- Durability: `bun test cognate/test/J-I-work-details.test.ts` → **2 pass, 0 fail, 4 expect()
  calls**. Confirms the setting is durable event-log state (survives a full runtime restart against
  the same SQLite store) and that `settings.changeWorkDetails` rejects an unknown mode.
- Source independence: `cognate/src/workDetails.ts` + the `useWorkDetails`/`setWorkDetails` hooks in
  `App.tsx` are an event-sourced-projection + React-hooks design, structurally unrelated to the
  reference's `TranscriptViewPolicy` class in `transcript-view.ts` (a `SnapshotStore`-based
  subscribe/adopt/setMode class with legacy-mode migration). Same underlying concept (four-mode work
  details), no copied code or structure.

## Summary

- P0: 0
- P1: 1 (Work details control's ARIA widget shape — dropdown/menu vs. button-group)
- P2: 1 (verbose-triptych failed-step divergence between capture runs — cosmetic/evidence note only)

## Verdict: **CHANGES REQUESTED**

One open P1 (control-shape ARIA mismatch, with an evidence gap that let it go uncaught through
round 6's screenshot-based review). Fix P1-1 and re-capture a Settings → General checkpoint before
re-requesting APPROVE.
