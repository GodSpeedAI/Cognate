# Cognate landing (Phase 1)

Static Astro site with React islands. Phase 1 contains the exploded-view keyframe at `/keyframe/` (QA route, noindex).

## Commands (Bun)

- `bun install` installs pinned dependencies.
- `bun run dev` starts the dev server.
- `bun run build` produces `dist/`.
- `bun run preview` serves `dist/`.
- `bun run check` runs `astro check` and `tsc --noEmit`.
- `bun test` runs data-invariant tests for the census.
- `bun run verify:sources` checks every census excerpt and edge line against the pinned git SHAs. Cognate is read from the repo root. Workbench is read from `COGNATE_WORKBENCH_DIR` (default `../../cognate-workbench`, relative to `landing/`) using `git show`, so the repo is never checked out or modified.
- `bun run shots` builds, previews and captures `/keyframe/` at 1440, 1024, 768, 375 and 320 widths, plus dark at 1440. PNGs go to `actualize/evidence/illustration/`.

## Layout

- `src/data/` holds the census (`parts.ts`), captures (`captures.ts`) and types.
- `src/components/` holds `ExplodedView.tsx` (island), `Inspector.tsx` and `PartsText.astro`.
- `src/styles/tokens.css` implements the direction tokens (light primary; dark via `prefers-color-scheme` or `[data-theme="dark"]`).
- `PROVENANCE.md` lists captures and licenses. `docs/DECISIONS.md` lists decisions.
