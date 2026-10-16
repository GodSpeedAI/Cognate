---
name: Cognate Landing
description: "You steer the software." A technical-editorial landing page drawn as an assembly drawing on warm drafting paper.
colors:
  paper: "oklch(97.2% 0.008 85)"
  paper-2: "oklch(94% 0.01 85)"
  ink: "oklch(22% 0.015 255)"
  ink-2: "oklch(42% 0.015 255)"
  rule: "oklch(82% 0.012 85)"
  signal: "oklch(54% 0.17 45)"
  human: "oklch(46% 0.11 165)"
  part-model: "oklch(92% 0.035 250)"
  part-act: "oklch(92% 0.035 200)"
  part-control: "oklch(92% 0.035 305)"
  part-work: "oklch(92% 0.035 90)"
  part-history: "oklch(92% 0.035 150)"
typography:
  display:
    fontFamily: "Newsreader Variable, Georgia, Times New Roman, serif"
    fontSize: "clamp(40px, 6vw, 76px)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "Newsreader Variable, Georgia, Times New Roman, serif"
    fontSize: "clamp(28px, 3.4vw, 42px)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Newsreader Variable, Georgia, Times New Roman, serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Martian Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.02em"
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
    backgroundColor: "{colors.signal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  button-human:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.human}"
    rounded: "{rounded.small}"
    padding: "8px 14px"
  cartridge:
    backgroundColor: "{colors.part-work}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cartridge}"
    padding: "8px 10px"
  code-block:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.small}"
    padding: "12px"
---

