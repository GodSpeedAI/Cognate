# 02 Brand alignment: GodSpeed visual language

Scope: tokens, type, colour roles, surfaces, hero treatment, exploded-view recolour, OG card, favicon, notices. No copy, claims, sections, structure or behaviour changed. Authority: `godspeed-growth/brand/visual/visual-language.md` (supersedes `actualize/artifacts/direction/creative-direction.md`, see D21).

Preflight: `load-context.mjs` is not installed in this project, so context was read directly from `landing/PRODUCT.md` and `landing/DESIGN.md`. Product check: pass. Shape gate: not required (brand alignment, not `craft`).

## Changes

| Area | Before | After |
|---|---|---|
| Ground | Warm drafting paper, dark only as a derived mode | Ivory `#F7F3EA` (light). Near Black `#05070A` (dark). Hero, exploded stage and footer are dark surfaces in both schemes (`.theme-dark`, `.theme-prussian` scopes) |
| Ink | Graphite | Prussian `#003153` (light headings and text); Ivory (dark) |
| Secondary | Pencil grey | Slate `#566978` (light); lifted slate `#A7B4BF` (dark) |
| Rules | Hairline stone | Darker mist step `#B3BFC8` (light, decorative); `#33495A` (dark) |
| Signal | Drafting orange, text links, focus | Muted gold `#D7A84A`: primary CTA fill (with Near Black text), proof markers, selected tint, route traces (dark). Never text on ivory |
| Selection / route | Orange | Prussian outline and traces (light); gold (dark) |
| Human | Teal-green `oklch(46% 0.11 165)` | Allow `#2F8F5B` for strokes and fills; text-safe `#22774D` on light; lifted `#4CB47A` on dark |
| Deny | none in tokens | Deny `#9E2F2F` text on light; lifted `#D9776F` on dark (refused permission demo) |
| Cartridge fills | Pale slate, teal, violet, straw, sage | Five Prussian tint steps (light L 86 to 97; dark L 22 to 38), told apart with Plex Mono codes |
| Display | Newsreader 500 | Josefin Sans 500, tracking 0, line-height 1.08 (h1 44 to 88px, h2 34 to 56px) |
| Functional heads | Newsreader | IBM Plex Sans 600, 22px (h3) |
| Body | Hanken 18/1.6 | IBM Plex Sans 18/28 desktop, 16/24 below 768px |
| Eyebrows / kickers | Martian Mono 12px, no caps | Josefin Sans 500, ALL CAPS, tracking 0.3em |
| Mono | Martian Mono | IBM Plex Mono 400 (13px evidence), 500 for diagram labels, tracking 0 to 0.04em |
| Editorial accent | Newsreader italic | Josefin Slab (dialogue request, `.distinction`, `.closing`), not italic |
| Decision line | Green pull quote | Ink pull quote with gold rule (green is for decisions only) |
| Proof glyph | Lightning emoji in text | Gold 8px square marker (same text, aria-hidden) |
| Shadows | Sheet lift only | Unchanged (sheet lift only) |
| OG card | Light keyframe, light lockup | Dark field `#05070A`, reversed lockup (`brand/cognate-lockup-reversed.svg`), Josefin headline, dark keyframe |
| Favicon | Regenerated 32px PNG from `favicon.svg` (same mark) | Regenerated |
| Fonts shipped | Newsreader, Hanken Grotesk, Martian Mono (variable) | Josefin Sans (variable), IBM Plex Sans 400/600, IBM Plex Mono 400/500, Josefin Slab 400 |
| Notices | 3 families | 4 OFL families. `scripts/notices.ts` lists them. `tests/notices.test.ts` asserts the list equals the `Base.astro` imports. `PROVENANCE.md` updated |
| Dependencies | three retired `@fontsource-variable/*` | Removed (`bun remove`) |

Structural changes: none. Two layout-adjacent styling changes were needed to make the dark surfaces work: the hero and stage are full-bleed bands (same gutter formula as `main`), and each rail link carries its own ivory ground so it stays legible over the dark hero. The rail is otherwise unchanged.

## Contrast

Computed from the built page (every visible text group, walking to its nearest opaque background, at 1440 and 375, both schemes): 0 groups below 4.5:1 in any of the four combinations (69, 73, 57, 58 groups).

Token pairs, WCAG 2.x:

