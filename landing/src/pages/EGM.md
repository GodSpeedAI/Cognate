# landing/src/pages — routes

## Overview
The two Astro routes. `index.astro` is the long-form landing page: it composes the beat sections, mounts each island, and fetches the current npm version at build time. `keyframe/index.astro` is a deliberately small QA route that renders the exploded view and the text list alone, which is what the screenshot and asset scripts drive.

## Interface
- `index.astro` — home route, default export omitted (file-based routing) `[landing/src/pages/index.astro:Base]`
- `keyframe/index.astro` — `/keyframe/` QA route, `noindex` `[landing/src/pages/keyframe/index.astro:Base]`
- Subdirectories: [./keyframe/EGM.md](./keyframe/EGM.md) — the QA keyframe route

## Invariants
- Beat anchor ids must match the rail's beat ids (`top`, `meaning`, `proof`, `parts`, `fit`, `build`, `operate`, `extend`, `start`) `[landing/src/pages/index.astro:Rail]`
- Captures are looked up by filename fragment and asserted non-null, so a renamed capture fails the build `[landing/src/pages/index.astro:byFile]`
- The status chip text is `v0 · <version> on npm` with the fetched or fallback version `[landing/src/pages/index.astro:npmVersion]`
- The keyframe route declares `noindex` and its own title/description `[landing/src/pages/keyframe/index.astro:Base]`
- The keyframe route pins `defaultSelection="C-05"` and enables `split` `[landing/src/pages/keyframe/index.astro:ExplodedView]`

## Side Effects
- Build-time HTTP request to the npm registry; a non-OK response or throw keeps the pinned fallback `[landing/src/pages/index.astro:npmVersion]`
- Page markup is static output; interactivity comes only from the mounted islands `[landing/src/pages/index.astro:Rail]`

## Verification
- Run: `cd landing && bun test`
