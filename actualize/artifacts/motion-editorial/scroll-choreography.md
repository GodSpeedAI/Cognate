built_from: model@7
reads: [purpose, form, voice, claims, capabilities, unknowns, decisions]
cites: [C10, C34, C38, C40, C41]

# Motion-editorial: the scroll as an argument

## Through-line
One object, the Workbench app, is taken apart (C), explained (D), set beside a small sibling that gets built (E) and operated (F), and then extended and put back together (G). The camera stays in one world, the drafting table. Scenes change because the object moves, not because sections fade in and out.

## Implementation layer
- `@bsmnt/scrollytelling` (`Root`, `Animation`, `Stagger`, `Waypoint`) on GSAP ScrollTrigger, inside one React island per pinned sequence. Positions are timeline units 0–100.
- Animate only `transform` and `opacity`. Draw SVG edges with `stroke-dashoffset`.
- Motion is a pure function of scroll position. There is no clock and no randomness, so scrubbing is exact in both directions.
- Hoist every tween object (skill pitfall: identity churn).

## Sequence C: "Take it apart" (pinned, desktop ≥1024px: ~420vh; 768–1023px: ~300vh)
| Units | What changes (one new fact per span) | Text (≤2 tiers) |
|---|---|---|
| 0–8 | The intact capture faces the reader, flat and at full legibility [C41] | "This is the real app." |
| 8–24 | The stage tilts into a perspective view (rotateX ~52°, rotateZ ~-28°; perspective 1800px). The capture is now the top plate | — |
| 24–48 | The layers separate along Z in assembly order: L1 lifts, then L2, L3 and L4 appear below, with dashed mating lines | Layer callouts: Interface / Agents / Capabilities / Durable record |
| 48–68 | Cartridges C-01…C-12 rise out of L3, staggered in census order. Part numbers appear | "Each part does one job." |
| 68–84 | C-05 APPROVALS is auto-selected. Its edges draw in, the rest dim, and the inspector slides in | "Parts connect by contract." |
| 84–100 | Hold. Parts are now interactive: clicking any part re-routes the edges. The scroll hint reads "Keep scrolling to see how parts fit" | — |
Rest: one second of stillness is guaranteed by the hold span.

## Sequence G: "It can grow" (pinned, ~300vh)
| Units | Change |
|---|---|
| 0–15 | The stage returns, exploded (same geometry as C at 84). |
| 15–35 | A slot opens in L3. C-13 EXPERTS & TEAMS appears as a dashed outline, labelled "modelled" [C38] |
| 35–55 | The outline fills ("built"). Edges connect it to MODELS, MEMORY and PERMISSIONS ("bound"), subject to edge verification |
| 55–65 | A check mark appears ("tested"), then the `--human` mark ("accepted by a person"). Tag: "in development (branch)" [C40] |
| 65–92 | Reassembly: cartridges sink, layers close up, and the stage tilts back to flat |
| 92–100 | Hold on the intact capture of the branch's Experts & Teams screen, captioned "Real screen from the expert-teams development branch" [C40] |

## Non-pinned beats (D, E, F)
- D and F are reader-driven demonstrations. They animate on input only, with 160–240ms ease-out state transitions.
- E advances step by step on scroll using `Waypoint` (or IntersectionObserver). The small app drawing gains parts: reused parts drop in grey, and new parts draw their outline and then fill. No typing animation.
- F: the run strip advances to the approval gate and **stops** [C10]. Only the reader's Approve or Deny continues it. Below it, the done-ladder capture [C34] is annotated.

## Responsive redesign (not a shrink)
- **<768px:** no 3D and no long pins. Sequence C becomes a "parts list" drawing. The capture sits on top, and three plates slide down 2D-offset (translateY plus a slight x offset). Cartridges sit in a 2-column grid, and tapping one opens the bottom-sheet inspector. Pin length is ≤150vh, or there is no pin at all with scroll-triggered steps.
- **Sequence G on mobile:** the new cartridge joins the grid with the same four status stamps. Reassembly becomes a single cross-fade to the capture.

## Reduced motion / no JS
- `prefers-reduced-motion: reduce` → pass `disabled` to `Root`. The final keyframe (C at 84 and G at 100) renders statically, and selection still works with instant state changes.
- No JS → server-rendered final keyframe markup plus the parts list.

## Never block progress
- Pinned sections end in a visible "Skip" link. Every beat is anchor-addressable from the progress rail.
- Wheel, touch, keyboard (Space/PageDown/arrows) and direct anchor jumps all land in consistent states, because the state is derived from the scroll position.

## Checks
- Keyframe stills at C:0, 24, 48, 68, 84 and G:15, 55, 100, rendered at 1440, 1024 and 375. Scrub forward and backward and compare the stills (they must be identical).
- Text hold: every caption is visible for ≥ (words/3 + 0.5)s at a typical scroll speed, which means ≥8 timeline units per caption.
