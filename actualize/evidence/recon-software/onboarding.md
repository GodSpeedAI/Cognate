# Cognate onboarding recon (recon-software lens)

Repo: `/home/sprime01/projects/cognate` at HEAD `dd13c84`. Date of run: 2026-10-15.
Scratch: `/tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/onboard/` (full transcript at `.../onboard/transcript.log`).
No repo files were modified. Only this file was written, under the untracked `actualize/`.

## Documented route(s)

| # | Route | Where documented | Says |
|---|---|---|---|
| A | Published CLI: `bunx @godspeedai/cognate-cli@0.1 create my-app --profile copilot --source ./cognate` | `README.md:68` | Works from npm, plus a checkout for `--source` |
| B | Source checkout: `bun cognate/packages/cli/src/bin.ts create my-app --profile copilot --source .` | `docs/tutorials/start-an-app-from-a-checkout.md:13-15` | Clone-based |
| C | `bun install && bun dev`, then `/health`, then `POST /cognate.v1.RuntimeService/StartRun` | same tutorial, lines 46-107 | Expects a run to work |
| D | Skill: `references/cli.md` says "Current mode: published", pin `@godspeedai/cognate-cli@0.1` | `.agents/skills/building-with-cognate/references/cli.md:7,15` | Skill and docs disagree (see below) |
| E | Docs that say nothing is published | `docs/getting-started.md:18`, `docs/troubleshooting.md:27`, `docs/tutorials/start-an-app-from-a-checkout.md:6`, `.agents/skills/building-with-cognate/references/cognate-api.md:428` | Stale |
| F | Repo examples: `bun run example:<name>` | `package.json:19-33`, `examples/README.md` | Checkout-only |

## Executed transcript

Exit codes are real. Key output lines are quoted.

