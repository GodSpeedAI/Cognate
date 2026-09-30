# Design System — Cognate Copilot Reconstruction

Established by Hallmark structural redesign (2026-09-30), following a three-way
audit that returned **REDESIGN-REQUIRED**. This file is authoritative: all later
Impeccable refinement must conform to it.

- Product truth: [PRODUCT.md](./PRODUCT.md)
- Implementation: `cognate/src/ui/` — `app.css` holds every token and rule here.

---

## 1. Visual philosophy

**A precision instrument, not a dashboard.** The app is a bench where three agent
journeys are exercised and observed. It should feel like well-made laboratory
equipment: warm, quiet, legible under scrutiny, with nothing competing for
attention. Evidence is *presented*; it is never decorated.

The rejected direction is named explicitly so it does not creep back: dark
near-black canvases, neon cyan/indigo accents, glows, pulsing status dots,
gradient tiles, and a uniform grid of identical rounded cards. That is the
generic AI-dashboard fingerprint and it is not this product.

The distinctive move is a **warm paper ground with a deep pine accent**. The
surfaces are lit like a notebook on a desk, not like a terminal in a dark room.
Hue is reserved for *state*, never for decoration.

## 2. Macro-layout families

Two families only. Never add a third.

**A. Overview (default).** Masthead → journey nav → asymmetric three-region grid.
Chat occupies a full-height left column as running text (an *unboxed* surface);
the right column stacks the shared-state ledger above the capability readout.
Regions are separated by rules and spacing, never by boxes alone.

**B. Focused.** One journey, centred, `max-width: 68ch` for reading comfort, with
a wide variant for the state ledger.

Both families render the **same** `<JourneyFrame>` components. A journey never
changes identity, title or content between families — only the space around it.

## 3. Container grammar — differentiation is mandatory

The three journeys are different kinds of work and must not look alike. This is
the central structural rule of the system.

| Journey | Grammar | Rationale |
| --- | --- | --- |
| **01 Conversation** | **Transcript** — unboxed running text, role-labelled turns with a left rule on the user's own words, prior-session replies collapsed above the live turns, composer docked to the bottom of a full-height column. No card. | A conversation is a flow of text, not a widget. A box implies a bounded object. |
| **02 Frontend capability** | **Readout** — a labelled state line plus one applied value, on a sunken field. Recorded calls carry their own compact payload block. | A capability is a *fact about availability*, not content. |
| **03 Shared state** | **Ledger** — a bordered document with a revision header, hairline-separated rows tagged by origin, actions split into *Agent* and *You* groups, and a run-outcome line. | Mutable shared state is a versioned document; a CAS write needs visible provenance. |

Containers are earned by content type. Do not wrap a transcript in a card.

**Every journey must state its outcome in words.** A journey whose claim cannot be
observed from the surface has failed: J-C's headline promise is that the *next*
agent turn observes the user's edit, so the ledger always reports what the last
agent run actually read — not merely that a run happened.
## 4. Typography

Roles only. Two families plus one mono, no exceptions.

| Role | Family | Treatment |
| --- | --- | --- |
| Display / journey title | **Instrument Serif** 400 | Sentence case, `letter-spacing: -0.01em`, `line-height: 1.15`. Never uppercase. |
| UI, body, labels | **Instrument Sans** 400/500/600 | Sentence case. Labels are sentence case, never small-caps. |
| Identifiers, versions, code | **IBM Plex Mono** 400/500 | Used *only* for real identifiers — agent ids, versions, JSON, revision numbers. |

Scale is a fixed 6-step ramp: `--fs-xs` 0.75rem, `--fs-sm` 0.8125rem,
`--fs-base` 0.9375rem, `--fs-md` 1.0625rem, `--fs-lg` 1.375rem, `--fs-xl` 1.875rem.
Line heights: 1.15 display, 1.5 body, 1.45 dense.

Body measure caps at `68ch`; the ledger widens to `min(72ch, 100%)`.
Long identifiers use `overflow-wrap: anywhere` — never clipped, never truncated
without an accessible full value.

## 5. Colour usage

Anchor hue: **pine** (~165°), deliberately off the default cyan/indigo.
Ground is a warm off-white paper. Status hues are muted and must never be the
only signal — always paired with text or shape.

Semantic roles (light values; every pair verified ≥ 4.5:1):

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Page ground | `--bg-canvas` | `#faf8f4` | `#171917` |
| Raised surface | `--bg-surface` | `#ffffff` | `#1e211f` |
| Sunken field | `--bg-sunken` | `#f0ede6` | `#121413` |
| Primary text | `--ink` | `#1a1c1a` (16.2:1) | `#e8e6e0` (14.2:1) |
| Secondary text | `--ink-2` | `#4a4f4b` (7.9:1) | `#a8ada4` (7.7:1) |
| Muted text | `--ink-3` | `#63695f` (5.3:1) | `#8d938a` (5.6:1) |
| Accent / action | `--accent` | `#1f5f52` (7.0:1) | `#5fbf9f` (8.0:1) |
| Caution / running | `--caution` | `#8a5a00` (5.6:1) | `#e0a53d` (8.1:1) |
| Fault / failure | `--fault` | `#a63d2f` (6.0:1) | `#e8776a` (6.1:1) |
| Hairline | `--rule` | `#e2ded3` | `#333834` |

