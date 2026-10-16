# Impeccable pass 05: adapt and polish (landing)

Date: 2026-10-15. Scope: landing/ only, plus this log. No copy or claim changes beyond micro-labels. No git operations.

## Preflight

IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=not_required image_gate=skipped:adapt and polish on existing real captures and the refund-desk demo; no new raster mocks mutation=open

Loader run from the installed skill path with cwd = landing. Visual language read (Color, Typography, Graphic System, Motion, Dark Mode).

## Adapt (device pass)

Screenshots: `scratchpad/polish-shots/` (`before-*` baseline, `p1-*`, `p2-*`, `p3-*`, `route-*`). Widths 320, 375, 390, 768, 1024, 1280, 1440, 1920, light and dark.

Automated checks at every width: no horizontal overflow, no page errors. Tap targets below 44px at phone widths were the wordmark, primary buttons, "Skip the animation", "View on GitHub", and command copy controls. These are fixed (see below). Inputs are 20px inside 44px label rows.

Findings and fixes:
- Beat C authority route crossed other faces. Replaced (see Polish 1).
- Beat F escalate state was Allow green. Replaced (Polish 2).
- Beat F controls were enabled before mount and Reset was live without JS. Now disabled until mount; no-JS shows the run at its gate with an explanation.
- Hero capture was cut through words at its left edge. Re-cropped (Polish 4). A CSS window, no pixel edits.
- Command Copy buttons sat on their own row. Now in each block's top bar (Polish 5).
- Face labels were 10px at 768 to 1199. Now 12px with a break opportunity for long names (Polish 6).

Not verified visually in this pass: Beat C and Beat F at 320 to 390 (parts list, R7) beyond the automated checks. Keyboard and touch behaviour are covered by the existing e2e tests, not re-tested by hand.

## Polish

1. Authority route (ExplodedView.tsx, new src/lib/route.ts). The route is a table keyed by writer, solved once by an orthogonal lattice router (Dijkstra; axis-aligned legs in world space; screen-space obstacle test against every face, top face, agent token and layer label). The C-04 route: short run along its own base, a lift in the gap to a lane above the stack (z = 260), a run to the right edge, a drop, and a run into the ledger row's right end. Heights scale with separation. A stores-in edge to C-10 is drawn only as the route (no duplicate board trace). tests/route.test.ts checks every writer: one route per verified writer, world-axis legs, endpoints, and no crossing.
2. Escalate amber (tokens.css `--escalate-text`: #8a5c12 light, 4.8:1 on mist; #e0a94a dark, 8.4:1). Applied to the escalate border, state line, gate chip and gate mark. Approve stays green (a person decides).
3. Controls live after mount (RunDemo.tsx, index.astro `client:load`). The run starts at its gate; Reset replays pending to escalate.
4. Hero window (page.css). Plate 1160 x 844 of the 1440 x 900 capture: from the sidebar rule (x = 280) to the right edge, top to the rule under the acceptance table (y = 844). The figcaption moved below the plate.
5. Copy in the block's top bar (Onboarding.tsx `CodeBlock`, page.css `.code-bar`). 44px, top right, labelled "Copy". Clipboard e2e test still passes.
6. Face labels 12px at 768 to 1199 (exploded.css). Line height 0.9 so number plus two name lines fit a 37px face at 1024. Long names break at `wbr` (no text change, so axe name matching holds).
7. Touch targets: `.btn`, `.wordmark`, `.ob-check`, `.radio`, `.seq-skip a`, `.excerpt figcaption a` at 44px minimum.

## Gates

- `bun run check`: 0 errors.
- `bun run build`: complete. OG image regenerated (`writeOgImage` at 127.0.0.1:4321) because the hero window changed.
- `bun run test`: 49 pass (route table tests added).
- `bun run verify:sources`: PASS (19 excerpts, 16 edges).
- `bun run test:e2e`: 35 pass (29 existing + 6 in tests/e2e/polish.spec.ts), axe clean.

## Open

- The 1024 and 768 cartridge faces are small; 12px fits by tight leading. A wider stage (stacked layout) would be the real fix but affects the pinned Beat C layout. Not done.
- Other verified edges (requires, invokes) still draw as base-to-base board traces and may cross faces. The brief covered the authority route only.
- DESIGN.md and DESIGN.json refreshed for the built state.
