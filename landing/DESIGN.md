---
name: Cognate Landing
description: "You steer the software." A technical-editorial landing page in the GodSpeed AI visual language, AI-Native register. Ivory and Prussian in light, an instrument panel in dark.
colors:
  prussian: "#003153"
  near-black: "#05070a"
  ivory: "#f7f3ea"
  gold: "#d7a84a"
  slate: "#566978"
  mist: "#e7ebee"
  allow: "#2f8f5b"
  escalate: "#c58a2a"
  deny: "#9e2f2f"
  unknown: "#7c8790"
  paper: "var(--ivory) light / var(--near-black) dark"
  ink: "var(--prussian) light / var(--ivory) dark"
  ink-2: "var(--slate) light / #a7b4bf dark"
  rule: "#b3bfc8 light / #33495a dark"
  signal: "var(--gold)"
  human-text: "#22774d light / #4cb47a dark"
  escalate-text: "#8a5c12 light / #e0a94a dark"
typography:
  display:
    fontFamily: "Josefin Sans Variable, Josefin Sans, system-ui, sans-serif"
    fontSize: "clamp(44px, 6.6vw, 88px)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "Josefin Sans Variable, Josefin Sans, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.2vw, 56px)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "0"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: "0"
  eyebrow:
    fontFamily: "Josefin Sans Variable, Josefin Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.3em"
  accent:
    fontFamily: "Josefin Slab, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  small: "4px"
  cartridge: "10px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "48px"
  space-8: "64px"
  space-9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.near-black}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  button-human:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.human-text}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  cartridge:
    backgroundColor: "part tint (Prussian steps)"
    textColor: "{colors.ink}"
    rounded: "{rounded.cartridge}"
    padding: "8px 10px"
  code-block:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.prussian}"
    rounded: "{rounded.small}"
    padding: "12px"
---

<!-- Regenerated for the GodSpeed visual language (D21). Source of truth: landing/src/styles/tokens.css, base.css, page.css, exploded.css. Dark values and shadows live in DESIGN.json. -->

# Design System: Cognate Landing

## 1. Overview

**Creative North Star: "Receipts Visible"**

The page is an authority manual for AI work. It is built from the GodSpeed AI visual language, AI-Native register: a dark cinematic hero, an exploded assembly drawing of a real Workbench capture as the one signature, and ivory editorial sections with Prussian type. The register is lighter, sharper and more contrastive than the enterprise register, and stays evidence-disciplined: every visible proof is a real capture or a drawing labelled as one.

The system is two-scheme. Light is an ivory field with Prussian type, gold micro-accents and slate and mist linework. Dark is an instrument panel: a near-black field, Prussian structure, ivory type, gold proof accents and thin gray-blue linework. The hero, the exploded-view stage and the footer are dark surfaces in both schemes, so the page is dark and light balanced.

**Key characteristics:**
- Ivory and near black grounds; Prussian carries identity; contrast carries hierarchy.
- Muted gold marks proof, selection and the primary action. It is never text on ivory.
- Allow green appears only where a person decides.
- Hairlines and flat surfaces. No gradients, glow, particles, or drop shadows (the mobile sheet lift is the one exception).
- Josefin Sans for display, IBM Plex Sans for reading, IBM Plex Mono for evidence.

## 2. Colors

Palette from the owner's visual language (Core Palette, Optional Utility Colors). Values are hex; derived steps are noted.

### Core
- **Prussian Blue** `#003153`: identity, light headings and body text, focus ring and selection outline on light.
- **Near Black** `#05070a`: dark ground, button label on gold.
- **Ivory** `#f7f3ea`: light ground; text on dark.
- **Muted Gold** `#d7a84a`: primary CTA fill, proof markers, selected tint, route traces and focus ring on dark.
- **Slate** `#566978`: secondary text and cartridge borders on light.
- **Mist** `#e7ebee`: inset grounds on light (code, demos, plates).

### Utility (demos and diagrams only)
- **Allow** `#2f8f5b`: approval strokes and fills. Text on light uses `#22774d`; text on dark uses `#4cb47a` (both derived to keep 4.5:1).
- **Deny** `#9e2f2f`: refused-by-policy text on light; `#d9776f` on dark.
- **Escalate** `#c58a2a` (text and state lines use `escalate-text`: `#8a5c12` on ivory and mist, 4.8:1 or better; `#e0a94a` on dark). Used for the refund demo's approval gate, the only place it appears. **Unknown** `#7c8790` is reserved for states the page does not show.
- **Routes**: the authority route (Beat C) is an orthogonal trace on the board in gold, from the selected part to the ledger row. It is solved once per part (`src/lib/route.ts`), never crosses a face, and is checked by `tests/route.test.ts`.

### Derived steps
- Hairline rule: `#b3bfc8` on light (a darker mist step; decorative); `#33495a` on dark.
- Dark inset ground: `#0b1a26`. Dark secondary text: `#a7b4bf`. Footer ground is Prussian, footer secondary text `#b7c4cd`.
- Cartridge fills: five Prussian tint steps. Light `oklch` L 97 / 92 / 88 / 94.5 / 86; dark L 22 / 27 / 33 / 25 / 38. Told apart by lightness and by the Plex Mono code on each face.

