# Round 3 Visual Parity Critic — Batch A

Scope: 01, 02, 02b, 02c, 02d, 03, 04, 05, 06, 07, 15, 16, 17, 18, 19, 20 — both viewports (desktop,
laptop). Evidence was regenerated from current code (no captures run here). Method: opened every
in-scope triptych in `diffs/{desktop,laptop}/*.png`, cross-checked full-resolution
`reference|cognate/screenshots/<vp>/*.png` and `reference|cognate/observations/aria/*.txt` for each
claim and each new divergence, re-read `cognate/DEVIATIONS.md`.

## Claim-verification table (vs `critic/round-2-disposition.md`)

| # | Item | Claimed | Verdict |
|---|---|---|---|
| 1 | 03 missing "Standard mode" control | FIXED | **FIXED-VERIFIED** — aria confirms `button "Standard mode" [disabled]` present in Cognate's no-workspace DOM (both viewports). |
| 2 | 04 missing "Into the Unknown" hero | FIXED | **FIXED-VERIFIED** — hero (logo, Preview badge, workspace/mode pills, centered composer, no tab bar) renders identically to reference at both viewports. |
| 3 | 05 same root cause | FIXED | **FIXED-VERIFIED** — same hero renders; byte-equivalent to 04 as in reference. |
| 4 | 15 wrong session/scenario captured | FIXED | **FIXED-VERIFIED** — aria confirms treeitem `[[scenario:plain]] hello there` is `[selected]`; body shows the plain Summary/bullets/code-block content, not the delegate scenario. |
| 5 | 19 missing "Stopped" indicator | FIXED | **FIXED-VERIFIED** — standalone "Stopped" line and response-adjacent "Stopped" chip both render, both viewports. |
| 6 | 19 session title/list not persisted | FIXED | **FIXED-VERIFIED** — header title is the literal message, session is listed in the sidebar tree, both viewports. |
| 7 | 19 turn/step counters at 0 | FIXED | **NOT-FIXED (partial)** — turns now correct ("1 turns") but steps is still wrong: footer reads "1 turns 0 steps" vs reference's "1 turns 1 steps" on both viewports. |
| 8 | 01 "WORKSPACES" typography | FIXED | **FIXED-VERIFIED** — sidebar label now renders "Workspaces" sentence-case/regular-weight, matching reference. |
| 9 | 02 configured-provider capture mismatch | DEVIATION | **Confirmed as before** — both 02 captures now show the unconfigured empty state; no new divergence. |
| 10 | 03 blocking-modal/copy divergence (sequencing) | FIXED (sequencing) / DEVIATION (copy) | **NOT-FIXED** — see New Findings P1-1 below; sequencing did not converge, it changed to a different mismatch. |
| 11 | extra Dark/Light sidebar toggle | FIXED | **FIXED-VERIFIED** — sidebar footer no longer has the toggle; theme switch now lives in Settings → General → Appearance (checkpoint 20), matching reference's location. |
| 12 | accent color blue → near-black | FIXED | **PARTIALLY FIXED / REGRESSED** — see New Findings P1-2 below. Buttons ("Continue", primary actions) and active-row highlight are correctly near-black/neutral-gray now, matching reference. But the retone also darkened the **user message bubble** to near-black with white text; reference's user bubble is light lavender/blue-gray with dark text. This is a new, systemic divergence, not the one being fixed. |
| 13 | 02c creation-lifecycle capture mismatch | DEVIATION | **Confirmed as before** — no change, not re-flagged. |
| 14 | 06 missing activity-label text | DEVIATION (unchanged) | **Confirmed as before** — "Deep diving for Ns" label still absent at the 06 frame (unlabeled dot only); pre-accepted, not re-flagged. |
| 15 | 16 retry-summary chrome (pill vs plain text) | DEVIATION (unchanged) | **Confirmed as before** — Cognate's bordered chevron pill vs reference's plain text; pre-accepted, not re-flagged. |
| 16 | 20 active-row highlight color | FIXED | **FIXED-VERIFIED** — dark-mode active session row is now neutral gray, not blue-tinted. |

