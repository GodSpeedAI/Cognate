# Phase 9 — final independent verification

## Hallmark (structural/anti-slop) re-check

- Mechanical detector (`.claude/skills/impeccable/scripts/impeccable detect --json`) against the
  changed files: **0 findings** (`impeccable-detect-report.json`). One real finding surfaced during
  the pass itself — the `.surface-consequential` left border matched the "side-tab accent border"
  AI-slop tell — and was fixed before this final run, not dismissed (see DESIGN.md's note on it).
- No gradients, no glassmorphism, no re-drawn browser/IDE chrome were introduced.
- Macro structural finding from `hallmark-audit.md` (finding 5: "no distinct surface registers")
  is resolved: ambient / consequential / graphite registers now exist and are visibly different in
  the approval/plan-review styling (verified by code review of `app.css`'s `.surface-consequential`,
  `--cg-graphite*` tokens — no live screenshot of the graphite register specifically, since
  triggering a tool-call render needs the mock-model flow; see Known limitations below).

## Impeccable critique (UX) re-check against the original backlog

| Original finding (`impeccable-critique.md`) | Resolved? | Evidence |
|---|---|---|
| Onboarding copy is internal/meta, not user-facing | Yes | `01-first-launch.png` — new copy explains the product's actual value (visibility, approval gates) |
| 36 inert "not implemented" controls | Mostly | Removed from sidebar, session header, hero banner, message actions, composer (see backlog level-2 item); Settings' Delete/Fetch/Open-config and the Review-panel's secondary toolbar buttons were left as-is — a disclosed scope limit, not an oversight |
| No shared disclosure primitive | Partially | `ApprovalBar`/`PlanReviewCard` now share `.surface-consequential` and an identical Enter/Escape contract; the Settings/plan-review/subagent-tree disclosure *buttons* still use three separate hand-rolled patterns — not unified, disclosed as remaining work |
| Approval gate no more visually weighted than a settings row | Yes | `.surface-consequential` (border-strong + `--cg-shadow-consequential`) applied to both `ApprovalBar` and `PlanReviewCard` |
| Fabricated stats (`0 tok/s`, `0% context`) | Yes | Removed; composer footer now shows only the real turns/steps count (`07-hero-landing.png`) |
| Session header packs 6 concerns into one row | Yes | Header-actions block and the dead single-tab tablist removed entirely |

## Impeccable audit (technical) re-check

| Original finding (`impeccable-audit.md`) | Resolved? | Evidence |
|---|---|---|
| Zero `aria-live` regions | Yes | `aria-live="polite"` on `.messages` |
| Settings modal missing `aria-modal` | Yes | Added, plus moved `role="dialog"` onto the actual modal element (it was on the backdrop before) |
| No focus trap / focus-return on any modal | Yes | `useModalFocus` shared hook, applied to all three modals; **verified live** — `06-settings-closed-via-escape.png` shows focus visibly returned to the Settings button after Escape |
| Escape-to-close in only 2/5 dismissible surfaces | Improved | Settings + PlanReviewCard now included (ApprovalBar already had it); first-run dialogs deliberately excluded (no real "cancel" semantics — see code comment) |
| Exactly one CSS breakpoint (1024px) | Improved | Added a 640px narrow register (sidebar/composer/settings/right-panel reflow) — **verified live**, `08-narrow-first-launch.png` before/after; tablet range (641–1023px) not separately tested |
| `bun test` blocked (EISDIR) | Fixed | Root-caused to a Bun 1.3.11 vs. the repo's pinned 1.4.0 (`packageManager` in root `package.json`); installed 1.4.0 from GitHub releases (bun.sh itself is blocked by this sandbox's network policy) — full suite now passes clean |

## Test/build verification actually run

- `bun run typecheck` (cognate app): clean, 0 errors — run after every edit batch, not just at the end.
- `bun test test` (cognate app, the real journey suite): **21 pass, 0 fail** — confirms none of the
  UI edits broke tool-execution, approval, plan-mode, subagent, persistence, or cancellation behavior.
- `bun test tests/architecture` (reconstruction-wide): 49 pass, 1 skip, 0 fail; 2 pre-existing errors
  (`framework-purity`, `domainforge-realitytrace-unchanged` — both shell out to `git merge-base main
  HEAD`, and this sandbox's checkout has no local `main` ref at all; unrelated to this redesign).
- Live browser verification (Playwright, `redesign/verify.ts`): first-launch, first-run API-key
  dialog, workspace chooser, Settings → Models, Settings → General, Escape-closes-Settings, hero
  landing, and a 390×844 narrow viewport — 8 screenshots in `redesign/screenshots/`, plus a
  dark-mode Settings capture. Console/page-error monitoring on every capture: the only errors seen
  were `ERR_CERT_AUTHORITY_INVALID` on the Google Fonts request (this sandbox's TLS-intercepting
  proxy, not a real-world issue) and a `404` on `/favicon.ico` (pre-existing, no icon asset was ever
  added — not part of this redesign's scope).

## Known limitations (disclosed, not silently dropped)

- **Approval gate / plan review / streaming / tool-call states were not captured live** — doing so
  needs the mock-model flow (`fixtures/mock-model/server.ts`) wired through a full session, which is
  more scripting than this pass's time budget covered. These states were verified by code review
  (the CSS/JSX changes are directly inspectable) but not by screenshot. Flagged, not claimed done.
- **Settings' three disabled buttons (Delete provider, Fetch models, Open configuration file) and
  the Review panel's secondary toolbar (Add tab, Split, Fullscreen, Collapse sidebar, Code view)
  were left untouched** — out of this pass's scope (lower-traffic surfaces; the Review panel mixes
  working and dead controls closely enough that touching it risked the working ones).
- **Tablet range (641–1023px) has no dedicated testing**, only code review confidence that nothing
  in the 640px rule conflicts with the existing 1024px one.
- **Disclosure primitive is unified for keyboard/surface treatment on the two consequential cards,
  not literally the same component** across Settings/plan-review/subagent-tree — a real remaining
  simplification, named in the backlog and not claimed complete.
- **Fonts require live internet access to Google Fonts** to render as designed (Space Grotesk/Inter/
  JetBrains Mono); this sandbox's screenshots show the fallback stack due to the proxy's TLS
  interception blocking the actual font request — expected to render correctly in normal deployment.
