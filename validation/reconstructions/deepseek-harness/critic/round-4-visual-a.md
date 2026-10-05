# Round 4 (final) Visual Parity Critic — Batch A

Scope: 01, 02, 02b, 02c, 02d, 03, 04, 05, 06, 07, 15, 16, 17, 18, 19, 20 — both viewports (desktop,
laptop). Read-only: no captures run, evidence is current (per instructions). Method: opened
`diffs/{desktop,laptop}/*.png` triptychs for in-scope checkpoints, then cross-checked full-resolution
`reference|cognate/screenshots/<vp>/*.png` for every round-3 claim and for the specific sweep items
requested (chat column width/centering, canvas background, "Took Ns" vs status pill, sidebar folder
icon, header/composer geometry and type).

## Claim-verification table (vs `critic/round-3-disposition.md`)

| # | Item | Claimed | Verdict |
|---|---|---|---|
| 1 | 03 onboarding dialog stage alignment | FIXED | **FIXED-VERIFIED** — `01`/`03` both land on the same "Internal Testing Notice" dialog, matching backdrops, both viewports. |
| 2 | User-message bubble near-black regression | FIXED | **FIXED-VERIFIED** — bubble is light lavender (`#edf3fe`-ish) with dark text in `06`, `15`, `19` (desktop+laptop); near-black now only on modal/approval CTA buttons. |
| 3 | 19 extra "Stopped" status dot | FIXED | **FIXED-VERIFIED** — standalone "Stopped" line and pill both render with no dot in `19-cancelled` (desktop+laptop). |
| 4 | 19 step counter (`stepCount = tools.length + 1`) | FIXED | **NOT-FIXED (regressed elsewhere)** — `19-cancelled` itself now reads "1 turns 1 steps", correct. But `15-completed-session` (0 tools, same rule should give 1 step) now reads **"1 turns 0 steps"** against reference's "1 turns 1 steps" (both viewports) — see New Findings P1-3. The `+1` fix did not hold app-wide. |
| 5 | 10 file-change icon card | FIXED | **FIXED-VERIFIED** (spot check, out of this batch's primary scope but visible incidentally) — no new issue observed. |

## New findings

### P1-1 — Chat column is not width-constrained/centered; it fills the pane edge-to-edge

Reference's message column (text, code blocks, composer) is capped at roughly 740–780px and
horizontally centered in the remaining space right of the sidebar — confirmed by pixel measurement in
`reference/screenshots/desktop/{06-user-message,07-streaming,15-completed-session,16-session-history,
19-cancelled}.png`: content starts ~x=485, ends ~x=1227, leaving symmetric ~205–213px margins in the
1160px-wide content pane. Cognate's equivalent column runs nearly full width instead — content starts
~x=303/304 and ends ~x=1416, a ~24px margin on each side — confirmed in the matching
`cognate/screenshots/desktop/*.png` for the same checkpoints, and reproduced at laptop width too (e.g.
`19-cancelled.laptop.png`). This affects every checkpoint with a message thread in scope (06, 07, 15,
16, 17, 18, 19; both viewports) and the composer, which also stretches full-width instead of matching
the constrained column. Not documented in `DEVIATIONS.md`.
Fix: give the chat scroll region's inner content wrapper (and the composer) a `max-width: ~760px`
(match reference's measured ~742px column) with `margin-inline: auto`, instead of `width: 100%`/flex
stretch to the pane edges.

### P1-2 — Main canvas background is gray instead of white in several pre-completion states

Reference's center pane background is pure white (`#ffffff`) in every state observed, including the
hero landing and mid-stream. Cognate's center pane renders light gray (sampling close to `#f5f5f6`,
the same tone as the sidebar/app background) instead of white in: the "Into the Unknown" hero
(`04-workspace-selected`, both viewports), the user-message/pre-response frame
(`06-user-message`, both viewports), and the streaming frame (`07-streaming`, both viewports). By
contrast the same pane is correctly white once a turn settles (`15-completed-session`,
`16-session-history`, `19-cancelled`), so this is state-dependent, not a single missed token — the
chat pane's background appears to default to the app-shell gray and only switches to white after
first message completion. Not documented in `DEVIATIONS.md`.
Fix: give `.chat-pane`/`.hero-landing`'s background an explicit `background: var(--cg-surface, #fff)`
(or whatever token the completed-state pane already correctly uses) so it doesn't inherit the
app-shell gray during hero/pre-response/streaming states.

### P1-3 — Step counter regressed to 0 for zero-tool completed turns (round-3 fix did not hold app-wide)

Round-3 disposition claimed `stepCount = useToolTimeline(...).length + 1` fixes every zero-tool case
to read "1 steps" (citing `15-completed-session` and `19-cancelled` as verified). Re-checking now:
`19-cancelled` does read "1 turns 1 steps" correctly (both viewports), but
`cognate/screenshots/{desktop,laptop}/15-completed-session.png` reads **"1 turns 0 steps"** against
reference's "1 turns 1 steps" — the exact regression round-3 claimed fixed. Since 15 and 19 share the
same zero-tool-call shape, the `+1` term is evidently not applied consistently across both states (e.g.
it may be computed differently for a normally-completed run vs. a cancelled one). Fix: verify
`stepCount`'s source for the "completed" render path specifically (not just "cancelled") applies the
same `+1`.

### P1-4 — Sidebar workspace row: missing folder icon, and no distinct icon rendered

Reference's workspace row (`Workspaces` section) shows a folder-outline icon immediately left of the
workspace name (e.g. `folder-icon "ws-cap1"`), both as a bold link-styled row and consistently across
every checkpoint with a workspace selected. Cognate's equivalent row renders **no icon at all** — just
the bold blue-tinted workspace label (e.g. `"ws"`) with no leading glyph — confirmed in
`04-workspace-selected`, `06-user-message`, `07-streaming`, `15-completed-session`,
`16-session-history`, `19-cancelled` (both viewports). (The workspace name itself, `"ws"` vs
`"ws-cap1"`, is fixture data, not a UI bug, and out of scope here.) Not documented in `DEVIATIONS.md`.
Fix: render the same `FolderIcon` (already defined in `src/ui/icons.tsx` per the sidebar section
header) inline before the workspace name in the workspace-row component.

### P1-5 — "Took Ns" is reference plain text; Cognate renders a bordered pill with a colored status dot

Reference's per-turn duration line is unstyled inline text, "Took 6s", no border, no leading dot
(`reference/screenshots/desktop/15-completed-session.png`, `16-session-history.png` — via its
"Deep diving for Ns" sibling state which is also plain text). Cognate renders it as a bordered pill
("Took 0s"/"Took 2s") with a leading colored status dot — green for a normal completion
(`15-completed-session`), red for a failed turn (`16-session-history`/error scenario) — both viewports.
This is visually a much heavier treatment than the reference and was not addressed by round-3 (which
only fixed the *cancelled*-turn pill's dot, per P2-1 in round-3; this is the separate *completed/failed*
turn's own duration line, never flagged before). Not documented in `DEVIATIONS.md`.
Fix: render the duration line as plain text (no border, no background, no leading dot) to match
reference; keep the colored-dot/pill treatment only where the reference itself uses one (if anywhere —
not observed in this scope).

## P2 findings (minor, cosmetic)

### P2-1 — Hero heading and workspace/mode badges are bolder and bordered vs reference's lighter styling

`04-workspace-selected` (both viewports): reference's "Into the Unknown" heading is regular/medium
weight, and the "ws-cap1"/"Standard mode" row beneath it is plain icon+text with no visible pill
border. Cognate's heading is bold, and the "WS"/"Standard mode" badges are rendered as bordered gray
pills. Same family as P1-4/P1-5's "extra chrome" pattern but lower severity since it's confined to the
hero state. Fix: reduce heading `font-weight` to match (400–500), and drop the border/background from
the workspace/mode badges in the hero composer row (plain text + icon, like the reference).

## Verdict for this scope: **REJECT**

All four round-3 batch-A items were re-verified; three hold (03 dialog alignment, message-bubble
color, cancelled-pill dot). The fourth (step counter) only partially holds — it regressed for the
ordinary completed-session path even though the disposition cited that exact checkpoint as verified.
Five further findings are new for this round, all real and visible on both viewports, four rated P1:
non-centered/full-width chat column and composer, gray-instead-of-white canvas background in
hero/pre-response/streaming states, the step-counter regression, the missing sidebar folder icon, and
the "Took Ns" line's unwarranted pill/dot chrome. None of these are recorded in `DEVIATIONS.md` as
accepted deviations, and all contradict the spec's "overall page geometry," "chat column," "sidebar
widths and hierarchy," and "status indicators" match requirements (spec lines 556–569). Cannot approve
with five open P0/P1-severity items.

## Summary

- **P0: 0**
- **P1: 5** — chat column not centered/full-width; canvas gray in hero/pre-response/streaming; step
  counter regressed for completed sessions; sidebar workspace row missing folder icon; "Took Ns" wrapped
  in an unwarranted status-dot pill
- **P2: 1** — hero heading/badge weight and pill-border styling heavier than reference