## New findings

### P1-1 — Checkpoint 03: onboarding dialog stage no longer aligned between reference and Cognate (both viewports)

Reference's `03-no-workspace` capture lands with the **first** onboarding dialog ("Internal Testing
Notice") still open, sidebar showing "No sessions yet" — i.e. the same underlying frame as checkpoint
01. Cognate's `03-no-workspace` capture instead lands with the **second** onboarding dialog ("Add an
API key to get started") open, sidebar showing "No workspace selected", and the no-workspace
alert/composer visible behind it. Confirmed via aria and full-resolution screenshots on both sides.
This is a different mismatch than the one round-2 flagged (previously both sides were on the *same*
first dialog with different underlying page state; now the two sides are on *different* dialogs
entirely), so the round-2 "sequencing" fix did not converge — it moved the divergence rather than
closing it. All of the underlying no-workspace controls (including "Standard mode", confirmed via
aria) are present and correct in Cognate's DOM regardless of the modal on top, so this is a
capture-alignment problem, not a missing-control regression. Fix: align both capture scripts on the
same onboarding-dialog stage before taking the `03` screenshot (either both still on dialog 1, or
both already past it to dialog 2/no-workspace-unblocked, whichever matches the reference's actual
product flow).

### P1-2 — User message bubble (and any other near-black-retoned surface that should stay light) — every checkpoint with a visible user message (06, 07, 15, 16, 17, 18, 19; both viewports)

Reference's user-message bubble is a light lavender/blue-gray fill (`#e8eaf9`-ish) with dark text
(visible in `reference/screenshots/{desktop,laptop}/06-user-message.png` and all later checkpoints
that carry a message forward). Cognate's user-message bubble is now solid near-black with white text
— confirmed in `cognate/screenshots/{desktop,laptop}/06-user-message.png`, `15-completed-session.png`,
`19-cancelled.png`, `18-error.png`, and the same frames at laptop width. This is the flip side of the
round-2 accent-color fix (`--cg-accent`/`--cg-active` retoned to near-black): the retone was applied
too broadly and pulled the message-bubble background along with the buttons/active-row, but the
reference does not use the same near-black tone for its message bubble — only for buttons/primary
actions. This is a pervasive, highly visible divergence across nearly every in-scope checkpoint (both
viewports), not a one-off. Fix: give the user-message bubble its own token (light
lavender/blue-gray fill, dark text) instead of inheriting `--cg-accent`; keep the near-black tone only
on buttons/primary actions and the active-session-row highlight, where it now correctly matches
reference.

### P2-1 — Checkpoint 19: extra "Stopped" status dot

Reference's standalone "Stopped" line is plain text with no leading indicator. Cognate's equivalent
line has a filled green circle before the word "Stopped" (both viewports). Not in DEVIATIONS.md. Fix:
remove the leading dot, or confirm/document it as an intentional status-color addition.

### P2-2 — Checkpoint 19: step counter still 0

See claim #7 above — "1 turns 0 steps" vs reference's "1 turns 1 steps", both viewports. Minor,
numeric-only, but the round-2 disposition claimed this fully fixed.

## Verdict for this scope: **REJECT**

Six of six round-2 P0 claims verify as fixed. However two items remain open: the 03 dialog-stage
misalignment (P1, carried over from round 2 in a new form) and a new, pervasive P1 — the user-message
bubble regressed to near-black/white-text against reference's light lavender/dark-text — introduced by
the same accent-retone that correctly fixed the button/active-row colors. Until these two P1s close,
this batch cannot APPROVE.

## Summary

- **P0: 0** (all 6 round-2 P0s verified fixed)
- **P1: 2** — 03 dialog-stage misalignment (new form of a round-2 item); user-message bubble
  near-black regression (new, pervasive)
- **P2: 2** — 19 extra "Stopped" status dot (new); 19 step counter still 0 (round-2 P1 claimed fixed,
  only half-fixed, downgraded to P2 since it's numeric-only)