Rules:
- **Accent is reserved for the single primary action on a view.** Two accent
  buttons never appear in the same region.
- No gradients on text, buttons or backgrounds. No glows. No blurred glass.
- Status is never colour-alone: every state pairs its hue with a word, and the
  runtime indicator pairs its dot with a text label.

## 6. Spacing and rhythm

A single 4px-based scale: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16,
`--s-5` 24, `--s-6` 32, `--s-7` 48, `--s-8` 64. No off-scale values.

Regional rhythm: masthead `--s-4` / `--s-5`; nav `--s-2` / `--s-5`; between
journey regions `--s-6`; inside a frame `--s-5`; between control and its label
`--s-2`. Controls sit on a shared 36px baseline; touch targets are ≥ 44px on
coarse pointers via `@media (pointer: coarse)`.

## 7. Component voice

Square-ish by default. Radius is a *functional* signal, not a finish: `--r-1`
3px for controls and chips, `--r-2` 6px for sunken fields, `--r-3` 10px only for
overlay surfaces (popovers, toasts). Panels, ledgers and the transcript use
**square edges** — separated by rules. Not one rounded rectangle per element.

- **Buttons** — one primary (accent fill), secondary (outline), quiet (text).
  Square-ish, 1px border, visible `:focus-visible` ring at 2px offset.
- **Journey nav** — real tabs with `aria-current`, underline indicator, no pill
  container behind the group.
- **Disclosure** — a quiet text trigger with a rotating chevron; raw JSON never
  renders open by default.
- **State dot** — 7px, paired with a word. No pulse, no glow.
- **Empty / error / disabled states** — every surface defines all three, and a
  disabled control states its reason in visible text.
- **Outcome line** — a left-ruled chip summarising what the last action achieved
  ("Agent read 2 rows and saw your edit.").

## 7a. Themes

Two complete token sets, light (warm paper) and dark (warm charcoal), selected by
`[data-theme]` on `<html>`. The choice is seeded from `prefers-color-scheme` on
first load and persisted to `localStorage`; the token attribute is set before
first paint so the ground never flashes. Every text/background pair in both
themes meets 4.5:1 — contrast is verified composited, not assumed.

## 8. Navigation conventions

The nav is the only global navigation and lists journeys in fixed numeric order:
**01 Conversation · 02 Frontend capability · 03 Shared state**, plus **Overview**
as the default. Titles and one-line claims are identical in every family. A
numbered step (`01`) is the structural signature of this product and appears in
the nav, the journey heading and the ledger revision header.

## 9. Interaction conventions

- One primary action per view; secondary actions sit beside it, never above.
- Actions are grouped by *who acts* — **Agent** and **You** — with a hairline
  between groups, so an agent write is never confused with a user edit.
- Every committing action gives visible feedback: pending state on the control,
  settled state in the surface, and a non-blocking error note with a retry on
  failure.
- Nothing auto-focuses on view change except the primary action's own field.
- All copy is user-benefit language. Hook names, event names, agent ids, run ids
  and package identifiers live behind **"Under the hood"**.

## 10. Motion philosophy

Motion confirms cause and effect; it never entertains. Two moves only: a 120ms
opacity/transform transition on state change, and a 160ms disclosure height
reveal. `prefers-reduced-motion: reduce` removes both. No infinite animation of
any kind — the runtime indicator is a static dot with a text label.

## 11. Density

Comfortable by default, with a documented dense variant for data regions (the
ledger rows, run metadata): `--fs-sm` with `--s-2` vertical padding. Density is
never reduced below the point where a 44px touch target is lost on coarse input.

## 12. CTA hierarchy

1. The journey's own committing action — accent, one per view.
2. Supporting actions — outline.
3. Destructive or reverting actions — quiet, with `--fault` text only on confirm.
4. Disclosure triggers — quiet, smallest.

## 13. Responsive principles

Fluid first; breakpoints at `640px`, `900px`, `1280px` are corrections only.
- **Narrow (<900px)** — one column, journey nav wraps and scrolls horizontally
  with `scroll-snap`; never overflows the viewport.
- **Mid (900–1279px)** — two regions; chat full width above the stack.
- **Wide (≥1280px)** — asymmetric grid, chat column full height.
- Content reflows; nothing is clipped and nothing scrolls horizontally except
  deliberately scrollable regions (nav, code blocks, wide data rows).
- Survives 200% browser zoom and long-content expansion.

## 14. Accessibility rules (non-negotiable)

- Every text pair meets 4.5:1; focus is always visible with a 2px offset ring.
- Labelled regions use `aria-labelledby` pointing at a visible or
  visually-hidden label — **never `aria-label` on a text container**, which would
  replace the content for assistive technology.
- A skip link precedes navigation; landmarks are `header` / `nav` / `main` / `footer`.
- Heading order is `h1` (product, then journey) → `h2` → `h3`, never skipping.
- Live regions (`role="status"`, `aria-live="polite"`) announce settled state
  only, never every streaming token.
- State is never conveyed by colour alone.