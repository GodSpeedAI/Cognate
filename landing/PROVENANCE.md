# Provenance and licenses

What is in `dist/`, where each file came from, and the notices that go with it. The full notice text is generated into `dist/THIRD_PARTY_NOTICES.txt` by `scripts/notices.ts` on every `bun run build`, and linked from the site footer. The same text is also in `dist/licenses/`.

## Workbench captures (Apache-2.0, GodSpeedAI)

Two kinds of file are shipped for each capture:

- **PNG** (`public/captures/**/*.png`, copied to `dist/captures/`): byte-identical to the file in the Cognate-Workbench repository. Copied with `git show <sha>:<path>`. Verified: the sha256 of each public PNG equals the sha256 of the git blob at the listed SHA. No pixels were edited.
- **WebP** (`public/captures/**/*.webp`, copied to `dist/captures/`): **lossy derivatives**, not originals. `scripts/assets.ts` (`writeWebpDerivatives`) draws each PNG at native size on a canvas, then re-encodes with `canvas.toBlob(type=image/webp, quality=0.9)` in Chromium. The WebP files are modified copies under Apache-2.0 section 4(b). The notice file says so.

| File (under `public/captures/`) | Repo | Commit | Source path |
|---|---|---|---|
| `workbench/e2e-03-contract-complete.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-03-contract-complete.png |
| `workbench/e2e-05-authority-and-blocked.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-05-authority-and-blocked.png |
| `workbench/e2e-07-review-gate.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-07-review-gate.png |
| `workbench/e2e-08-accepted.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-08-accepted.png |
| `workbench-expert-teams/default-team-desktop.png` | GodSpeedAI/Cognate-Workbench (unmerged branch) | fdc709b9ccff47d52619185f6e9e03fdd9ae8d08 | screenshots/experts/default-team-desktop.png |
| `workbench-expert-teams/team-conversation-handoff-desktop.png` | GodSpeedAI/Cognate-Workbench (unmerged branch) | fdc709b9ccff47d52619185f6e9e03fdd9ae8d08 | screenshots/experts/team-conversation-handoff-desktop.png |

The Workbench `LICENSE` at commit d208cd04 is Apache-2.0 and is byte-identical to the Cognate project `LICENSE`, which is vendored as `licenses/Apache-2.0.txt`. The repository has no NOTICE file at either commit. The expert-teams captures come from an unmerged branch and are captioned as such on the page.

## Other generated images

- `public/og.png` (1200x630): a screenshot of this site's `/keyframe/` stage, taken by `scripts/assets.ts` (`writeOgImage`). It is project output under the Cognate Apache-2.0 license.
- `public/favicon-32.png`: rendered from `public/favicon.svg` by `scripts/assets.ts`.
- `public/favicon.svg`: hand-authored project file, added in commit 30eefc4. Project output under Apache-2.0.

Image metadata: PNG and WebP files carry no EXIF or GPS tags (checked with PIL).

## Runtime JavaScript (bundled into `dist/_astro/*.js`)

Versions are the installed ones. Each license text is in the notice file.

| Package | Version | License | Where it ships |
|---|---|---|---|
| astro (client runtime) | 7.4.0 | MIT | `dist/_astro/client.*.js` |
| @astrojs/react | 7.1.0 | MIT | React island hydration |
| react | 19.3.1 | MIT | `dist/_astro/react.*.js` |
| react-dom | 19.3.1 | MIT | `dist/_astro/react-dom.*.js` |
| scheduler | 0.28.0 | MIT | inlined in the react-dom chunk |
| @bsmnt/scrollytelling | 0.3.3 | MIT | Sequence C and G scroll pinning |
| @radix-ui/react-slot | 1.5.0 | MIT | inlined via scrollytelling |
| @radix-ui/react-portal | 1.2.0 | MIT | inlined via scrollytelling |
| @radix-ui/react-primitive | 2.2.0 | MIT | inlined via scrollytelling |
| @radix-ui/react-compose-refs | 1.1.5 | MIT | inlined via scrollytelling |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT | inlined via scrollytelling |
| gsap | 3.15.0 | Standard "No Charge" GSAP License (not OSI) | scroll choreography (`dist/_astro/*.js`) |

Notes:

- **@bsmnt/scrollytelling** is shipped. The npm package has no license field and no LICENSE file. The MIT text (copyright basement.studio 2023) is vendored as `licenses/scrollytelling-MIT.txt`, from the copy in the product-actualizer scrollytelling skill folder. It has not been checked against the upstream repository. Open item.
- **gsap** is shipped. Its npm package has no LICENSE file. Its `package.json` declares the Standard "No Charge" GSAP License. The license permits use on websites, prohibits use in competing visual-animation builder tools and reverse engineering to build such tools, and requires proprietary notices to stay intact. This site is a static landing page, not a builder tool. The notice points to https://gsap.com/standard-license. Only the clauses quoted in `licenses/GSAP-standard-no-charge.txt` are vendored, not the full text. Open item: vendor the full text.

## Fonts (SIL Open Font License 1.1)

Self-hosted woff2 files from the fontsource variable packages. The OFL text, with each family's copyright line, is in `dist/licenses/OFL-<family>.txt` and in the notice file.

| Family | Package | Version | Copyright |
|---|---|---|---|
| Newsreader | @fontsource-variable/newsreader | 5.3.0 | The Newsreader Project Authors (2020) |
| Hanken Grotesk | @fontsource-variable/hanken-grotesk | 5.3.0 | The Hanken Grotesk Project Authors (2021) |
| Martian Mono | @fontsource-variable/martian-mono | 5.3.0 | The Martian Mono Project Authors (2020) |

The fonts are not modified or renamed, so the Reserved Font Name clauses do not apply. No external requests are made at runtime; the fonts are served from this site.

## Build and development dependencies (not shipped)

These are not in `dist/`, so they are not in the notice file: `@astrojs/check`, `@axe-core/playwright`, `@playwright/test`, `playwright` (Apache-2.0), `typescript` (Apache-2.0), `@types/*` (MIT).
