# Keyframe iterations (Phase 1)

## Iteration 1: first full run
- Build passed. `shots` reported horizontal overflow at 768 (856px), 375 (383px) and 320 (328px).
- Cause: the mobile L4 plate used `width: 100%` plus a 24px left margin. The tablet stage let the projected 3D plates extend past the viewport.
- Fix: the mobile L4 plate uses `calc(100% - 24px)` with the margin. The stage wrapper gets `overflow: hidden`.

## Iteration 2: dimmed cartridges
- The brief asks for 35% opacity on non-linked parts. At 1440 that made most labels unreadable, and contrast fell below 4.5:1.
- Fix: non-linked cartridges use the paper fill, a rule-colour outline and secondary ink. The label is legible and the part is still visibly de-emphasised. This is a deliberate deviation from the spec.

## Iteration 3: type check
- `astro check` failed on TypeScript 7.0. TypeScript is pinned at 6.0.3.

## Review at 1440 (after iteration 2)
- The four layers separate in perspective. Twelve cartridges are visible and labelled. C-05 is selected with its two edges lit (C-04 provider, C-10 stores-in). The inspector is open with what, why, depends on and used by.
- Remaining issues: leader lines cross the capture plate and the stage, which adds clutter. The 52° tilt compresses cartridge text. Both are noted for Phase 2 and are not resolved here.

## Review at 375 (after iteration 2)
- Layout redraws as a 2D parts list. Plates stack, cartridges form a two-column grid with dependency chips, and the inspector sits below. No overflow.

## Not done in Phase 1
- The "meaning test" from the illustration spec (a reviewer with no context) was not run.
- Dark-mode and 768 screenshots were captured and checked by the overflow report only, not reviewed visually.
- Interactive keyboard behaviour (arrows, Escape) was implemented but not exercised in a browser test.