1. `npm view @godspeedai/cognate-cli name version dist-tags time.modified`: exit 0. Version `0.5.0`, `dist-tags.latest = 0.5.0`, modified `2026-10-15T13:34:39Z`. Versions 0.1.0 through 0.5.0 exist. Core `@godspeedai/cognate`, `runtime-bun`, `client`, `profile-copilot`, `domainforge` are all `0.5.0`.
2. `bun x @godspeedai/cognate-cli@0.5.0` (no args): exit 1. `cognate: usage: cognate create <dir> --profile copilot|harness --source <path> ...`
3. `bun x @godspeedai/cognate-cli@0.5.0 create my-app --profile copilot`: exit 1. `cognate create: --source is required`
4. `bun x @godspeedai/cognate-cli@0.5.0 create my-app --profile copilot --source /home/sprime01/projects/cognate`: exit 0. `created .../run1/my-app (vendored 27 package(s))`
5. `bun install` (in my-app): exit 0. `56 packages installed`. `Blocked 1 postinstall` (`@astryxdesign/core`). Non-fatal.
6. `bun test`: exit 0. `1 pass 0 fail`. The starter test only checks that `domain/example.sea` parses.
7. `bun dev --port 3111` (background): `listening on http://127.0.0.1:3111`.
8. `GET /health`: 200. `{"ok":true,"semantic":{"objects":4,...},"agents":["agent.copilot"],...}`
9. `POST StartRun` with `"input":"hello"` (a string, as in the tutorial's curl): 200 RUNNING, then `GetRun` shows `RUN_STATUS_FAILED`, `error: "undefined is not an object (evaluating 'lastUserContent(request).toLowerCase')"`.
10. `POST StartRun` with `"input":{"message":"hello"}`: 200, then `GetRun` shows `RUN_STATUS_COMPLETED`, `output: {"answer":"Hello from the Cognate starter."}`.
11. `GET /` returns 200 `text/html`. `GET /` is the Astryx chat shell.
12. SQLite `.cognate/app.sqlite` (read-only, `bun:sqlite`): event types `run.started x3, state.changed x3, run.failed x2, run.step.completed x1, message.delta x2, run.completed x1`. The `run.failed` rows are from step 9. Tables include `events`, `records`, `outbox`, `projection_checkpoints`.
13. Dev server stopped. Port 3111 confirmed closed.
14. `bun run example:human-approval` (repo, in-memory store): exit 0. `ok: run suspended on a human-approval continuation and resumed with output {"amount":75,"approved":true,"status":"refunded"}`
15. `bun run example:copilot` (repo): exit 0. `ok: copilot answered using a backend tool call: "Your refund total is 42."`
16. `bun test ./tests/integration/cli-create.test.ts` (repo, detached): `4 pass, 0 fail, 23 expect() calls, 17.01s`. This covers create, install, test, and dev for both profiles, per the test's own description. Its exit line was not captured separately, so treat exit as "pass" per bun output.
17. README literal `bun x @godspeedai/cognate-cli@0.1 create my-app --profile copilot --source /home/sprime01/projects/cognate`: exit 0. `vendored 27 package(s)`. The vendored tarballs are `godspeedai-cognate-*-0.5.0.tgz`, because `create` packs from the checkout. `bun install`: exit 0. `bun test`: exit 0, `1 pass`.
18. `npx -y skills --help`: exit 0. The skills CLI is v1.7.2.
19. `npx -y skills add GodSpeedAI/Cognate --list`: exit 0. The skills CLI cloned the GitHub repo itself (`Repository cloned`). It found 5 skills, including `building-with-cognate`. I ran no `git clone` myself.
20. `npx -y skills add /home/sprime01/projects/cognate --list`: exit 0. Local path. Found 5 skills, including `building-with-cognate`.
21. Same, with `--full-depth`: exit 0. Found 14 skills.
22. Skill install side effects check: `~/.claude/skills` and `~/.agents/skills` contain no cognate-related entries. The repo's `git status` shows only the pre-existing `?? actualize/`.

Not run: `npx skills add ... -a <agent>` (an actual install). The skills CLI installs project-level by default and global with `-g`. The scratch dir is not a git project, so the scope auto-detect could land in global agent dirs. I did not run it, so the install is unverified.

## What works today

- Published CLI `@godspeedai/cognate-cli@0.5.0` is on npm as `latest`. Its `bin` is `cognate`.
- Scaffold, install, test, and run work end to end when `--source` points at a local checkout. Verified in steps 4-12 and 17.
- The copilot starter is a deterministic, no-API-key app. `packages/cli/src/index.ts:227` wires `localProvider` with a fixed reply. The starter needs no LLM key.
- Durable event log in `.cognate/app.sqlite`. Verified in step 12.
- Repo examples `human-approval` and `copilot` pass (steps 14-15). The integration proof passes (step 16).
- The skill is discoverable from both a local path and GitHub via `skills --list` (steps 19-21).

## What is broken or requires source checkout

1. Publishing is real, but the CLI still cannot scaffold without a checkout. `create` requires `--source` (`packages/cli/src/bin.ts:33`). The published tarball ships only `src/` (verified with `npm pack` and `tar -tzf`), so the `templates/starter` tree is missing. `packages/cli/src/index.ts:97-98` then fails with `no template at ...`. A checkout is required for scaffolding.
2. The documented tutorial curl is wrong. `docs/tutorials/start-an-app-from-a-checkout.md:103-106` sends `"input":"hello"`. That produces `RUN_STATUS_FAILED` (step 9). The working body is `"input":{"message":"hello"}`. The error is opaque: `packages/provider-local/src/index.ts:20` throws a TypeError rather than a validation error at StartRun.
3. Docs say nothing is published, but npm shows 0.5.0. This is stale in `docs/getting-started.md:18`, `docs/troubleshooting.md:27`, `docs/tutorials/start-an-app-from-a-checkout.md:6`, and `.agents/skills/building-with-cognate/references/cognate-api.md:428`. The skill's `cli.md:7` says "current line: 0.1.x", but latest is 0.5.0.
4. The README's `@0.1` pin works only because `create` vendors packages from the checkout (0.5.0). The generator version and the vendored SDK version are decoupled.
5. `bunx` is not on PATH in this environment. `bun x` works. The docs use `bunx`.
6. The generated app has no `tsconfig.json` and no `typecheck` script. There is no typecheck gate for a newcomer. (Attempted `tsc`; no conclusive result.)
7. The starter has no agent test, no capability, and no approval path. Its only test checks that the `.sea` parses (`templates/starter/common/test/app.test.ts`). The approval and capability journeys exist only in checkout examples.
8. Harness profile `dev` was not executed. Its UI is health JSON only.
9. `@astryxdesign/core` postinstall is blocked by `bun install`. The app still ran.

## Skill installation options

| Option | Status | Evidence |
|---|---|---|
| `npx -y skills add GodSpeedAI/Cognate --list` | Verified discovery | exit 0, lists `building-with-cognate` (step 19). The skills CLI clones GitHub internally. |
| `npx -y skills add /home/sprime01/projects/cognate --list` | Verified discovery, local path | exit 0, lists `building-with-cognate` (step 20) |
| Actual install (`skills add ... -a claude-code -s building-with-cognate`) | Not verified | Not executed. Global-scope risk. |
| Manual copy of `.agents/skills/building-with-cognate/` | Not verified | Not executed. The skill has a companion dependency: `deriving-interaction-domain-models` and `domainforge-sea` are required (SKILL.md line 12-13). Install all three. |
| `npx skills add GodSpeedAI/Cognate --skill building-with-cognate` | Not verified | `--skill` flag exists per `--help`. Not executed. |

Also: the skill says it is installed "as a companion" and then routes to `deriving-interaction-domain-models` and `domainforge-sea`. Those are in the same repo under `.agents/skills/`, and both appear in the list. The skill is not self-contained.

## Recommended verified first-build journey

Prerequisites: a local checkout (`$COGNATE`), Bun 1.4.0, and network access to the npm registry. No API key.

```bash
export NPM_CONFIG_UPDATE_NOTIFIER=false
COGNATE=/path/to/cognate            # local checkout; required for create
mkdir -p ~/scratch && cd ~/scratch
bun x @godspeedai/cognate-cli@0.5.0 create my-app --profile copilot --source "$COGNATE"
cd my-app && bun install && bun test          # expect: 1 pass, 0 fail

bun dev --port 3111                           # leave running in a second terminal
curl -s http://127.0.0.1:3111/health          # expect ok:true, semantic.objects:4
curl -s -X POST http://127.0.0.1:3111/cognate.v1.RuntimeService/StartRun \
  -H 'content-type: application/json' -H 'authorization: Bearer tenant-a:alice' \
  -d '{"agent":"agent.copilot","input":{"message":"hello"},"idempotencyKey":"k2"}'
# returns runId; then poll GetRun with that runId until status is RUN_STATUS_COMPLETED
curl -s -X POST http://127.0.0.1:3111/cognate.v1.RuntimeService/GetRun \
  -H 'content-type: application/json' -H 'authorization: Bearer tenant-a:alice' \
  -d '{"runId":"<runId>"}'
# expect output {"answer":"Hello from the Cognate starter."}
```

Approval journey (checkout only, not in the generated app):

```bash
cd "$COGNATE" && bun run example:human-approval   # expect: ok: run suspended ... refunded
```

Acceptance check (observed): `bun test` in the app passes, `GetRun` reaches `RUN_STATUS_COMPLETED` with the expected output, and `sqlite3 .cognate/app.sqlite` (or `bun:sqlite`) shows `run.completed`.

## Prerequisites

- Bun 1.4.0 (`bun --version` = 1.4.0; `package.json` `packageManager: bun@1.4.0`; CLI `engines.bun >=1.4.0`).
- Node is only needed for `npx skills` (observed Node v26.8.2, npm 12.0.2).
- A local Cognate checkout. Required for `create`, even with the published CLI.
- Network access to the npm registry for `bun install`.
- LLM API key: none for the copilot starter. The starter's model is `localProvider`. Real providers exist (`@godspeedai/cognate-provider-openai-compatible`) but are not wired into `cognate dev`.
- Dev-only bearer token format: `Bearer <tenant>:<user>` (`docs/tutorials/start-an-app-from-a-checkout.md:109`).

## Troubleshooting observed

| Symptom | Cause | Fix |
|---|---|---|
| `cognate create: --source is required` (exit 1) | `create` always requires a checkout | pass `--source <checkout>` |
| `bunx: command not found` in this shell | `bunx` not on PATH | use `bun x` |
| StartRun returns `RUN_STATUS_FAILED` with `lastUserContent(...).toLowerCase` TypeError | agent input is `"hello"`, not `{message}` | send `{"message":"hello"}` |
| `Blocked 1 postinstall` on `bun install` | `@astryxdesign/core` postinstall | non-fatal; `bun pm trust` if needed |
| `skills add GodSpeedAI/Cognate --list` takes about 60 s | the skills CLI clones the repo | use the local path for offline checks |

## Proposed claims table

| Claim | Grade | Source |
|---|---|---|
| `@godspeedai/cognate-cli` 0.5.0 is published on npm as `latest` | VERIFIED | `npm view @godspeedai/cognate-cli dist-tags` exit 0 |
| Core SDK packages are published (`@godspeedai/cognate`, `runtime-bun`, `client`, `profile-copilot`, `domainforge`) | VERIFIED | `npm view ... version` exit 0 (steps 1) |
| Docs say nothing is published | CONTRADICTED by registry | `docs/getting-started.md:18`; `docs/troubleshooting.md:27`; `.agents/skills/building-with-cognate/references/cognate-api.md:428` |
| Published CLI `create` needs a checkout for `templates/starter` | VERIFIED | `packages/cli/src/index.ts:97-98`; `npm pack` tarball has only `src/`; `bun x ... create` without source exit 1 |
| `--source` is required | VERIFIED | `packages/cli/src/bin.ts:33`; exit 1 (step 3) |
| Scaffold with local checkout as source works | VERIFIED | step 4, exit 0, "vendored 27 package(s)" |
| Generated app installs and `bun test` passes | VERIFIED | steps 5-6, exit 0 |
| `cognate dev` serves `/health`, `StartRun`, and `/` | VERIFIED | steps 7, 8, 9, 10, 11 |
| Copilot starter run completes with `input.message` | VERIFIED | step 10; `profiles/copilot/src/index.tsx:132` |
| Tutorial's curl (string `input`) fails | VERIFIED (doc bug) | `docs/tutorials/start-an-app-from-a-checkout.md:103-106`; step 9 |
| Starter needs no LLM key | VERIFIED | `packages/cli/src/index.ts:227`; run completed without env vars (step 10) |
| Durable events in `.cognate/app.sqlite` | VERIFIED | step 12 (`bun:sqlite` read-only query) |
| Human-approval journey works | VERIFIED (checkout example) | `bun run example:human-approval` exit 0 (step 14); `examples/human-approval/index.ts:24` |
| Copilot backend-tool example works | VERIFIED (checkout example) | `bun run example:copilot` exit 0 (step 15) |
| create, install, test, dev proof for both profiles | VERIFIED | `bun test ./tests/integration/cli-create.test.ts` 4 pass (step 16) |
| README `@0.1` pin works | VERIFIED (generator only) | step 17; vendored SDK is 0.5.0, not 0.1 |
| `bunx` is on PATH | NOT VERIFIED / false here | `bunx` exit 127; `bun x` works |
| Generated app typechecks | UNVERIFIED | no `tsconfig.json` in generated app; no `typecheck` script |
| Skill is discoverable via `skills` | VERIFIED (list only) | steps 19-21, exit 0 |
| Skill installs into an agent | UNVERIFIED | not executed (global-scope risk) |
| Skill pin `@godspeedai/cognate-cli@0.1` matches current release | CONTRADICTED | `.agents/skills/building-with-cognate/references/cli.md:7`; latest is 0.5.0 |
| Harness profile `dev` works | UNVERIFIED | not executed; covered only by the integration test |

## Unknowns

- Whether the skills CLI install writes only to project scope when the scratch dir has no `.git`. Not tested.
- Whether a generated app with `--with` extras works. `--with` was not exercised.
- Whether 0.5.0 `dev` works with a real provider. Only `localProvider` was exercised.
- Whether the skill, when used by an agent, actually produces a passing app. The skill is a guide; no agent run was attempted.
- Why the package was published at `13:34Z` today, and whether the docs describe an older state. The publish timing suggests a just-completed release.

## Opportunities (record, do not implement)

1. Reconcile docs with the registry. Update the five stale "not published" statements and the skill's `0.1.x` pin to match `0.5.0`.
2. Fix the tutorial's curl (`input` must be an object). This is a one-line doc fix with a high payoff: it is the first thing a newcomer copies.
3. Validate `StartRun` input against the agent's declared input shape, so a bad input yields `invalid_argument`, not a TypeError from `provider-local`.
4. Ship `templates/starter` inside the CLI tarball (or fetch it from npm), so `create` works without `--source`. This closes most of DEBT-016's user-facing gap.
5. Add an approval-bearing copilot starter variant (`requiresApproval: true` backend tool) so the first app demonstrates the human-approval journey, not only the echo.
6. Add a `typecheck` script and `tsconfig.json` to the starter, or remove `typecheck` from docs.
7. Make the skill self-contained or document that the companion skills must be installed too. The skills list shows all three in the same repo.
8. Document `bun x` alongside `bunx` for shells without the bin on PATH.
9. Consider `skills add` target-dir docs for scratch/CI installs. The current docs do not say what the default scope is.
