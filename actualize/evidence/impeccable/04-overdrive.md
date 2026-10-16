# Impeccable pass 04: overdrive (landing)

Date: 2026-10-15. Scope: landing/ only (ExplodedView.tsx, RunDemo.tsx, exploded.css, page.css, tests/e2e). No copy or claim changes. No git operations.

## Preflight

IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=not_required image_gate=skipped:overdrive on existing real Workbench capture and the refund-desk demo; no new raster mocks needed mutation=open

Loader run from the installed skill path (`node /home/sprime01/.claude/skills/impeccable/scripts/load-context.mjs`, cwd = landing). The `.agents/skills` path in the command text does not exist in this repo. Register: brand. Visual language read first (Graphic System, Motion and Animation).

## Directions considered

1. Authority route through the verified graph down to L4, with a ledger row stamped on the durable record (chosen, Beat C).
2. Approval decision node: pending, escalate, allow or deny, with the event record stamping in (chosen, Beat F).
3. Hero controlled mask reveal (not built: it adds a third moment and the brief asked for one or two).

Only the two chosen directions are built. Competing motion is kept out.

## What was built

### Beat C: authority route and ledger row (ExplodedView.tsx, exploded.css)

- When a part is selected, its edges are drawn in the signal gold (`.edge.route`). With motion allowed the route completes in one 380ms exponential ease-out pass (`stroke-dashoffset`, `pathLength=1`).
- If the selected part has a verified `stores-in` edge to C-10 History (the L4 durable record), a route runs from its base down to the L4 plate, and a ledger row `Cxx Name → C-10 History` stamps in (240ms, opacity and a 4% scale settle). The row is drawn flat on screen, because text on the foreshortened L4 plate did not read.
- Only verified edges from `src/data/parts.ts` are drawn. C-01 has no edge to C-10, so it gets no row (tested). C-04 and C-05 do (the `stores-in` edges at parts.ts lines 294 and 296).
- Both animations are inside `prefers-reduced-motion: no-preference`. Reduced motion and no-JS get the whole route and row at once. Scrubbed motion is still a pure function of scroll; the animations only run on selection changes, and the stills test passes.

### Beat F: decision node (RunDemo.tsx, page.css)

- A decision node reads `Policy: refunds over $50 need approval`, with the state moving pending → escalate → allow or deny. Pending lasts 480ms before escalating (immediately under reduced motion). Approve and Deny are enabled only in escalate, so no control acts out of phase. Reset restarts the check.
- Event rows stamp in as they occur. The demo mirrors examples/refund-desk, with the emit lines cited in a code comment (src/refund-desk.ts lines 124-144): awaiting_approval, then approved and issued, or denied.
- New UI words: "Pending", "Escalate: waiting for a person", "Allow", "Deny", and the status "Checking the policy.". These are state labels, not claims.

### Defects

- Beat C notch at 1440: the stage (full-bleed, dark) was shorter than the pinned area, so the flex-centred pin left ivory corners. The stage now fills the pin (`.seq-c .seq-stage.theme-dark` in page.css). Verified in the screenshots: no ivory corners in light or dark.
- 1024 label clip: faces are about 64px wide at 1024 to 1199. The face label steps down to 10px there (exploded.css). A test measures scrollWidth against clientWidth for every face at 1024 (no overflow).

## Gates

- `bun run check`: 0 errors (44 files).
- `bun run build`: complete.
- `bun run test`: 24 pass.
- `bun run verify:sources`: PASS (19 excerpts, 16 edges).
- `bun run test:e2e`: 29 of 29 pass, axe clean. Four new tests: ledger row present for C-04 and absent for C-01; route drawn on selection; no face label overflow at 1024; decision node escalate → allow; escalate → deny → reset.

## Screenshots and frames

Directory: /tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/overdrive-shots/

- light and dark at 1440, Beat C at unit 84: `light-1440-beatC-u84.png`, `dark-1440-beatC-u84.png`
- Beat C with C-04 selected (route and ledger row): `*-1440-beatC-C04-selected.png`
- Beat C with C-01 selected (no row): `*-1440-beatC-C01-selected.png`
- Route frame sequence, 40, 120, 220, 420ms after selection: `*-1440-route-frame-{40,120,220,420}ms.png`
- Beat F: `*-1440-beatF-pending.png`, `*-1440-beatF-escalate.png`, `*-1440-beatF-allow.png`
- 1024 Beat C: `light-1024-beatC-u84.png`

## Open issues

- Beat F's buttons are real buttons in the SSR markup, but the island hydrates on visibility. Without JS they are inert. This predates this pass and is not fixed here.
- The hero controlled mask reveal was not built (direction 3).
- The route is a long diagonal on a 1024 viewport; it reads, but it crosses the C-02 and C-03 faces. Adapt pass could route it around them.
- The 1024 faces use 10px labels. Legible, but small. A wider stage at 1024 would be the real fix.
