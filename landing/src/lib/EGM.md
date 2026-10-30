# landing/src/lib — projection, routing and links

## Overview
Pure computation for the exploded drawing: an oblique shelf projection that maps world coordinates to stage pixels, a table-plus-solver router that traces each record writer to the ledger row, small graph query helpers over the census edges, and the GitHub permalink builder. There is no React and no DOM access in this directory, which is why the drawing can be tested without a browser.

## Interface
- `projection.ts` — `Pose`, `View`, `project`, `layerZ`, `faceRect`, `tokenRect`, `makeView`, `matrixCss` `[landing/src/lib/projection.ts:project]`
- `route.ts` — `obstacles`, `blockedBy`, `writerBase`, `solveRoute`, `AUTHORITY_ROUTES`, `routeFor`, `LEDGER_ROW` `[landing/src/lib/route.ts:solveRoute]`
- `graph.ts` — `keyframeParts`, `extensionParts`, `partById`, `dependsOn`, `usedBy`, `keyframeEdges`, `kindLabel`, `edgeWord` `[landing/src/lib/graph.ts:keyframeParts]`
- `links.ts` — `githubUrl`, `sourceLabel` `[landing/src/lib/links.ts:githubUrl]`

## Invariants
- Text is never sheared: cartridge faces lie in the x-z plane so they project as plain rectangles `[landing/src/lib/projection.ts:Pose]`
- Scale and origin come from the fully exploded extents only, so the drawing never rescales mid-sequence `[landing/src/lib/projection.ts:SEP_WORLD]`
- Rows never overlap because the row pitch exceeds the face height `[landing/src/lib/projection.ts:ROW_Y]`
- A route runs along one axis at a time and never crosses a cartridge face, top face, layer label or agent token `[landing/src/lib/route.ts:obstacles]`
- The ledger row's own centreline is not usable as a lane `[landing/src/lib/route.ts:solveRoute]`
- `AUTHORITY_ROUTES` has exactly one entry per verified `stores-in` writer of C-10, no more `[landing/src/lib/route.ts:AUTHORITY_ROUTES]`
- The keyframe shows twelve cartridges; C-13 and C-14 join only in the extension sequence `[landing/src/lib/graph.ts:KEYFRAME_IDS]`
- Permalinks point at the pinned commit and a line range, never at a branch `[landing/src/lib/links.ts:githubUrl]`

## Side Effects
- None. These modules are pure arithmetic and lookups; the caller supplies pose and view `[landing/src/lib/projection.ts:project]`

## Verification
- Run: `cd landing && bun test tests/route.test.ts tests/projection.test.ts`
