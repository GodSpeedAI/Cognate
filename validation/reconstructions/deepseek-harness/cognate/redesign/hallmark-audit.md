# Hallmark structural audit — Cognate Console (pre-redesign baseline)

Read-only pass. No implementation changed while writing this. Scope: `src/ui/App.tsx` (2,309
lines), `src/ui/app.css` (2,046 lines), `src/ui/icons.tsx`. Evidence cites line numbers as of this
commit.

## Verdict

Not "AI slop" in the decorative sense (no gradients, no glassmorphism, no arbitrary glows — grep
confirms zero `gradient` hits in `app.css`, and only 5 `box-shadow` uses, all utilitarian). The
problem is different: this UI is a **structurally faithful clone of one specific third-party
product's composition**, not a generic-AI-template problem. Every finding below is "identical to
the DeepSeek Harness reference's shape" rather than "identical to every other AI SaaS demo," which
is the actual anti-goal now that parity is retired (`.agents/evidence/2026-09-27-deepseek-harness-
redesign-decision.md`).

## Findings

1. **Zero distinctive component voice.** Radius scale (`--cg-radius-xs/sm/md/lg/xl/panel` = 4/8/12/
   16/20/28px, `app.css:47-52`), the two-accent scheme (near-black `--cg-accent` for CTAs, blue
   `--cg-accent-interactive` for the composer/active-tab, `app.css:20-31`), and the lavender message
   bubble (`--cg-message-bubble-bg: #edf3fe`, `app.css:33`) were each chosen by sampling the
   reference's screenshots pixel-for-pixel (see the comments at those exact lines). None of it is a
   design decision made *for this product* — it's forensic reconstruction of someone else's decision.
2. **Generic system-font stack as the only typeface.** `--cg-font: -apple-system, BlinkMacSystemFont,
   "Segoe UI", Inter, Roboto, sans-serif` (`app.css:64`) — the default OS-UI fallback chain with Inter
   folded in as one option among many, used for every text role (brand, body, labels, buttons) with
   no distinct display/heading face and no numeric/mono type system beyond one generic mono stack for
   code (`app.css:1329` etc.). Nothing differentiates this product's voice from a dozen other chat
   UIs that also just take the system stack.
3. **The macro layout is the industry-default three-pane chat shell** (left session sidebar / center
   transcript+composer / conditional right panel, `App.tsx:2081-2304`) with no compositional idea of
   its own layered on top — same silhouette as every Claude/ChatGPT/Cursor-style product. This is not
   automatically wrong (it's a reasonable IA for this task), but it currently carries zero macro
   signature beyond the reference's exact sidebar widths (`SIDEBAR_MIN=264 SIDEBAR_MAX=420
   SIDEBAR_DEFAULT=280 SIDEBAR_COLLAPSED=56`, `app.css:5-6, 55-59`) and 1024px auto-collapse
   breakpoint, both copied from reference measurement rather than chosen.
4. **"Present but inert" controls read as dead UI, not restraint.** 36 call sites disable a control
   with `title={NOT_IMPLEMENTED}` (grep count, `App.tsx`): Settings' "Built-in plugins"/"Agent
   presets" nav items, the sidebar's Search/View-options/Add-workspace icons, session header's "Open
   in Files"/"More ways to open"/"…"/"Open right sidebar"/the "Trajectory" tab, per-message
   good/bad/branch/usage actions, the composer's stats footer that always renders `0`. These exist
   only because parity scoring needed matching DOM/accessible-names (`DEVIATIONS.md:6-10`). With
   parity retired, a UI covered in disabled buttons whose only content is "not implemented" is a
   direct hierarchy/trust problem, not a structural-identity one, but it compounds #3: it makes the
   generic chat-shell silhouette feel like an unfinished clone rather than a considered product.
5. **No macro rhythm or section identity beyond the reference's.** There is exactly one visual
   register throughout — flat surface, thin 1px border, one of six token radii, one of two accents —
   applied uniformly to sidebar rows, modals, cards, and the message stream alike. Nothing marks the
   chat transcript as a different kind of space than a settings form or an approval gate, even though
   product-principle #2 in `PRODUCT.md` explicitly wants approval gates to "read as consequential."
   Currently `ApprovalBar` (`App.tsx:1134-1172`) and a settings row use the identical card-and-border
   treatment.

## What Hallmark does *not* need to flag

- No repetitive card-grid/dashboard-tile pattern (this is a single-column chat surface, not a
  metrics dashboard) — the "card-grid sameness" anti-pattern doesn't apply here.
- No arbitrary rounded-rectangle-icon-above-heading pattern; icons (`icons.tsx`) are used inline and
  functionally (folder, chevron, plus), not as decoration.
- The token layer itself (CSS custom properties for color/radius/spacing) is a real foundation to
  build on, not something to discard — the problem is what values live in it and how uniformly
  they're applied, not that it exists.

## Decision this feeds (Phase 4)

The macro layout (3-pane chat shell) is functionally sound and matches Operate-mode conventions
(`PRODUCT.md` Positioning/Users) — it is not being thrown out. But the *visual system* (tokens,
type, the single flat register, the inert-control catalog) has no identity of its own and was never
designed as one; it was measured off a reference. That is a real structural-identity gap, not a
"leave it alone" case → **Hallmark redesign of the visual system is warranted**, scoped to tokens,
typography, the surface/elevation register, and resolving the inert-control catalog — not a
wholesale re-architecture of the IA, which already serves the product.