### Named rules
**The Gold Is Proof Rule.** Gold marks proof, selection, route and the primary action. It is never body text on ivory (1.98:1) and never a large wash.

**The Person Decides Rule.** Allow green appears only where a human approves, denies, accepts or authorizes. If nothing is being decided, it is not on the screen.

## 3. Typography

**Display:** Josefin Sans Variable (500). Hero headline, section headings, the stage caption, the transition line.
**Text:** IBM Plex Sans (400 body, 600 functional headings and buttons).
**Evidence:** IBM Plex Mono (400 for code and commands, 500 for diagram labels and cartridge numbers).
**Editorial accent:** Josefin Slab (400), used for the dialogue request, the pull line and the closing line only.

### Hierarchy
- **Display** (Josefin 500, `clamp(44px, 6.6vw, 88px)`, line-height 1.08, tracking 0): the H1 only.
- **Headline** (Josefin 500, `clamp(34px, 4.2vw, 56px)`, line-height 1.08): section H2s.
- **Title** (Plex Sans 600, 22px, tracking -0.01em): H3s and beat sub-heads.
- **Body** (Plex Sans 400, 18px / 28px desktop, 16px / 24px below 768px). Measure capped at 68ch.
- **Eyebrow and kicker** (Josefin 500, 14px, ALL CAPS, tracking 0.3em, Slate).
- **Label** (Plex Mono, 13px, tracking 0; diagram labels Medium with tracking 0.04em).

### Named rules
**The Measure Rule.** Running text stops at 68ch. Captures, the stage and code may be wide; prose is not.

**The Mono Is For Identifiers Rule.** Plex Mono sets part numbers, commands, code and status. It does not set running sentences.

## 4. Elevation

Flat. Surfaces sit on the ground; separation comes from tonal steps, 1px hairlines and the dashed notation of the drawing. The only shadow is the mobile inspector sheet lift, which overlays the parts list it describes.

## 5. Components

### Buttons
- **Shape:** 4px radius, 1px border, 8px 14px padding, Plex Sans 600 15px.
- **Primary:** gold fill, Near Black label. Used once per view (hero and start).
- **Default:** ground fill, ink text, 1px slate border.
- **Human:** ground fill, `human-text` label and Allow border. Decision controls only.
- **Focus:** 2px outline, 2px offset: Prussian on light, gold on dark.
- **Touch:** every button, wordmark, checkbox row and radio row is at least 44px tall.
- **Command blocks:** the Copy button sits in the block's own top bar (44px, top right); no Copy button on a row below.

### Cartridges (the signature part)
- **Labels at 768 to 1199px**: 12px number and name; long names break at a break opportunity (`wbr`) so they fit the narrower faces.
- **Shape:** 10px radius with a 6px connector notch on the top edge (desktop faces 4px radius, 1px border).
- **Colour:** a Prussian tint step with ink text. Dimmed parts drop to the ground.
- **Selected:** 2px Prussian outline on light, 2px gold on dark, over a 16% gold tint.
- **Labels:** Plex Mono 13px number on the face; name in Plex Sans 600 12 to 13px.

### Chips, stamps and status
- **Legend chip:** 4px radius, 1px slate border; category tint fill for "From Cognate"; dashed for "In development (branch)".
- **Status chip:** Plex Mono 13px, slate text, 1px mist border.
- **Stamps:** dashed rule when pending; solid slate when done; Allow when the final step is accepted.

### Captures
- The hero window shows the capture from the sidebar's rule to the right edge and from the top down to the table rule (cut between regions, never through a word).
- Bare images with a 1px rule border. Caption 13px slate below. "Real screen from Cognate-Workbench" or "Illustration". Cropped and scaled only.

### Navigation
- **Top bar:** sticky, ivory ground, 1px rule, wordmark in Josefin Sans with the socket-C mark (Prussian and gold on light; ivory and gold on dark).
- **Rail:** fixed right list of beats. Each link has its own ivory ground so it reads over dark bands. Current beat takes a gold rule and ink text.
- **Mobile:** nav links hide below 767px; the rail is hidden below 1100px.

### Exploded assembly (signature)
- **Stage:** dark instrument panel (`.theme-dark`), full-bleed. Oblique shelf projection; plates placed by one matrix each. Edges are 1.75px route traces (Prussian on light, gold on dark), dashed for consumers. Mating lines dashed.
- **Layout:** desktop 64/36 with the inspector at right; tablet stacks the inspector; below 768px a two-column parts list with no 3D.
- **Motion:** none in CSS. Every frame is a pure function of scroll. Reduced motion shows the final keyframe.

## 6. Do's and Don'ts

### Do
- Use gold for proof, selection, route and the one primary action.
- Use Allow only where a person decides.
- Keep the connector notch on cartridges and the dashed notation for sockets, the agent layer, the branch and mating lines.
- Caption every capture as real or as an illustration.
- Keep every animation tied to a state change, and collapse it under reduced motion.

### Don't
- Don't use gradients, glow, neon, particle fields or glass as decoration.
- Don't set gold as text on ivory.
- Don't use Decision green as a heading or decorative colour.
- Don't use glyph icons or emoji as signifiers. The proof marker is a gold square.
- Don't add drop shadows to cards or buttons.
- Don't claim "effortless", "magic" or "autonomous" as a selling point, or "done" without evidence.
