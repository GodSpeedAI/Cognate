# landing/src/components — islands and Astro fragments

## Overview
The presentation units the two routes compose. Two are plain `.astro` fragments rendered on the server (`Capture.astro`, `PartsText.astro`); the rest are React islands, with `client:load` on the animated ones. `ExplodedView.tsx` is the centrepiece: it builds the whole exploded scene from the projection and route libraries and reads its pose back from CSS variables on each scroll and resize.

## Interface
- `ExplodedView` — default export taking `parts`, `defaultSelection`, `holdSelection`, `split`, `extension`, `pose`, `hold` `[landing/src/components/ExplodedView.tsx:ExplodedView]`
- `SCRUB_EVENT`, `SELECT_EVENT` — window event names used to re-measure and to publish selection `[landing/src/components/ExplodedView.tsx:SCRUB_EVENT]`
- `settle` — re-reads the scroll-driven variables two frames later and again at increasing delays `[landing/src/components/ExplodedView.tsx:settle]`
- `SequenceC`, `SequenceG` — pinned scroll sequences; `poseAt` maps a scroll unit to a pose `[landing/src/components/SequenceC.tsx:poseAt]`
- `Capture.astro` — `file`, `alt`, `caption`, `width`, `height`, `eager`, `class` `[landing/src/components/Capture.astro:Props]`
- `PartsText.astro` — server-rendered `<details open>` list, the no-JS equivalent of the drawing `[landing/src/components/PartsText.astro:rows]`
- `Inspector`, `Rail`, `Onboarding`, `BuildSteps`, `RunDemo`, `CompositionDemo` — default-exported islands `[landing/src/components/Inspector.tsx:Inspector]`

## Invariants
- The picture is a pure function of scroll: no CSS transitions and no state set by waypoint callbacks `[landing/src/components/ExplodedView.tsx:SCRUB_EVENT]`
- Automatic selection applies on desktop and tablet only; on phones the inspector sheet starts closed `[landing/src/components/ExplodedView.tsx:autoSelection]`
- Parts flagged `branchOnly` are hidden until `extension` advances `[landing/src/components/ExplodedView.tsx:shownParts]`
- `Capture.astro` always pairs a WebP source with the PNG fallback, sets width and height, and defaults to lazy loading `[landing/src/components/Capture.astro:eager]`
- The text list is open by default so no-JS and reduced-motion readers get the full part list `[landing/src/components/PartsText.astro:parts]`
- Reduced-motion and mobile queries disable the pinned sequences `[landing/src/components/SequenceC.tsx:readUnit]`
- The extension stamps gate at scroll units 15/35/45/55/65, and the branch appears at 92 `[landing/src/components/SequenceG.tsx:STAMPS]`
- `RunDemo` starts at its approval gate so static markup shows the waiting state, and controls stay disabled until mounted `[landing/src/components/RunDemo.tsx:RunDemo]`
- `CompositionDemo` is a browser demonstration and is labelled as not a deployed app `[landing/src/components/CompositionDemo.tsx:PROVIDERS]`
- `Onboarding` progress is stored under a versioned localStorage key, read inside try/catch `[landing/src/components/Onboarding.tsx:STORAGE_KEY]`

## Side Effects
- Window listeners for scrub, scroll and select, plus an intersection observer, on mount `[landing/src/components/ExplodedView.tsx:onScrub]`
- `IntersectionObserver` drives the rail's `aria-current` `[landing/src/components/Rail.tsx:BEATS]`
- localStorage read and write for onboarding progress `[landing/src/components/Onboarding.tsx:readChecked]`
- Timers schedule the policy check's transition to escalation, shortened to zero under reduced motion `[landing/src/components/RunDemo.tsx:DECISION_DELAY_MS]`

## Verification
- Run: `cd landing && bun run test:e2e`
