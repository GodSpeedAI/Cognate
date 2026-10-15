# Exploded view: iteration log

Stills: `scripts/exploded-stills.ts` against `astro preview` (1440x900 and 1024x768). Diff pairs are forward vs backward at the same unit; the numbers are max channel delta and differing pixels (`diff-summary.json`).

## Iteration 1: first projection build (LAYER_STEP 300, CART_Z 3)
- Read C:0 (1440): L4 billboard "Durable record" shows at the top-left before any separation. Layer labels did not fade.
- Read C:48 (1440): four plates separate, but agent-token labels and "L3 Capabilities" overlap.
- Read C:84 (1440): stack is height-limited (scale about 0.38). Upper plate covers L2/L3, labels pile up, cartridges unreadable.
- Read G:100 (1440): stamp row runs off the bottom of the viewport.
- Diffs: C 24 at 1024 differs by 248 (fwd vs bwd).

## Iteration 2: layer step 220, label fades, taller stage
- Layer and agent labels fade with separation (`--o`); the L4 label no longer shows at t=0.
- Stage height raised (100vh - header - 150px).
- Result: scale improves to about 0.5 but cartridges still sit under the L1 capture; C:84 still cramped.

## Iteration 3: layer step 260, cartridges above plates
- CART_Z raised above the plates so every cartridge stays visible over the capture.
- Result: all 12 cartridge labels readable at 1440; at 1024 labels still crowd one another.
- Diffs (fwd vs bwd): C 68 at 1024 = 110 max / 17307 px; C 84 at 1024 = 109 / 13988 px. Open, see below.

## Iteration 4: Sequence G stage height
- G stage shortened so the stamp row sits inside the pinned area; the branch capture and five stamps are visible at G:100.
- G diffs: 15 at 1440 = 8 / 1442 px; 55 at 1440 = 8 / 641 px; 100 = identical.

## Open issues (not resolved)
1. The 1024 pair at units 68 and 84 differs: the split/inspector layout flips at the unit-68 waypoint, so forward and backward frames at the boundary can differ. Unit 84 also differs and has not been diagnosed.
2. At 1024 and at the 84 hold, the 5x3 cartridge grid's billboards still overlap one another. Collision nudging stacks them vertically, so some leaders run longer than 24px.
3. The stacked plates overlap heavily at t=1: the -30 degree rotation with cos 58 degree foreshortening makes each 800x500 plate about 440px tall on screen, so the stack is height-limited. A taller stage or a shallower layer step would fix this; I did not change the spec values.
4. Sequence G edges: parts.ts has only C-13 -> C-10 and C-14 -> C-13. The brief's MODELS, MEMORY and PERMISSIONS edges are not in the data, so they are not drawn.

# Round 2: oblique shelf projection (brief-exploded-2)

Projection: u = s(x + 0.32y) + cu, v = cv - s(0.42y + z). Scale and origin fixed from the exploded bounds, so the stack never rescales. Cartridges are standing faces (x-z plane, 132x64), labels upright on the face. Edges are orthogonal traces on the board, drawn above the faces. The inspector hold derives from the scroll variable --hold, not from waypoint callbacks.

## Round-2 iteration 1: first shelf build
- Stills show four distinct plates and labels on the left margin; faces are readable at 1440 except long names.
- Inspector hold works at 68 and 84.
- Edges: the 10-unit board drop is about 2px on screen, and front-row faces hid the traces. Edges moved above the faces.
- Pixel diffs: 1440 C48 = 248 (144k px). The backward frame had partially risen faces at unit 48: the scroll variables were read before GSAP's tick wrote them.

## Round-2 iteration 2: stamp thresholds and deferred reads
- G stamp tweens now end at their unit (start at unit minus 0.1), so the state is settled at the exact unit in both directions.
- Scroll-variable reads run two animation frames after the scroll (settle()), after GSAP's tick.
- Result: every forward/backward pair is at most 7 (max channel delta). Limit was 8.

