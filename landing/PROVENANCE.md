# Provenance and licenses

## Captures (Apache-2.0, GodSpeedAI)

Copied byte-for-byte with `git show <sha>:<path>` from the read-only Cognate-Workbench repo. No pixels were edited and no derivatives were made (rule R8). Cognate-Workbench is Apache-2.0 (C30).

| File (under `public/captures/`) | Repo | Commit | Source path | Size |
|---|---|---|---|---|
| `workbench/e2e-03-contract-complete.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-03-contract-complete.png | 1440x900 |
| `workbench/e2e-05-authority-and-blocked.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-05-authority-and-blocked.png | 1440x900 |
| `workbench/e2e-07-review-gate.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-07-review-gate.png | 1440x900 |
| `workbench/e2e-08-accepted.png` | GodSpeedAI/Cognate-Workbench | d208cd0491d5d76839ed4dedbababc589383ad09 | screenshots/workbench/e2e-08-accepted.png | 1440x900 |
| `workbench-expert-teams/default-team-desktop.png` | GodSpeedAI/Cognate-Workbench (branch) | fdc709b9ccff47d52619185f6e9e03fdd9ae8d08 | screenshots/experts/default-team-desktop.png | 1440x900 |
| `workbench-expert-teams/team-conversation-handoff-desktop.png` | GodSpeedAI/Cognate-Workbench (branch) | fdc709b9ccff47d52619185f6e9e03fdd9ae8d08 | screenshots/experts/team-conversation-handoff-desktop.png | 1440x900 |

Captures are from Workbench's own E2E run (C41). The expert-teams captures come from an unmerged branch (C40) and are captioned as such.

## npm dependencies (direct)

Versions are exact (no `^` or `~`). Licenses come from each installed package's `package.json`.

| Package | Version | License | Use |
|---|---|---|---|
| astro | 7.4.0 | MIT | Static site build |
| @astrojs/react | 7.1.0 | MIT | React islands |
| react | 19.3.1 | MIT | UI |
| react-dom | 19.3.1 | MIT | UI |
| gsap | 3.15.0 | GreenSock "Standard 'no charge'" license (https://gsap.com/standard-license). It is free for this use and is not MIT. | Scroll choreography (Phase 2) |
| @bsmnt/scrollytelling | 0.3.3 | MIT (the npm package has no license field; the MIT LICENSE is taken from the upstream repo copy in the product-actualizer scrollytelling skill folder) | Scroll API (Phase 2; not imported in Phase 1) |
| @fontsource-variable/newsreader | 5.3.0 | OFL-1.1 | Display type |
| @fontsource-variable/hanken-grotesk | 5.3.0 | OFL-1.1 | Text/UI type |
| @fontsource-variable/martian-mono | 5.3.0 | OFL-1.1 | Mono type |
| playwright | 1.63.0 | Apache-2.0 | Screenshots (dev) |
| typescript | 6.0.3 | Apache-2.0 | Type checking (dev) |
| @astrojs/check | 0.9.10 | MIT | `astro check` (dev) |
| @types/react | 19.3.0 | MIT | Types (dev) |
| @types/react-dom | 19.3.0 | MIT | Types (dev) |
| @types/bun | 1.4.3 | MIT | Types (dev) |
| @types/node | 26.6.5 | MIT | Types (dev) |

Fonts are self-hosted from the fontsource packages. No external network requests are made at runtime.
