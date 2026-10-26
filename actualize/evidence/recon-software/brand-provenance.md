# Brand and Provenance Recon (read-only)

Date: 2026-10-15. Every fact below cites a path or command. Nothing in any repo was modified.

## A. GodSpeed AI branding and language guidelines

### What exists

| Asset | Path |
|---|---|
| Brand voice (canonical draft v0.3) | `/home/sprime01/projects/godspeed-growth/implementation/archive/voice-sources/godspeed_brand_voice_style_guide_v0_3.md` |
| Brand voice (working copy) | `/home/sprime01/projects/godspeed-growth/brand/voice/godspeed-brand-voice.md` |
| Website voice / tone calibration | `/home/sprime01/projects/godspeed-growth/brand/voice/website-voice.md` |
| Company LinkedIn voice | `/home/sprime01/projects/godspeed-growth/brand/voice/company-linkedin-voice.md` |
| Founder voice | `/home/sprime01/projects/godspeed-growth/brand/voice/sam-founder-voice.md` |
| Extraction notes | `/home/sprime01/projects/godspeed-growth/implementation/archive/voice-sources/godspeed_brand_language_extraction_notes.md` |
| Brand guardian skill (copy gate) | `/home/sprime01/projects/godspeed-growth/.claude/skills/godspeed-brand-guardian/SKILL.md` (references `brand/voice/banned-language.md`, which was not found in the tree) |
| Logos (PNG, 4 variants) | `/home/sprime01/projects/godspeed-growth/brand assets/godspeed-logo-w-wordmark-*.png` |
| Logos (SVG and PNG, site) | `/home/sprime01/projects/godspeed-growth/site/public/*-godspeed-logo.svg`, `.../godspeed-logo-wordmark-white.png` |
| Godspeed Compass design system | `/home/sprime01/projects/godspeed-compass/design.md` |

No palette or typography file exists in the brand/ dir. Colors and fonts are only in code. The site CSS (`godspeed-growth/site/src`) uses hex values #F7F3EA, #D7A84A, #05080C, #05070A and #003153, with CSS-variable font families.

### Key rules (quoted)

Voice doc `godspeed-brand-voice.md`:
- L35: "GodSpeed is here to name the delivery absurdities serious people have normalized because nobody gave them a better operating layer."
- L59: "Avoid writing that only says GodSpeed is fast, innovative, safe, secure, powerful, or intelligent."
- L150-151: "Use Speed Mode to win attention. Use Journey Mode to earn trust. Never collapse both into a single line."
- L163 (attribute table): "Radically candid", "Dryly funny: wit deployed at substrate failures, not at people", "Hard on broken structures, never on the people inside them".
- L207 (term table): owned terms include Governed, Authority precedes autonomy, Evidence-governed execution, Epistemic infrastructure, Governance theater. "Do not weaken them with generic rewrites."

Style guide v0.3 (`godspeed_brand_voice_style_guide_v0_3.md`):
- L890: "Write with rigorous clarity, dry humor, and infrastructure-level seriousness. Be bold but not hype-driven. Make fun of broken systems and absurd enterprise AI theater, never the people trapped inside those systems."
- L907-910: "Never imply proprietary hostage-taking." "Never mock customers." "Never claim enterprise readiness without proof." "Never call SEA-Forge AGPL or open source unless the license changes."
- L948: a "Banned AI writing patterns" section.
- L1128: "Avoid too many jokes. One sharp line is enough."

Brand Guardian SKILL.md (L44, L85): copy must not contain banned-list phrases; BLOCKED or REVISE verdicts escalate to Sam.

Naming: GodSpeed uses owned terms (Governed, Governed Speed, Syntelligent infrastructure, DomainForge, SEA-Forge). Don't rename them.