## Verified stills (round 2)
- C 0, 24, 48, 84 at 1440 and 1024: clean; C 68 at 1440 and 1024: the inspector column appears (max diff 6 and 7 between directions).
- C 84 at 1440: C-05 edges to C-04 and C-10 both visible, arrowheads at the providers; inspector visible.
- G 55 at 1440: four stamps done, Accepted dashed.
- Keyframe at 1440, 1024 and 375: 1440 composition correct; 375 shows the bottom inspector sheet over the parts list.

## Open issues (round 2)
1. Labels: at this scale the 132-unit faces are about 65px wide on screen (stage is 60 percent of the content width). "Permissions", "Workspace", "Sandbox worlds" and "Interfaces" overflow or wrap out of the face.
2. No slots for C-13 and C-14 in Sequence G. The 12-slot board has no room. Sequence G now shows stamps and the branch capture only.
3. Edge routes: with the 10-unit drop the trace is near the face bottoms. Drawing them above the faces deviates from "lines never cross faces" for legibility.

# Round 3

Changes: seven columns (C-13 back, C-14 front in column seven; empty dashed sockets in Sequence C; filled in G); back row at y=300 with a unit test that every back face sits above its front neighbour; faces 120 x 72 world; L2 tokens 240 wide; stage fit uses both dimensions; caption from scroll position; default C-05 selection on desktop only; button names "C-05 Name — job"; figure heading h2; stamp tweens settle at their unit; scroll-variable reads re-polled for 1.5s after each scroll; ScrollTrigger kicked on mount.

## Measured (C:84, fwd)
- 1440x900: face width 59px (target 110). Stage 706x708.
- 1024x768: face width 44px (target 90). Stage 571x576.
- Cause: at 1440 the stage column is about 60 percent of content width; with the 150px gutter the stack is width-bound at about 0.49 scale. Reaching 110px needs a stage about 1.8x wider.

## Forward/backward (max channel delta)
- All pairs at most 3, limit 8 (C 0/24/48/84, G 15/55/100, 1440 and 1024). C 68 at 1440: 2.

## Gates
check, build, unit tests (14 pass), verify:sources, test:e2e (25 pass).

## Open
1. Face size targets not met (59px and 44px); labels overflow at this scale.
2. Sequence C 84 held frame reviewed after the fixes; L2 tokens and G fill not re-reviewed at 1440 beyond the stills.
3. 375 keyframe: inspector sheet closed by default on phones (auto-select is desktop only).

# Round 4

Board: 3 rows x 5 (back C-01..05, middle C-06..10, front C-11, C-12, C-13 and C-14 sockets, spare empty socket at column five). Column pitch 144, faces 128x72, rows at y 480/280/80 (0.42 x 200 = 84 world apart). Hold stage 64 percent. Layer labels sit above each plate's front-left edge, on paper, not over a face.
Also: pose, hold and caption are derived from the scroll unit in both sequences (no GSAP reads); stamps and branch from the unit; L2 plate transparent; tokens beneath the faces.

## Measured (C 84, C-01 face)
- 1440x900: 84 px (target 100). Stage 753 x 708.
- 1024x768: 66 px (target 80). Stage 609 x 576.
- The target is not reached: the stack is width-bound (plate 900 plus shear 0.32 x 562 = 1080 world across the stage).

## Forward/backward (max channel delta)
- 1440: C 0/24/48/84 = 0; C 68 = 2; G 100 = 0; G 15 and 55 = 3 (a 3 px region).
- 1024: C 84 = 0; C 68 = 0; C 0 and 24 = 18 (1,800 px, on the capture plate); C 48 = 3; G 15/55/100 = 0.

## Open
1. Face width below target (84 and 66 px).
2. Agent tokens sit under the back row at t=1; the back-row labels are fully visible but the token labels are partly covered.
3. 1024 unit 0/24 capture-plate difference of 18 (rasterisation).

# Round 5
- L2 sits 80 world higher (LAYER_GAP); agent tokens moved to the far edge (y 140). Tokens no longer overlap any face at t = 1 (test asserts this at three stage sizes).
- Face width unchanged: 84px at 1440, 66px at 1024 (width-bound).
- Read: C 84 at 1440 and 1024, G 55 at 1440: all three labels visible above the back row.
- Forward/backward: 1440 max 3 (C 0 to 84 = 0); 1024 max 16 (C 0/24, capture plate).
