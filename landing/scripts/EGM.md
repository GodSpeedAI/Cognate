# landing/scripts — build and serve tooling

## Overview
Node/Bun command-line scripts that build the site, serve the built output, generate derived image assets, write third-party notices, and verify the census data against pinned git SHAs. None of these scripts render the page; they operate on `dist/`, `public/` and the data modules under `src/data/`. They are invoked directly by `bun` or through `package.json` scripts.

## Interface
- `site.ts` — `up | down | status` supervisor writing `{pid, port, url}` state `[landing/scripts/site.ts:State]`
- `serve.ts` — static server over `dist/`, run as a child process by `site.ts` `[landing/scripts/serve.ts:Bun.serve]`
- `assets.ts` — `writeWebpDerivatives`, `writeOgImage`, `writeFavicon32` `[landing/scripts/assets.ts:writeOgImage]`
- `notices.ts` — `RUNTIME_PACKAGES`, `FONT_FAMILIES`, `buildNotices`, `writeNotices` `[landing/scripts/notices.ts:buildNotices]`
- `shots.ts` — full-page captures at five widths plus a 200% zoom proxy `[landing/scripts/shots.ts:widths]`
- `exploded-stills.ts` — scroll-scrubbed stills with a forward/backward pixel diff `[landing/scripts/exploded-stills.ts:diffPng]`
- `verify-sources.ts` — checks excerpts and edges against pinned SHAs `[landing/scripts/verify-sources.ts:readAt]`

## Side Effects
- Port selection: `up` starts at `--port`, else `SITE_PORT`, else `4321`, and takes the first free port within 100 candidates `[landing/scripts/site.ts:up]`
- Writes `.site/server.json` and `.site/server.log`, and kills the whole process group on `down` `[landing/scripts/site.ts:down]`
- Binds `127.0.0.1` by default (`--host` overrides) and falls back to `dist/404.html` with status 404 `[landing/scripts/serve.ts:resolve]`
- Runs `git show <sha>:<path>` read-only against the Cognate and Workbench working copies `[landing/scripts/verify-sources.ts:repoDirs]`
- Writes PNGs into `actualize/evidence/fidelity-qa/` and its `exploded/` subdirectory `[landing/scripts/shots.ts:outDir]`
- Overwrites `public/og.png`, `public/favicon-32.png` and the WebP derivatives of each capture `[landing/scripts/assets.ts:WEBP_PARAMS]`

## Invariants
- `serve.ts` refuses to start unless `dist/index.html` exists `[landing/scripts/serve.ts:dist]`
- Path resolution strips traversal segments and rejects any file outside `dist` `[landing/scripts/serve.ts:resolve]`
- HTTP readiness is polled before a started server is reported as up `[landing/scripts/site.ts:waitForHttp]`
- A census excerpt longer than 14 lines fails verification `[landing/scripts/verify-sources.ts:failures]`
- Any failure exits non-zero, so the gate cannot pass silently `[landing/scripts/verify-sources.ts:failures]`

## Verification
- Run: `cd landing && bun run verify:sources`