<!-- SCAN — extracted from landing/src/styles/{tokens,base,page,exploded}.css, src/components/*, src/pages/index.astro, brand/. Dark values and shadows live in DESIGN.json. -->

# Design System: Cognate Landing

## 1. Overview

**Creative North Star: "The Assembly Drawing"**

The page is a precise, annotated technical illustration printed on warm drafting paper. Its one dense moment is the exploded view: a real Workbench capture separates into layers, and capability cartridges stand on an oblique shelf with part numbers, leader lines and an inspector column. Everything around that moment is quiet: a single text column at 68ch, hairline rules between beats, generous vertical rhythm, and real captures shown bare with a caption. The reader should feel they are reading an instrument manual written by a careful peer, not a launch page.

The system is light-first. Paper is the ground; dark ("drawing on slate") is the same system inverted, switched on by `prefers-color-scheme: dark` or `[data-theme='dark']`. The system rejects the category's reflexes: purple or blue AI gradients, glowing brains, neural node clouds, particle fields, fake browser, terminal or IDE chrome, icon-over-heading three-card grids, hero metric tiles, and dark-first neon. As PRODUCT.md puts it, the product is about explicit structure, not mystique, and the visuals must say the same.

**Key Characteristics:**
- Warm paper ground with a cool graphite ink; contrast carries hierarchy, not color.
- One signal accent (drafting orange) marks the single thing to look at now.
- One human accent (decision green-teal) appears only where a person decides.
- Hairline rules (1px) and flat surfaces; depth is tonal, not shadowed.
- Newsreader for voice, Hanken Grotesk for text, Martian Mono for part numbers and commands.
- Cartridges and leader lines are the only illustrative vocabulary; no other iconography.

## 2. Colors

A restrained palette: two neutral grounds, one ink family, one signal, one human accent, and five pastel category fills used only inside the drawing.

### Primary
- **Drafting Orange** (`oklch(54% 0.17 45)`, brand mark `#ba4300`): the signal. Primary CTA fill (`.btn-primary`), focus outline (2px), active rail step and demo-result borders, selected cartridge border, the connector on the wordmark mark. Sized to stay under ten percent of any view.

### Secondary
- **Decision Green-Teal** (`oklch(46% 0.11 165)`): the human accent. Reserved for approvals, denials, acceptance, authorization and the person's hand in the story (`.btn-human`, `.gate-mark`, the accepted stamp, the success panel). It is not decorative; see The Person Decides Rule.

### Neutral
- **Warm Drafting Paper** (`oklch(97.2% 0.008 85)`): page ground, header, cartridges, dialog-free panels.
- **Inset Vellum** (`oklch(94% 0.01 85)`): inset panels, code ground, demo panels, the hero plate, the layer-3 plate.
- **Graphite Linework** (`oklch(22% 0.015 255)`): body text, headings, the 1px strokes of selected or active parts.
- **Pencil Grey** (`oklch(42% 0.015 255)`): secondary text, captions, borders of default buttons and cartridges, the layer tags.
- **Hairline Stone** (`oklch(82% 0.012 85)`): every 1px rule, section dividers, leader lines and plate borders at rest.

### Category fills
- **Pale Slate Blue** (`--part-model`), **Pale Teal Mist** (`--part-act`), **Pale Violet Mist** (`--part-control`), **Pale Straw** (`--part-work`), **Pale Sage** (`--part-history`): all at L 92%, C 0.035, one hue per capability category. They fill cartridges and the legend chips only.

### Named Rules
**The One Signal Rule.** Drafting Orange marks the one thing the reader should look at now. Its rarity is the point; in practice the build also spends it on link underlines, which is recorded as drift in the report, not as a licence.

**The Person Decides Rule.** Decision Green-Teal appears only where a human approves, denies, accepts or authorizes an extension. If nothing is being decided, it is not on the screen.

## 3. Typography

**Display Font:** Newsreader Variable (with Georgia, Times New Roman, serif)
**Body Font:** Hanken Grotesk Variable (with system-ui, sans-serif)
**Label/Mono Font:** Martian Mono Variable (with ui-monospace, monospace), used for code, commands, part numbers, the status chip

**Character:** A roman editorial serif speaks in headlines and beat titles; a neutral grotesk does the explaining; a small mono sets the identifiers. The pairing reads as a manual with magazine headlines, not as a product UI.

### Hierarchy
- **Display** (500, `clamp(40px, 6vw, 76px)`, line-height 1.15): the H1 only. Hero headline, max 18ch.
- **Headline** (500, `clamp(28px, 3.4vw, 42px)`, line-height 1.15): section H2s, one per beat.
- **Title** (500, 24px, line-height 1.15): H3s and beat sub-heads (e.g. "Finishing is not the same as accepting.").
- **Body** (400, 18px desktop / 17px below 768px, line-height 1.6): running text, measure capped at 68ch on paragraphs and beat children. Lead paragraph `.sub` is 20px; `.footline` and `.transition` are 17px and 26px.
- **Display-italic accents** (Newsreader, 22–26px): the dialogue request, `.distinction`, `.closing`, the sequence caption. Used sparingly, one per beat at most.
- **Label** (Martian Mono 400, 12px, letter-spacing 0.02em): part numbers, status chip, `.mono` annotation numbers, cartridge numbers, code. Callout labels set in Hanken at 12–13px. Text is never uppercased in the build.

### Named Rules
**The Measure Rule.** Running text stops at 68ch. Wide things (captures, the stage, code) are allowed to be wide; prose is not.

**The Mono Is For Identifiers Rule.** Martian Mono sets part numbers, commands, code and status. It does not set running sentences.

## 4. Elevation

The system is flat. Surfaces sit at rest on the paper ground; separation comes from tonal steps (paper, paper-2), 1px hairlines in Hairline Stone, and the dashed notation of the drawing (sockets, agent layer, branch). There are no shadows in the desktop layout. One shadow exists: the mobile inspector sheet, which lifts over the parts list it describes.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 -4px 16px oklch(0% 0 0 / 0.12)`): mobile inspector bottom sheet only (below 768px). It is the single shadow in the build.

### Named Rules
**The Flat Paper Rule.** Surfaces are flat at rest. Depth is a tonal step or a hairline, never a drop shadow. A shadow is allowed only where a surface overlays content it describes.

**The Hairline Rule.** Structure is drawn with 1px lines in Hairline Stone. Selected or active items take a 2px Drafting Orange or Graphite stroke, not a glow.

## 5. Components

### Buttons
- **Shape:** 4px radius (`--radius-small`), 1px border, 8px 14px padding, 15px text, no hover treatment in the build.
- **Primary:** Drafting Orange fill with Warm Drafting Paper text, orange border. Used once per view, on the hero and the start CTA.
- **Default / Secondary:** Warm Drafting Paper fill, Graphite text, 1px Pencil Grey border.
- **Human:** Paper fill, Decision Green-Teal text and border. Only on decision controls.
- **Quiet:** transparent border, Pencil Grey text, underlined. For tertiary actions.
- **Disabled:** 50% opacity, default cursor.
- **Focus:** global `:focus-visible` outline, 2px Drafting Orange, 2px offset. Hover and active states are not defined anywhere in the build; do not invent them without a reason that serves a state change.

### Cartridges (the signature part)
- **Shape:** 10px radius with a single 6px connector notch centred on the top edge (desktop faces use 4px radius and a 1px Graphite border).
- **Color:** the category fill (`--part-*`) with Graphite text. Dimmed parts drop to Paper.
- **States:** selected = 2px Drafting Orange border with a 14% orange tint of Paper; pressed (mobile) = 2px orange border.
- **Labels:** part number in Martian Mono 12px (`C-07` style), name in Hanken 600 12–13px, set upright on the front face.

### Chips and Status
- **Legend chip:** 4px radius, 1px Pencil Grey border, 2px 8px padding, 13px. Filled with a category fill for "From Cognate"; dashed for "In development (branch)".
- **Status chip:** Martian Mono 12px, Pencil Grey text, 1px Hairline Stone border, 4px radius.
- **Stamps:** dashed Hairline Stone border when pending; solid Pencil Grey when done; Decision Green-Teal when the final step is accepted.

### Cards / Containers
- **Corner Style:** 4px radius; square at the page level.
- **Background:** Paper for panels; Paper-2 for demos, code and the hero plate.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Hairline Stone on demos, captures and code; 2px left rule for the dialogue and onboarding steps.
- **Internal Padding:** 24px for demos and the dialogue; 12px for code and captions; 16px for the success panel.

### Captures
- **Shape:** bare images with a 1px Hairline Stone border, no frame chrome.
- **Caption:** 13px Pencil Grey below the image. Real screens read "Real screen from Cognate-Workbench"; drawings read "Illustration".
- **Crop:** cropped and scaled only; no retouching of content, color or labels.

### Inputs / Fields
- **Style:** the build has radio-group fieldsets (`.demo-controls`, `.path`) with 15px labels; no text inputs are styled as a system.
- **Focus:** global `:focus-visible` outline.

### Navigation
- **Top bar:** sticky, Paper ground, 1px bottom rule, padding 12px 24px. Wordmark in Newsreader 22px with the socket-C mark at 24px. Links 15px Graphite. Status chip at the right.
- **Rail:** fixed right-hand list of beats at 12px Pencil Grey, 2px left rule; the current step takes Graphite text, a 2px Drafting Orange rule and weight 600. Hidden below 1100px.
- **Mobile:** nav links hide below 767px; the rail is hidden; the wordmark remains.

### Exploded Assembly (signature)
- **Stage:** an oblique shelf projection on a Paper ground, plates placed by one matrix each, layer 1 a real capture, layer 2 a dashed transparent agent layer, layer 3 Paper-2. Edges are 1.75px orthogonal Drafting Orange traces (dashed for consumers) over a dashed Hairline mating line.
- **Layout:** desktop splits 64/36 with the inspector at right; tablet stacks the inspector under the stage; below 768px the drawing becomes a two-column parts list with no 3D.
- **Motion:** no CSS transitions. Every frame is a pure function of scroll. Reduced motion collapses durations to 0ms and shows the final keyframe with the numbered legend.

## 6. Do's and Don'ts

### Do:
- **Do** set running text at 18px / 1.6 on desktop, 17px below 768px, with a 68ch measure.
- **Do** use Drafting Orange for at most one thing per view: the next action or the thing to check.
- **Do** reserve Decision Green-Teal for approvals, denials, acceptance and authorization, and nothing else.
- **Do** separate beats with a 1px Hairline Stone top rule and 96px / 64px vertical padding.
- **Do** caption every capture as real or as an illustration, and keep the caption under the image.
- **Do** keep the exploded view's cartridges in the category fills, with the part number on the front face.
- **Do** keep dashed lines for sockets, the agent layer, the branch and mating lines; they are the drawing's notation.
- **Do** keep the connector notch on cartridges; it is the drawing's signature device.
- **Do** keep every animation tied to a relationship or state change, and collapse it under reduced motion.

### Don't:
- **Don't** use purple or blue AI gradients, glowing brains, neural node clouds or particle fields. (PRODUCT.md anti-references: "Purple/blue AI gradients, glowing brains, neural node clouds, particle fields.")
- **Don't** build fake browser, terminal or IDE chrome around screens. Real captures only, captioned as real.
- **Don't** make icon-over-heading three-card feature grids, hero metric tiles or benchmark numbers.
- **Don't** go dark-first or neon-on-black; light paper is primary.
- **Don't** borrow Cognate-Workbench's cockpit styling (its cobalt accent, Inter, Space Grotesk or JetBrains Mono) outside its captures.
- **Don't** set type in Inter, Space Grotesk, Fraunces, IBM Plex Mono, Instrument Sans or Instrument Serif.
- **Don't** add decorative motion. "Every animation reveals a relationship or a state change."
- **Don't** use Decision Green-Teal as a decorative accent or a heading color.
- **Don't** add kicker or eyebrow labels above headings. The current ones are a defect the build carries, not a pattern to copy.
- **Don't** use glyph icons or emoji as UI signifiers. The `⚡` marker in the build is a defect, not a pattern.
- **Don't** add drop shadows to cards or buttons. The sheet lift is the single exception.
- **Don't** claim "effortless", "magic", "autonomous" as a selling point, or "done" without evidence. (PRODUCT.md refuse list.)
