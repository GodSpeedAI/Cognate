built_from: model@7
reads: [purpose, actors, form, voice, positioning, claims, decisions]
cites: [C5, C6, C10, C41]

# Creative direction — Cognate

## Premise
Cognate assembles applications from **named parts that fit together by contract** [C5] [C6]. The visual world is the **assembly drawing**: the kind of precise, annotated, exploded technical illustration found in a good instrument manual. That world is rational, calm and legible. It shows how a thing is put together so you could take it apart yourself. It is the opposite of the category's glowing-network mysticism.

**Use sentence (this decides light vs dark).** A curious, intelligent person reads it on a laptop or phone, in daylight or office light, trying to understand what this is before deciding whether to trust an AI with building their software. That reader needs paper, not a void. **Light is primary.** Dark mode exists and is derived from the same system ("drawing on slate"). It is not the default.

## Four axes
| Axis | Choice | Excluded neighbours |
|---|---|---|
| Tone register | Technical-editorial (instrument manual × long-form magazine) | Provocative/hype; corporate SaaS |
| Density | Restrained with one dense moment (the exploded view) | Maximalist feature walls |
| Stance | Peer-guide: "here is how it's put together" | Authority/oracle; cheerleader |
| Sensory ambition | Considered, with one resonant signature (the reveal) | Effects everywhere |

## Signature (the one place the system spends its distinctiveness)
**The exploded assembly drawing.** The real Workbench capture [C41] lifts off and separates into layers in perspective. Capability **cartridges** emerge, each with a part number, connected by thin **leader lines** to labelled callouts. Everything else on the page stays quiet: type, rules, white space and real captures.

## Exclusions (each one a reflex in this category)
- X1 No purple/blue AI gradients, glowing brains, neural-network node clouds or particle fields. These are category reflexes, and the product is about explicit structure, not mystique [C5].
- X2 No fake browser, terminal or IDE chrome. Real captures appear as bare images with a caption that says what they are [C41]. Commands appear in plain code blocks with a copy button.
- X3 No icon-over-heading three-card feature grids, hero metric tiles or benchmark numbers.
- X4 No dark-mode-first neon-on-black "developer" look. Light paper is primary (see the use sentence).
- X5 No Workbench cockpit styling. Workbench's cobalt accent and its Inter/Space Grotesk/JetBrains Mono stack are reserved for its captures only. Product Actualizer's teal and Atkinson are excluded too.
- X6 No typefaces from the GodSpeed reflex-reject list (Inter, Space Grotesk, Fraunces, IBM Plex Mono, Instrument Sans/Serif).
- X7 No decorative motion. Every animation must reveal a relationship or a state change, or it is removed.

## Tokens
**Colour (oklch; restrained commitment, with one signal accent and one "human" accent)**
| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | oklch(97.2% 0.008 85) | oklch(19% 0.012 250) | Page ground, warm drafting paper / slate |
| `--paper-2` | oklch(94% 0.010 85) | oklch(23% 0.014 250) | Inset panels, code ground |
| `--ink` | oklch(22% 0.015 255) | oklch(93% 0.010 85) | Text, linework |
| `--ink-2` | oklch(42% 0.015 255) | oklch(76% 0.012 85) | Secondary text, captions |
| `--rule` | oklch(82% 0.012 85) | oklch(36% 0.014 250) | Hairlines, grid, leader lines at rest |
| `--signal` | oklch(54% 0.17 45) (was 58%; darkened for 4.5:1, D17) | oklch(72% 0.15 50) | "Drafting orange": selection, the active part, primary CTA. ≤10% of any view |
| `--human` | oklch(46% 0.11 165) (was 52%; darkened for 4.5:1, D17) | oklch(74% 0.10 165) | "Human decision" green-teal: approvals, acceptance, the person's hand in the story. Used only where a human decides [C10] |
| `--part-model` … `--part-history` | ink-tinted pastels at L 90–93%, C 0.03–0.04, distinct hues | L 32–36% | Cartridge body fills, one hue family per capability category |

Contrast is computed in evidence/direction/contrast.md during the build, and every text pair must be ≥4.5:1.

**Type (two families plus mono for code; none on the reject lists)**
- Display/editorial: **Newsreader** (variable, OFL), roman, optical sizes. Used for headlines and beat titles.
- Text/UI: **Hanken Grotesk** (variable, OFL). Used for body, labels and callouts.
- Mono (code, part numbers, commands): **Martian Mono** (variable, OFL), set small.
- Scale: 1.333 ratio. Body 18px/1.6 desktop, 17px mobile. Measure ≤68ch. Headline clamp 40→76px. Callout labels 12–13px Hanken, +0.02em tracking, uppercase only for part numbers.

**Space and shape**
- 8px base scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192).
- Radius: cartridges 10px with a single 6px connector notch. Everything else 4px or square. No pills.
- Lines: 1px hairlines in `--rule`. Leader lines are 1.25px and end in a 3px dot; when active they turn `--signal`.
- Grid: 12 columns, 1200px max text frame, full-bleed stage for the exploded view.

## Rules (cited by briefs)
- R1 One accent per view. `--signal` marks the single thing the reader should look at now.
- R2 `--human` appears only where a person decides (approve, deny, accept, authorize an extension).
- R3 Real vs illustrated. Real captures are photographic, unretouched and captioned "Real screen from Cognate-Workbench". Conceptual drawings use linework and cartridges, carry the caption "Illustration", and never show fake UI.
- R4 Part numbers. Each cartridge has a stable designation (e.g. `C-07 APPROVALS`) used in the drawing, the inspector and the text alternative.
- R5 Motion character. Mechanical and damped. Parts move along straight axes (translate in Z/Y). They never spin or bounce. Easing is `power2.inOut` for scrubbed motion and 160–240ms `ease-out` for UI response.
- R6 The reduced-motion and no-JS reader gets the final keyframe as a static annotated drawing plus a numbered text legend. No information is lost.
- R7 Mobile redraws, it does not shrink. Below 768px the 3D stage becomes a vertical "parts list" drawing: layers stack as labelled plates with 2D offsets, and cartridges become a two-column grid with dependency chips.
- R8 Retouch boundary. Captures may be cropped and scaled only. No editing of content, colour or labels.

## Exemplar
The densest keyframe (Beat C, step 4: all layers separated, all cartridges visible, one selected with its dependency lines lit, inspector open) is built first, from tokens only. It is checked at 1440 and 375 before the sequence is built.

## Variants
- Social/OG image 1200×630: the exploded keyframe cropped to the capability layer, with the H1 in Newsreader. Crop priority: cartridges with labels, then the headline.
- Favicon: the cartridge glyph (rounded rectangle with a notch) in `--ink` on `--paper`. Checked at 16 and 32px, and reversed.

## Amendments (D17, D18)
- Type: practical UI steps 12/13/14/15/17/18/20/22/26 plus a display clamp; 12px floor.
- Exploded view uses an oblique shelf projection with standing cartridges (labels on upright front faces) instead of a tilted 3D stage.
