# Completion report: Cognate repositioning, landing page and onboarding

Branch `feature/landing-repositioning` (local; not pushed). Product Actualizer run closed at model@7, verdict **go-with-exception** (owner: Sam Prime).

## What was implemented
- **README.md** is fully rewritten. It now leads with identity, the human–agent relationship, the three properties, when to use Cognate, a verified quick start, the first app, how capabilities work, extension, Cognate-Workbench as an exemplar, under-the-hood detail, docs, examples, development, contributing and release status. Detailed prose moved to `docs/explanation/{design-principles,under-the-hood,what-you-can-build}.md` and `docs/comparisons.md`; the content map is in `actualize/evidence/marketing/readme-content-map.md`.
- **landing/** is a static Astro site with React islands. It tells an eight-beat scroll story (A–H). The signature exploded view is driven by a single pure projection. There are browser demonstrations for composition (Beat D) and approval (Beat F). The onboarding checklist (H) has recovery drawers and progress kept in localStorage. Parts data, excerpts and edges are verified against pinned source (`bun run verify:sources`). The build generates third-party notices.
- **Onboarding**: `examples/refund-desk/` is a standalone reference app on npm 0.5.0. It has a `.sea` model, human approval over $50, a restart-safe ledger, a receipt extension and 7 tests. The building-with-cognate and domainforge-sea skills and the onboarding docs were fixed to match 0.5.0.
- **CONTRIBUTING.md** is based on the GodSpeed guide. **`just site-up / site-down / site-status`** serve the site on the first free port from 4321.

## Positioning and headline
"Cognate — the agentic application framework. **You steer the software. AI agents build it, and work within it.**" The voice inherits the GodSpeed master voice. Workbench is described as an agent harness for coding and general work, and as an example of an app built with Cognate, not as Cognate itself.

## How each beat changes understanding
A: you direct and the agent builds; you stay in charge. → B: a real app built with it (real Workbench captures). → C: the app is four layers, and its capabilities are named parts with one job each. → D: code asks for a job by name, any eligible provider answers, and a permission check comes first (default no). → E: the six real steps your agent takes, shown on Refund Desk with real files and test output. → F: agents work inside the app and pause for you; finished is not accepted. → G: you authorize an extension; new parts fill sockets in the same structure. → H: four steps to your own working app.

## Exploded view
`landing/src/lib/projection.ts` defines one oblique "shelf" projection: `u = s(x+SH·y)`, `v = −s(K·y+z)`. Scroll drives tilt, separation and rise as a pure function of position, so reverse scrubbing matches (forward/backward stills differ by at most 3, or 16 on the capture plate at 1024). Plates are 2D affine matrices, so there is no CSS 3D and no blur. Capability cartridges stand upright, with labels on their front faces. Dependency edges are orthogonal traces, and only the 16 source-verified edges are drawn. The L3 board is 3×5: two extension sockets are filled in Beat G, and one spare socket is left as "room to grow". Mobile gets a redesigned 2D parts list. Reduced motion and no-JS get the static keyframe plus a text parts list.

## Activation milestone
A visitor's coding agent builds a small Cognate app; the app runs; and its named acceptance tests pass on the visitor's machine, including the human-approval pause. A cold agent following only the page reached this: 6/6 tests passed, in about 5 minutes of commands.

## Verified (commands and results)
- `just verify`: 81/81 gates pass.
- `bun run typecheck`: exit 0.
- `examples/refund-desk`: `bun test`, 7 pass.
- `landing`: `bun run check` 0; `bun run build` 0; `bun run test` 23 pass; `bun run verify:sources` pass; `bun run test:e2e` 25/25. These cover nav, CTAs, clipboard, keyboard, touch, reduced motion, no-JS, scroll determinism, overflow at 320–1440, and axe with zero serious or critical findings.
- Fidelity QA measured tokens, fonts, contrast, sizes, overflow and density (`actualize/artifacts/fidelity-qa/report.md`).
- First-contact: a comprehension test, a cold first build and a five-persona red team (`actualize/evidence/first-contact/`).
- Release gate: `actualize/artifacts/release-readiness/gate.md`.

## Remaining limitations and blockers (owner-only)
1. **Merge and push the branch** (U10/U11). `npx skills add GodSpeedAI/Cognate` serves the default-branch skill, which is still stale on `main`. The landing-page source links to branch SHAs will 404 until the branch is pushed. After merging, re-run the clean first build.
2. **Host and public URL** (U7): no canonical or OG URL is set yet. **Trademark screening** (U8). **skills.sh listing** (U3): the placeholder is labelled.
3. Opportunities that were recorded but not done (SDK untouched by design): ship the CLI templates on npm so `cognate create` works without `--source`; have the SQLite store create its parent directory; add a small-app path to the modelling skill; fix the DomainForge `fmt`/units issues.
4. Waivers: capture density at 1440 on DPR 2 (the captures are native 1440px, and upscaling is not allowed); practical UI type steps; the GSAP notice quotes its clauses rather than vendoring the full license text.
5. About 31 MB of screenshot evidence is committed under `actualize/evidence/`. Prune it before merging if you'd rather keep it out of history.

## Run and build
```bash
just site-up            # build + serve on first free port ≥4321 (prints URL); --port N, --no-build
just site-down
cd landing && bun install && bun run build      # static output in landing/dist/
cd landing && bun run test && bun run test:e2e  # unit + browser tests
```
