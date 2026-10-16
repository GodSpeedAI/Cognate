# Impeccable pass 03: layout, then bolder (landing)

Date: 2026-10-15. Scope: landing/ only (src/pages/index.astro, src/styles/base.css, page.css, exploded.css). No copy or claim changes; no git operations.

## Preflight

IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=not_required image_gate=skipped:layout and bolder over existing real Workbench captures; no new raster mocks needed mutation=open

Loader: `node /home/sprime01/.claude/skills/impeccable/scripts/load-context.mjs` run with cwd = landing (PRODUCT.md, DESIGN.md resolved from landing). Register: brand. Visual language (godspeed-growth/brand/visual/visual-language.md) read first and applied as authoritative.

## Layout changes

- Grid: 12-column frame (24px gutters) for the hero; beat frame made border-box so beat text and the hero share one left edge (was 24px off, and beat content ran into the rail).
- Hero: headline on its own full-width row (clamp 44 to 80px, max 20ch: three lines at 1440, was five). Below it, copy in columns 1 to 5, the real capture in columns 6 to 12 at a 16:10 plate, scaled and cropped (left navigation cropped off, contract block shown). Capture opacity 1. Extra right gutter keeps the capture clear of the rail; rail now hidden below 1280px (was 1100).
- Rhythm: full beats 96/64; dense beats (fit, extension) 64/48; evidence beats (proof, agents at work) close at 96. Spacing comes from the existing tokens only.
- Beat C: stage takes the drawing's 4:3 proportion (projection fits stage width), so the stack fills its box; no dead band under it. Inspector column top-aligned with the stage. Stage caption block tightened (13px, 1.5 line-height). The dark stage fills the pinned area (pin background near-black), so no paper band shows. Projection math, choreography and the view fit are unchanged.
- Beat E: the build drawing's caption no longer collides with the base plate (drawing height 340px, caption spaced 32px).
- #start: checklist capped at 720px so code blocks match the prose measure; each step is a hairline-separated block; checkbox and 26px Josefin heading share a centred row.

## Bolder changes

- Hierarchy: H1 larger (up to 80px), section H2 up to 64px (from 56px).
- Section openers on evidence beats carry the gold proof marker (a square, not text).
- Authority record in #operate (after the RunDemo, so the demo keeps its position). Values come only from examples/refund-desk, test/refund-desk.test.ts: actor agent.refund-desk for caller support-agent-1 (src/refund-desk.ts AGENT_ID, CALLER); operation refunds.issue@1.0.0 (test bindCapabilities); resource order 1003, $75.00 (propose(1003, 7500)); decision refund-approval approved by manager-1 (decide(..., true, "manager-1")); evidence refund.proposed, refund.awaiting_approval, refund.approved, refund.issued (history test). Gold marks the decision row. Source cited in an HTML comment in index.astro.
- Hairline rows, not cards; Plex Mono for identifiers only.

## Engineering notes

- Stage elements (`.stage-wrap > *`, `.plate`, `.face`) get `will-change: transform`. Without it, Chrome rasterised the same pose differently when scrolled down versus back up (sequence.spec stills at units 24 and 48/68 failed by 26 to 43 px at plate and cartridge edges). With it, forward and backward frames are identical. This is a determinism fix, not a visual change.
- Hero `.hero-plate` margin and width overrides reset under 768px so the phone layout is unaffected.
- Mid-session, page.css, exploded.css and index.astro changed on disk outside this pass; edits were applied to the current content, nothing reverted.

## Gates (landing/)

- bun run check: 0 errors, 0 warnings
- bun run build: pass
- bun run test: 24 pass, 0 fail
- bun run verify:sources: PASS
- bun run test:e2e: 25 passed (axe clean). No test changed. The layout spec's overflow check now passes at 320 and 375 (the record values wrap, and rows stack below 600px).

## Screenshots

Full set (68 viewport shots, light and dark, 1440 and 1024): /tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/layout-shots/ (hero, beatC-u0/u48/u84, E-0 to E-2, F-0 to F-2, G-u30/u70/u95, start-0 to start-3).

## Open issues

- At 1024 the "Permissions" cartridge label clips inside its face (faces have overflow hidden at the narrower stage). Not fixed.
- Beat G is unchanged in layout except the stage margin; the mid-reassembly frame still shows parts overlapping the agent row (part of the animation, not reviewed in this pass).
- Mobile pass not done (out of scope). Hero capture keeps 16:10 at phone widths but the crop resets.
- `will-change` on every stage element costs compositor memory; not profiled.
