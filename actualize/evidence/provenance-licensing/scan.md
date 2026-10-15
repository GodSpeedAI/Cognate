# Provenance and licensing scan: commands and exit codes

Working directory for all commands: /home/sprime01/projects/cognate/landing unless noted. Date 2026-10-15.

| # | Command (abbreviated) | Exit | Result |
|---|---|---|---|
| 1 | `cd landing && bun run build` (output in /tmp/prov-build.log) | 0 | "Complete!", 2 pages built |
| 2 | `find dist -type f \| sort` with stat size listing | 0 | 47 files listed |
| 3 | `grep -o -E '/\*!...\|@license...\|@preserve...'` over dist/*.js, *.mjs, *.css | 0 | 0 license comments in any chunk |
| 4 | `find dist -name '*.map' \| wc -l` | 0 | 0 source maps |
| 5 | `grep -c -i 'Cognate-Workbench\|Apache\|OFL' dist/index.html` plus grep -rl over dist | 0 | Workbench caption x3, "Apache" x2 (meta, Cognate-level), no OFL or license text |
| 6 | Chunk identity: head -c 300 plus grep counts for gsap, scrollytelling, radix, react-dom, astro-island, OFL, Apache per chunk | 0 | gsap/ScrollTrigger/Flip in dist.BIYHn6zb.js; radix.slottable in dist.BIYHn6zb.js; react in react.*.js; react-dom in react-dom.*.js; astro:unmount in client.*.js |
| 7 | `node -p require(pkg/package.json).version/license` for astro, @astrojs/react, react, react-dom, scheduler, gsap, @bsmnt/scrollytelling, 3 fontsource packages; `ls` for LICENSE files | 0 | MIT (astro, react, react-dom, scheduler, @astrojs/react); gsap 3.15.0 "Standard 'no charge' license"; scrollytelling 0.3.3 license undefined, no LICENSE; fontsource OFL-1.1 with LICENSE |
| 8 | `ls -d node_modules/@radix-ui/*` and per-package node -p license/version (slot, portal, primitive, compose-refs, use-layout-effect) | 0 | All MIT 1.x/2.x, LICENSE present |
| 9 | `sed -n` plus gsap LICENSE/README and package.json license read | 0 | No LICENSE file in gsap pkg; license string and README link to gsap.com/standard-license |
| 10 | Upstream MIT: `head -c 400 product-actualizer/.agents/skills/scrollytelling/LICENSE` | 0 | MIT License, Copyright (c) 2023 basement.studio |
| 11 | ctx_fetch_and_index https://gsap.com/standard-license | n/a (tool) | "Standard 'No Charge' GSAP License" text retrieved; permitted use on websites by any entity; prohibited use in competing visual-animation builders; no removal of proprietary notices |
| 12 | `grep -rn` imports of @bsmnt/@radix-ui/@fontsource/gsap in src scripts tests; grep SequenceC/SequenceG in src/pages | 0 | SequenceC.tsx and SequenceG.tsx import @bsmnt/scrollytelling; index.astro renders both (client:visible); Base.astro imports 3 fontsource packages |
| 13 | `cat src/data/captures.ts` | 0 | 6 captures with repo GodSpeedAI/Cognate-Workbench, SHAs d208cd04 (4 e2e) and fdc709b9 (2 expert-teams, branch) |
| 14 | `grep -rn webp\|sharp\|convert scripts/*.ts` plus public tree listing | 0 | scripts/assets.ts writeWebpDerivatives (canvas.toBlob image/webp q0.9); writeOgImage; writeFavicon32 |
| 15 | `which exiftool` | 1 (not found) | NO_EXIFTOOL; fallback to PIL 12.1.1 |
| 16 | python3 -I PIL script: format, size, info keys, EXIF for all dist PNG/WebP and og.png/favicon | 0 | All 1440x900 except og.png 1200x630, favicon 32x32; PNG info empty, no EXIF; WebP info background/icc_profile/loop only; no location or device tags |
| 17 | `git -C cognate-workbench cat-file -t <SHA>` for d208cd04 and fdc709b9 | 0 | both "commit" |
| 18 | `git -C cognate-workbench show <SHA>:<screenshot path>` piped to sha256sum (6 captures) vs. sha256sum of public/captures and dist/captures files | 0 | All 6 match (byte-identical copies, e.g. e2e-03 95a4241ffea75e1f) |
| 19 | `git -C cognate-workbench show <SHA>:LICENSE`, `:NOTICE` | 0 / 128 | LICENSE = Apache 2.0 at d208cd04; NOTICE does not exist (128 = not found) |
| 20 | `git -C cognate show HEAD:LICENSE` and `HEAD:NOTICE` | 0 / 128 | Apache 2.0 root LICENSE; no NOTICE |
| 21 | sha256 + grep 'Reserved Font Name' on 3 fontsource LICENSE files | 0 | 93-line OFL-1.1 texts, RFN clause present, copyright lines (Newsreader 2020, Hanken Grotesk 2021, Martian Mono 2020) |
| 22 | `grep` for 'THIRD\|OFL' in docs and README; `grep -n webp/og.png/favicon/radix/scheduler/Phase PROVENANCE.md` | 0 | No third-party notice file; PROVENANCE.md marks scrollytelling and gsap as Phase 2 / not imported |
| 23 | Initial batch with `git -C /home/sprime01/projects/Cognate-Workbench` (glob `*Workbench*`) | n/a (shell error) | Directory is lowercase `cognate-workbench`; retried with correct path (command 17 onwards). A sandbox env-injection syntax error also appeared once in the first attempt; the retry succeeded. |

Notes: no files were edited in landing/ and no commits were made. Build output was written to /tmp/prov-build.log (the user's instruction names no path; scratch only). The two output files are actualize/artifacts/provenance-licensing/ledger.md and actualize/evidence/provenance-licensing/scan.md.
