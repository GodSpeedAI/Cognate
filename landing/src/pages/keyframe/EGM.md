# landing/src/pages/keyframe — QA keyframe route

## Overview
A single-file route that renders the exploded assembly drawing without the surrounding marketing page. It exists so screenshot tooling and end-to-end tests have one deterministic page with a single animation state and no scroll pinning. It wraps the drawing in `Base` with `noindex` set.

## Interface
- `index.astro` — the route file; imports `Base`, `ExplodedView`, `PartsText` and the exploded stylesheet `[landing/src/pages/keyframe/index.astro:Base]`
- `ExplodedView` — mounted `client:load` with `defaultSelection="C-05"` and `split` `[landing/src/pages/keyframe/index.astro:ExplodedView]`
- `PartsText` — rendered after the drawing as the text equivalent `[landing/src/pages/keyframe/index.astro:PartsText]`

## Invariants
- The route is `noindex`, so the QA page cannot be indexed `[landing/src/pages/keyframe/index.astro:Base]`
- The page must expose `.stage-wrap svg` once loaded, which the asset scripts wait for `[landing/src/pages/keyframe/index.astro:ExplodedView]`
- The heading and header text introduce the four layers the drawing stacks `[landing/src/pages/keyframe/index.astro:main]`

## Side Effects
- None beyond client-side hydration of the view; no fetch, no file write `[landing/src/pages/keyframe/index.astro:Base]`

## Verification
- Run: `cd landing && bun run test:e2e`
