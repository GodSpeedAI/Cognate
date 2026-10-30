# landing/src — site source blueprint

## Overview
Everything Astro renders lives here: one shared layout, two routes, a drawing/projection library, the verified census data modules, and the React islands that animate them. There are no source files directly in this directory; `styles/` holds the CSS that `Base.astro` imports. The directory splits cleanly into presentation (`components`, `layouts`, `pages`), pure logic (`lib`), and evidence data (`data`).

## Subdirectories & Boundaries
- components: [./components/EGM.md](./components/EGM.md) — React and Astro presentation units
- data: [./data/EGM.md](./data/EGM.md) — pinned census, capture and walkthrough data
- layouts: [./layouts/EGM.md](./layouts/EGM.md) — the single document shell
- lib: [./lib/EGM.md](./lib/EGM.md) — projection, routing and link helpers
- pages: [./pages/EGM.md](./pages/EGM.md) — the routes
- `styles/` — CSS imported by the layout (unlinked, no source contract)

## Global Invariants
- Within `src`, `data` is the only place pinned SHAs and excerpts appear; `lib` only reads them `[landing/src/data/types.ts:SourceRef]`
- Every excerpt shown to a reader must be a verbatim line range of `sources[0]`, enforced outside `src` by `scripts/verify-sources.ts` `[landing/src/data/types.ts:Part]`
- The drawing is a pure function of pose and stage size; scroll only supplies the pose `[landing/src/lib/projection.ts:Pose]`
- Only edges verified in source are listed, so the graph cannot claim an unproven dependency `[landing/src/data/types.ts:Edge]`

## Global Side Effects
- Data modules are declaration-only; the side effects (network, disk, git reads) are triggered by the page and scripts that consume them `[landing/src/data/captures.ts:captures]`
- The home route performs a build-time registry fetch, the only network call originating in `src` `[landing/src/pages/index.astro:npmVersion]`

## Verification
- Run: `cd landing && bun test`
