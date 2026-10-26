built_from: model@7
reads: [form, constraints, claims, decisions]
cites: []

# Fidelity QA — Cognate landing (measured at f0016bc; fixes re-verified after)

Method: Chromium measurement script `actualize/evidence/fidelity-qa/measure/measure.ts` at 320/375/768/1024/1440 (light), 1440 dark, the exploded hold (unit 84), DPR 2 at 1440 and 375; raw data in `measure/results.json`.

| check | method | result at f0016bc | after fixes |
|---|---|---|---|
| 1 Tokens | :root vs direction spec; computed colours vs tokens | 7/7 spec tokens match; 3 off-token sources | `.mini-reused` now `--paper-2`; face tints are `color-mix` of tokens (allowed); native `input` #000 has no text (n/a) |
| 2 Fonts | document.fonts; computed first family | 3/3 families loaded; `code` fell back to UA monospace | `code` → `--font-mono` |
| 3 Contrast | WCAG per text node | light 0/~1,600 fail; dark 1 fail (`.mini-reused`) | fixed with the token fill |
| 4 Min size | computed < 12px | 2 selectors at 11px | raised to 12px |
| 5 Overflow | scrollWidth, clipped text | no horizontal overflow; 1 capture figure clipped by 2px; visually-hidden h2 intentional | 2px figure crop accepted (border rounding) |
| 6 Density | naturalWidth ≥ CSS width × DPR | 375: pass. 1440 DPR2: 2/8 under (e2e-03, e2e-08 are 1440px native) | **waived (D17)**: real captures are 1440px native and rule R8 forbids upscaling |
| 7 Placeholders | dist HTML scan | 0 hits | — |

Type scale deviation: the build uses a practical UI scale (12, 13, 14, 15, 17, 18, 20, 22, 26, plus a display clamp) rather than a strict 1.333 ratio for UI text. **Waived (D17)**: it is the direction's hierarchy expressed in practical steps; the headline/body ratio stays ≥1.333 and the 12px floor is respected.

Re-verification after fixes: `bun run check` 0, `bun run build` 0, `bun run test` (incl. projection) pass, `bun run test:e2e` 25/25 pass (24.0s).
