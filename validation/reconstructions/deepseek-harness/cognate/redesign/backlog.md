# Synthesized redesign backlog — Cognate Console

Merges `hallmark-audit.md`, `impeccable-critique.md`, `impeccable-audit.md`. Deduplicated;
classified into the user's 10 dependency levels. Fix lower levels before higher ones — nothing in
level 8+ should be touched while an item below it is still open.

## 1. Product comprehension / information architecture
- The durability guarantee (SQLite-backed continuations survive a restart) is this product's named
  differentiator (`PRODUCT.md` Positioning) but is completely invisible in the UI. *(critique)*
- Onboarding copy talks about the product in internal/meta terms ("Cognate's core capabilities...
  evolving rapidly") instead of what it does for the user. *(critique)*
- First run has no path back to "what is this" once dismissed. *(critique)*

## 2. Structural composition
- Visual system (tokens, type, one flat surface register) has no identity of its own — it's a
  forensic reconstruction of the reference's choices, not a decision made for this product.
  *(hallmark)* → **this is the Hallmark redesign's mandate** (Phase 4).
- 36 controls exist only as disabled "not implemented" placeholders (Settings nav items, sidebar
  icons, header actions, message actions, composer dropdowns/stats). *(hallmark + critique + audit,
  triple-flagged — highest-priority single item in this backlog)*
- Two structurally identical "waiting on you" card types (`ApprovalBar`, `PlanReviewCard`) with no
  shared primitive, different keyboard contracts. *(critique)*
- Right-hand panel has two occupants (review / subagent transcript) with no tab/switch affordance —
  one silently evicts the other. *(critique)*

## 3. Layout and spatial hierarchy
- Approval gate carries no more visual weight than a settings row, despite being the product's most
  consequential moment. *(critique)*
- Session header packs 6 unrelated concerns into one undifferentiated row. *(critique)*
- Composer stats footer sits at equal visual weight to the message input despite being partly
  placeholder data. *(critique)*
- Exactly one CSS breakpoint (1024px sidebar collapse) — no tablet/narrow-desktop/mobile layout
  exists. *(audit — feeds Phase 7 `adapt`, not fixed here)*

## 4. Typography
- Generic system-font fallback stack used for every role (brand, body, labels, code) — no
  distinct voice, no numeric/data typography. *(hallmark)*

## 5. Component and interaction consistency
- No shared disclosure primitive — Settings' "Customized settings," plan review's "View full plan,"
  and the subagent tree each invent their own reveal pattern. *(critique)*
- Failure state (`FailureBlock`) and a normal completed turn read at the same typographic/surface
  weight. *(critique)*
- Two different "not implemented" idioms (tooltip vs. bare `disabled`). *(audit)*
- Single-file 2,309-line `App.tsx` / 2,046-line `app.css` with no component decomposition —
  structural precondition for consistent primitives, not optional cleanup. *(product exploration)*

## 6. Responsive adaptation
- (Deferred to Phase 7 by design — captured here only so it isn't lost: no tablet/mobile layout,
  fixed-pixel chat-column width, untested narrow-viewport behavior for composer/modals/right panel.)

## 7. Accessibility and resilience
- Zero `aria-live` regions anywhere — streaming text, tool status, approval/plan cards appearing are
  all silent to screen readers. *(audit — highest-severity a11y finding)*
- Settings modal missing `aria-modal="true"` (first-run dialogs have it, Settings doesn't).
  *(audit)*
- No focus trap or focus-return on any modal. *(audit)*
- Escape-to-close implemented in only 2 of 5 dismissable surfaces. *(audit)*
- No visible loading state anywhere (`busy` only disables buttons). *(critique + audit, same
  finding from two angles)*
- Error surfacing is one undifferentiated pattern for validation vs. failure vs. exception.
  *(audit)*
- Untested: large session/model lists, long/short labels, permission-denied, disabled-state
  completeness. *(deferred to Phase 7 `harden`)*

## 8. Visual refinement
- Two-accent scheme (near-black CTA / blue interactive) and lavender message bubble were sampled
  from reference screenshots, not designed. *(hallmark)*
- Radius scale (4/8/12/16/20/28) copied from the reference's own documented scale. *(hallmark)*
- No distinction between "this is a different kind of space" (chat vs. settings vs. approval) —
  one visual register throughout. *(hallmark + critique)*

## 9. Micro-interactions and delight
- Retry disclosure defaults collapsed with no urgency cue even mid-retry. *(critique)*
- Not otherwise assessed yet — nothing here should be touched before levels 1-8 are resolved.

## 10. Final polish
- Not assessed yet — reserved for Phase 8, after everything above is stable.

## Explicitly out of scope for this backlog
- The 3-pane IA itself (sidebar / transcript+composer / right panel) is sound for an Operate-mode
  tool and is not being replaced — only its visual system and the inert-control catalog are.
- Behavioral/logic changes to the agent loop, approval gate, plan mode, or subagent delegation — this
  is a UI/UX redesign, not a feature change. Copy changes are in scope (per the operator's decision);
  wire-level behavior is not.