| Pair | Ratio | Use | Requirement |
|---|---|---|---|
| Prussian on Ivory | 12.12 | light text, headings | 4.5 text |
| Slate on Ivory | 5.14 | secondary text, cartridge borders | 4.5 text, 3 UI |
| Slate on Mist | 4.75 | secondary text on inset | 4.5 text |
| Prussian on Mist | 11.20 | code, demos | 4.5 text |
| Near Black on Gold | 9.21 | primary CTA label | 4.5 text |
| Allow text `#22774D` on Ivory | 4.97 | `Approve`, stamps (light) | 4.5 text |
| Allow text `#22774D` on Mist | 4.59 | gate text in demos (light) | 4.5 text |
| Deny `#9E2F2F` on Ivory | 6.54 | refused-by-policy line | 4.5 text |
| Prussian on part tints (L 86 to 97) | 5.35 to 8.22 | cartridge labels | 4.5 text |
| Ivory on Near Black | 18.21 | dark text | 4.5 text |
| Lifted slate `#A7B4BF` on Near Black | 9.53 | dark secondary | 4.5 text |
| Lifted slate on `#0B1A26` | 8.34 | dark secondary on inset | 4.5 text |
| Gold on Near Black | 9.21 | dark proof, selection | 3 UI |
| Lifted Allow `#4CB47A` on Near Black | 7.80 | dark decision text | 4.5 text |
| Lifted Allow on `#0B1A26` | 6.82 | dark decision text on inset | 4.5 text |
| Lifted Deny `#D9776F` on Near Black | 6.55 | dark refusal | 4.5 text |
| Ivory on Prussian `#003153` | 12.12 | footer | 4.5 text |
| Slate-lift `#B7C4CD` on Prussian | 7.54 | footer secondary | 4.5 text |
| Prussian focus ring on Ivory | 12.12 | `:focus-visible` (light) | 3 UI |
| Gold focus ring on Near Black | 9.21 | `:focus-visible` (dark) | 3 UI |
| Gold on Ivory | 1.98 | not used as text or as a control edge | (n/a) |
| Allow `#2F8F5B` on Ivory | 3.65 | stroke only | 3 UI |
| Hairline `#B3BFC8` on Ivory | 1.69 | decorative section rule only | exempt (decorative) |
| Mist `#E7EBEE` on Ivory | 1.08 | fills only (not used as a line) | (n/a) |

Deviations from the brand's exact values, each forced by contrast: light decision text uses `#22774D` (the brand Allow `#2F8F5B` is 3.65:1 on ivory); dark decision uses `#4CB47A`; dark secondary text is a lifted slate (`#566978` is 2.7:1 on near black); hairlines use a mist step darker than Mist because Mist vanishes on ivory. Gold is never text on a light ground.

## Visual Voice Check (doc's 10 questions), Beat C, Beat F, hero, start, 1440 and 375

Screenshots (scratchpad, not committed): `/tmp/claude-1000/x/shots/{light,dark}-{1440,375}-{hero,beatC-stage,beatF,start}.png`.

1. Firm that engineers operational infrastructure? Yes. Prussian structure, plate and cartridge drawing, Plex Mono identifiers.
2. Trust before reading? Mostly. The dark hero reads as a serious field; the gold CTA is the one warm point.
3. AI work governable and inspectable? Yes. The approval gate in Beat F, the permission refusal and the exploded layers show it.
4. Anything unchanged from a generic AI startup site? Partly: the Josefin hero headline on a dark band and a gold primary button are common launch-page moves. Left for the layout and bolder passes; no structure changed here.
5. Anything on the banned list? No gradients, glow, particles, neon, emoji glyph (replaced by a square marker), or glass. Shadow remains only the mobile sheet lift.
6. Holds in the enterprise register? Yes for the ivory sections; the dark hero is the cinematic register by brief.
7. Gold behaves as proof or authority? Partly. Proof markers, selection and route traces are correct. The primary CTA fill is an action colour, which the brief allows for the primary button only; flagged for the polish pass.
8. Image implies governed AI, not physical infrastructure? Yes. Only real Workbench captures and the drawing.
9. Clarifies the mechanism? Yes. Beat C is the mechanism; colour now marks selection and route, not decoration.
10. Would an enterprise buyer trust it? Likely. Real evidence, no fake chrome, the decision colour used only at decisions.

Result: no failing answer to 4 or 5 that is not flagged. Q4 and Q7 are partial and are open for the later passes.

## Gates

- `bun run check`: 0 errors, 0 warnings, 0 hints.
- `bun run build`: pass; notices write 4 OFL files.
- `bun run test`: 24 pass.
- `bun run verify:sources`: PASS (19 excerpts, 16 edges).
- `bun run test:e2e`: 25 pass (axe clean on `/`, `/keyframe/`, exploded view, at 375 and 1440).
- Horizontal overflow: 0 px at 1440, 375 (Playwright).

## Open issues

- Q4 and Q7 partials above (CTA fill; hero headline convention).
- The `⚡` span remains in the markup (copy unchanged) and renders as a gold square. A later pass can remove the span.
- Lazy captures (for example the accepted screen in Beat F) appear empty in element screenshots that do not scroll them into view. Not a design defect; verify in the layout pass.
- A React hydration warning about an inline `caret-color` style on Onboarding checkboxes appears in the console. Not checked against the pre-change build.
- `dist/` and `public/` are rebuilt. `og.png` and `favicon-32.png` are regenerated. Nothing committed.