### Cognate logo or mark
- No Cognate logo, wordmark or brand directory exists in `/home/sprime01/projects/cognate`. Searches for `*logo*`, `*brand*`, `favicon*` and `*mark*.svg` (excluding `.tmp`, `node_modules`, `.git`) returned only `cognate/docs/.viewer/favicon.svg`. That file is a docs-viewer favicon, not a brand mark.
- Tokens and DESIGN files exist, but they are product UI and not brand identity: `cognate/validation/reconstructions/copilot/DESIGN.md` and `cognate/validation/reconstructions/deepseek-harness/cognate/DESIGN.md`. The second one is "Cognate Console" (`redesign/` dir); the first is "Cognate Copilot Reconstruction".

## B. Previous landing-page prototype (for avoidance only)

- No marketing or landing-page website exists in the Cognate repo. `find cognate -type d -iname '*landing*' -o -iname '*website*' -o -iname 'site' -o -iname 'www'` (excluding `node_modules`, `.git`, `.tmp`) returned nothing.
- `git log --all --oneline -- '*landing*' '*website*' '*site*'` returned no commits. `git log --all --grep=landing|website` matched only app UI commits: `1354de3` ("hero landing" in the app's first-run state) and `81e7072` ("Redesign Cognate Console UI with Hallmark + Impeccable").
- The only "hero landing" lives in the app UI at `cognate/validation/reconstructions/deepseek-harness/cognate/src/ui/App.tsx` and `.../src/ui/app.css`. This is a chat-app shell, not a site.
- `docs/.viewer/` (`index.html`, `viewer.css`, `tokens.css`) is a doc viewer. It is not a landing page.
- Sibling repos: no `*landing*` or `*cognate*` landing directory under `/home/sprime01/projects` (listing via `ls`).
- Branches (`git branch -a`, 72 lines) include no landing or website branch.
- Design approach to avoid: the current app design (`DESIGN.md`, "modern-minimal", "Cobalt" theme, "one signal accent", three surface registers). It is explicitly a single-shell app, not a marketing site. Do not reuse its tokens for a landing page.

## C. Product Actualizer reference

- Path: `/home/sprime01/projects/product-actualizer`.
- `website/package.json` does NOT exist. The site is built by hand-rolled scripts: `website/build.mjs`, `website/serve.mjs`, `website/qa.mjs` (all Bun). The root `package.json` is the build source of truth.
- Root `package.json` (name `product-actualizer`):
  - scripts: `test` (`bun run typecheck && bun test && python3 tests/check.py`), `build` (`bun run cockpit/build.ts`), `typecheck` (`tsc`).
  - deps: `react` 19.3, `@xyflow/react` 12.12, `dockview-react` 8.4, `zod` 4.6, `@tanstack/charts` 0.18.
  - dev: `playwright-core` 1.63, `typescript` 7.0.2, `@types/bun` 1.4.2.
- Visual style (`brand/README.md`, `brand/tokens.css`): quiet, dense, legible. Colour is a data channel; one accent (Instrument Teal, `oklch(50.1% 0.091 224)`); no gradients, glow, glass, or orbs. Two fonts: Atkinson Hyperlegible Next (text) and JetBrains Mono (stamps, grades). Signature is a "built_from" stamp line and a grade chip.
- Do not copy the brand. Reusable tooling: Bun build scripts (`website/build.mjs`, `website/serve.mjs`, `website/qa.mjs`) and the Playwright-core QA pattern.

## D. Provenance and licensing

### Licenses
- Cognate `LICENSE` (`/home/sprime01/projects/cognate/LICENSE`): Apache License 2.0.
- Cognate-Workbench `LICENSE` (`/home/sprime01/projects/cognate-workbench/LICENSE`): Apache License 2.0. `README.md` line 160: "Apache License 2.0".
- `cognate/package.json` has no `license`, `author`, or `repository` field. Its name is `cognate-workspace`.
- `cognate-workbench/package.json` has name `@godspeedai/cognate-workbench` and no license/author fields. The `@godspeedai` scope matches GodSpeedAI.

### Authorship
- `git log` in cognate: 144 commits by "Sam Prime", 32 by "SPRIME01", 10 by github-actions bot, 4 by "Claude".
- `git log` in cognate-workbench: 26 "Sam Prime", 26 "SPRIME01".
- GitHub repo owner (`gh api repos/GodSpeedAI/Cognate-Workbench/branches`): `GodSpeedAI`.

### Screenshot reuse
- Workbench is Apache-2.0, same owner (`@godspeedai`, `GodSpeedAI`, Sam Prime). Apache-2.0 permits use and redistribution with attribution and the license notice. Using Workbench screenshots on Cognate's site is therefore allowed. Confirm the screenshots themselves are first-party before using them, since `cognate-workbench/.tmp/donor/...` contains donor-derived reconstruction images.

### Font and animation libs already in cognate
- Root `package.json` dev deps: `@fontsource-variable/inter` 5.3.0, `@fontsource-variable/jetbrains-mono` 5.3.0, `@fontsource-variable/space-grotesk` 5.3.0. These appear in `bun.lock`. Also `playwright` 1.63.0, `playwright-core` 1.63.0, `vitest`.
- gsap, motion, framer-motion, lenis: NOT installed in node_modules, not in bun.lock.
- Note: the Godspeed reflex-reject list (`godspeed-growth/.../implementation/archive/voice-sources/godspeed_brand_voice_style_guide_v0_3.md`, "Reflex-reject list") includes Inter, Space Grotesk, Fraunces, IBM Plex Mono, Instrument Sans, Instrument Serif. Cognate's existing deps conflict with that list (Inter, Space Grotesk).

### npm view results (licence, version)
| Package | License | Version | Notes |
|---|---|---|---|
| astro | MIT | 7.4.0 | |
| vite | MIT | 8.3.4 | |
| gsap | "Standard 'no charge' license" | 3.15.0 | NOT OSI. Check terms before shipping. |
| motion | MIT | 14.3.0 | |
| lenis | MIT | 1.3.27 | |
| @fontsource-variable/inter | OFL-1.1 | 5.3.0 | |
| @fontsource-variable/fraunces | OFL-1.1 | 5.3.0 | |
| @fontsource/ibm-plex-mono | OFL-1.1 | 5.3.0 | |
| @fontsource-variable/jetbrains-mono | OFL-1.1 | 5.3.0 | |
| @fontsource-variable/instrument-sans | OFL-1.1 | 5.3.0 | |
| @fontsource/instrument-serif | OFL-1.1 | 5.3.0 | |
| @fontsource-variable/space-grotesk | OFL-1.1 | 5.3.0 | |
| playwright | Apache-2.0 | 1.64.1 | Cognate pins 1.63.0 |
| @axe-core/playwright | MPL-2.0 | 4.14.0 | File-level copyleft. Fine as a dev dep. |

Commands: `npm view <pkg> license version` (run from `/tmp`; npm prints a `trust-policy-exclude` warning, harmless).

## E. Tooling on this machine

| Tool | Path | Version |
|---|---|---|
| node | `/home/sprime01/.nub/node-shim/node` | v26.8.2 |
| bun | `/home/sprime01/.local/bin/bun` | 1.4.0 |
| npm | `/home/sprime01/.nub/shims/npm` | 12.0.2 |
| npx | `/home/sprime01/.nub/shims/npx` | 12.0.2 |
| playwright (npx --no-install) | via cognate workspace | 1.63.0 pinned in package.json; `npx playwright --version` printed the workspace banner, version not captured |
| agent-browser | `/home/sprime01/.local/share/mise/shims/agent-browser` | version not captured (command not run) |
| playwright-cli | `/home/sprime01/.local/share/pnpm/playwright-cli` | version not captured (command not run) |
| chromium / chromium-browser | NOT FOUND on PATH | |
| google-chrome | `/usr/bin/google-chrome` | version not captured |

Playwright browser cache: `~/.cache/ms-playwright` contains `chromium-1243`, `chromium_headless_shell-1243`, and `daemon`. Playwright chromium is installed even though no system chromium is on PATH.

## Notes
- Two context-mode batches (A4 and E1) failed on a wrapper quoting issue, so their commands were rerun directly with Bash. The results above come from those reruns.
- No secrets were printed. The one author email output was redacted.
