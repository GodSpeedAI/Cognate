# Subsystem: the reconstruction harness

Everything outside `cognate/` exists to answer one question: *can this framework reproduce a
third-party product's behaviour without inheriting that product's assumptions?* This page describes
the machinery that answers it.

## Purpose

Pin a reference product, drive both it and the reconstruction through one interface, and record
behavioural, visual, and architectural evidence — with every intentional difference written down
rather than discovered later.

## Responsibilities

- Pin and relaunch the reference at an exact commit, with isolated state.
- Provide one deterministic model endpoint so both systems see identical scripted behaviour.
- Provide a shared `Driver` interface so one journey script drives either system.
- Capture screenshots and accessibility trees at named checkpoints.
- Diff the screenshots and record the result as evidence, not as a pass/fail gate.
- Enforce nine architectural criteria about the reconstruction and the framework.
- Review the output in rounds and record findings and dispositions.

## Non-responsibilities

- It does not decide parity. `compare.ts` states this in its own header: "This is evidence, not a
  gate". Humans and critic rounds judge.
- It does not test the app's internals. That is `cognate/test/`. The harness only sees the interface.
- It does not copy reference source. That is a *prohibition*, enforced by
  `tests/architecture/no-copied-source.test.ts`.
- It does not need the reference to build or test the app. Criterion 8 proves the app works with the
  reference checkout physically moved off disk.

---

## The pieces

### `reference-manifest.json`

The pin. `deepseek-ai/deepseek-harness` at commit `477b4f420553e8a52c2fbccc464d7561b239c443`,
`@deepseek-ai/dsh-root@0.1.7-rc.2`, captured 2026-09-26, launched as
`DSH_HOME=<isolated-dir> pnpm dsh web --no-open --port 3080`. It also records the awkward operational
facts needed to reproduce the launch: the `nub` pnpm shim refuses to run from a directory containing
a `bun.lock`; the broken `corepack`; the Playwright Chromium revision that had to be forced. It
documents the token-in-URL handoff (the process prints one line containing `?token=…`; a browser
navigating to it establishes a cookie session) and confirms `DSH_HOME` fully redirects state.

### `fixtures/mock-model/server.ts`

A dependency-free Bun server speaking OpenAI Chat Completions, both streaming and non-streaming. This
is the single most load-bearing fixture in the repository: it is what makes "the model" a controlled
input for both systems.

Its design decision worth knowing: **there is no server-side session state** for the scripted
scenarios. A `[[scenario:<name>]]` marker in the last user message selects a script, and the "step"
within that script is *the number of `tool`-role messages after that user message*. The same request
history therefore always produces the same response, with no memory needed. The one exception is the
`retry` scenario, keyed on an FNV-1a hash of the message history, cleared by `POST /__reset`.

| Scenario | Script |
|---|---|
| `plain` | a streamed markdown answer (heading, list, fenced `ts` block) |
| `read` | `read(README.md)` → summary |
| `edit` | `read` → `edit` (`Hello` → `Howdy`) → summary |
| `shell` | `bash(git status --short)` → `bash(ls)` → summary |
| `multi` | `read` → `bash` → `edit` → summary (journey C) |
| `approval` | `run_code` with `sandbox_permissions: "workspace-write"` + justification → reflect the tool result |
| `plan` | `todo_write` → `exit_plan_mode` → reflect the decision |
| `delegate` | `subagent(prompt containing [[scenario:child]])` → reflect; the child answers via `child` |
| `child` | one plain sentence |
| `error` | HTTP 500 with an OpenAI-shaped error body, every time |
| `interrupt` | a few words, then one chunk every 2s for up to 60s (stream-only) — the Stop-button target |
| `retry` | first request per history hash fails 500, later ones succeed |

`__REFLECT_TOOL_RESULT__` is a placeholder meaning "answer with the last tool message's content,
prefixed `Tool result: `". That is how the harness observes *what the app fed back to the model* —
including the exact approval-denial wording, which is why that string is a test assertion.

Two control endpoints exist because this server always runs out-of-process (Playwright workers run
under plain Node, and a test process cannot import another tranche's in-memory state): `POST /__reset`
and `GET /__abort-count`, the latter incremented on a streaming request's abort signal. It is how
`J-H-cancellation` proves the connection really closed rather than just an in-process flag flipping.

`fixtures/workspace/make-workspace.ts` generates a deterministic fixture project (`template/`:
`package.json`, `README.md`, `notes.txt`, `src/greet.ts`) so tool effects are observable on disk.

### `tests/drivers/`

`types.ts` defines the `Driver` interface: 20-odd methods covering launch/stop, authentication,
dialogs, settings, model configuration, workspace choice, session lifecycle, sending, idling,
approving/denying, reloading/restarting, plan mode, and the subagent list — plus 14 locators.

Two design points carry the whole approach:

1. **Branding and selector differences are absorbed in the driver, never in the spec.** A spec reads
   `driver.locators.approvalPanel(page)` and never mentions either product.
2. **`Expectations` are the *only* sanctioned divergence.** Two named booleans/strings —
   `approvalSurvivesRestart` and `providerErrorCode` — each carrying a citation explaining why the two
   systems legitimately differ. A spec reads the expectation rather than branching on which system it
   is driving, so the assertion stays identical and only the expected value changes.

`prepareApprovalTrigger` is the clearest example: the reference needs the PTC agent preset and a Read
Only access mode for its escalation to be real; Cognate's default already ranks below
`workspace-write`, so it is a no-op there. The doc comment lives in the interface, not in a spec.

### `tests/journeys/`

Eight Playwright spec files (`A-first-use` … `H-cancellation`, eleven test cases) written against the
interface, plus `harness.ts` (system selection, per-journey fresh home + fresh workspace + its own
mock-model port, and evidence helpers) and `run.ts`.

`run.ts` runs the suite for `SYSTEM=reference` then `SYSTEM=cognate` with `--retries=2 --workers=1`,
then classifies each journey as `passed | failed | flaky | timedOut | skipped` and writes
`results/<system>.json`, `results/.raw-<system>.json`, and `results/summary.md`. **A journey that
passes on retry is recorded as `flaky`, not folded into `passed`** — which is why the summary shows
`FLAKY` rows for the reference on D-approval/deny and F-delegation.

### `tests/capture/` and `tests/visual/`

`reference.capture.ts` plus two extra scripts drive the reference to 28 named checkpoints;
`cognate.capture.ts` mirrors the same names, viewports, and animation-disabling against the
reconstruction, and writes `cognate/screenshots/<viewport>/NN-name.png` and
`cognate/observations/aria/*.txt`. Viewports are desktop 1440×900 and laptop 1024×768.

`compare.ts` walks every checkpoint present in *both* sides, pads canvases to equal size, runs
`pixelmatch`, and writes a triptych (reference | cognate | diff) to `diffs/<viewport>/` plus
`diffs/summary.md`. It skips viewports where either side is missing rather than failing.

**Portability note:** `compare.ts` hardcodes
`const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness"`. The
capture scripts and drivers resolve their own paths; this one file does not. On any checkout at a
different path it silently produces nothing, because the `existsSync` guard skips both viewports.

### `tests/architecture/`

Nine criteria, each a test file, all reported PASS in `architecture-evidence.md`:

| # | Criterion | File |
|---|---|---|
| 1 | No dependency on the reference package family in any manifest or `bun.lock` | `dependency-hygiene.test.ts` |
| 2 | No import resolving into the reference checkout, including the **built browser bundle** | `no-reference-imports.test.ts` |
| 3 | No copied reference source (8-line normalized shingles) or byte-identical asset | `no-copied-source.test.ts` |
| 4 | No reference-specific primitive in the framework; every added export traceable to a declared finding | `framework-purity.test.ts` |
| 5 | The app never imports the kernel implementation directly | `cordis-boundary.test.ts` |
| 6 | Event history is authoritative: projections rebuild identically after their state is deleted | `event-history-authoritative.test.ts` |
| 7 | The `.sea` grammar engine and RealityTrace are unmodified | `domainforge-realitytrace-unchanged.test.ts` |
| 8 | The app works after the reference checkout is physically removed | `reference-removed.sh` + `.log` |
| 9 | The cognitive index is not load-bearing | `no-cognition-used.test.ts` (vacuously true — the app uses no cognition) |

Two of these are worth understanding rather than merely running. Criterion 2 boots the real app and
fetches the actual `/app.js` the server built, instead of reimplementing the bundler call. Criterion 6
snapshots four projections across a tool turn, a plan turn, an approval turn, and a delegation,
deletes their rows directly in SQLite, restarts, and asserts the rebuild is deep-equal.

Criterion 4 is a *governance* test: it diffs `packages/` and `profiles/` against the merge-base with
`main` and requires every added symbol to be declared in the plan's Findings section, with the four
findings (D1, D2, G1, F3) each independently confirmed present in that document.

### `critic/`

Seventeen files: rounds 1–7 of review findings, with dispositions. Round 6 is the full-scope
`APPROVE`; round 7 covers the Work details feature. This is where "looks right in the JSON" becomes
"a person checked the pixels".

---

## Two harnesses, not one

| | Journey suite | Screenshot capture + compare |
|---|---|---|
| Driver | `tests/drivers/` (shared interface) | `tests/capture/` (imperative scripts) |
| Judgement | assertions, per system | a human looking at triptychs |
| Output | `tests/journeys/results/` | `cognate/screenshots/`, `diffs/`, `critic/` |
| Reference needed | yes, to compare | yes, to produce a diff |
| Gate? | yes | no, explicitly |

## Running it

```bash
# App-level journey tests (no reference needed)
cd cognate && bun test test

# Journey suite against the reconstruction
cd tests && bun run journeys:cognate          # both: bun run journeys

# Screenshots + diffs (mock model must be running for the capture scripts)
cd tests
bun run capture/cognate.capture.ts desktop 1440 900 /tmp/cg-home-desktop 3182 /tmp/cg-ws-desktop
bun run capture/cognate.capture.ts laptop  1024 768 /tmp/cg-home-laptop  3183 /tmp/cg-ws-laptop
bun run visual/compare.ts

# Architectural criteria
bun test tests/architecture                    # from the app root
bash tests/architecture/reference-removed.sh   # slow: reinstalls and rebuilds
```

## Failure modes

| Symptom | Cause |
|---|---|
| `compare.ts` writes nothing | the hardcoded `ROOT` does not match this checkout's path |
| Journey suite refuses to start | `SYSTEM` is neither `reference` nor `cognate` — `harness.ts` throws on anything else |
| Reference journeys fail to launch | the reference checkout is not at the path in `reference-manifest.json` |
| `pnpm` refuses to run from the repo root | the `nub` shim and a `bun.lock` in the same directory; run from inside the clone |
| `no-copied-source.test.ts` skips | the reference checkout is absent, so the comparison cannot run for real |
| A journey is `FLAKY` on the reference only | expected; the reference is a real product, this reconstruction is deterministic |
| `reference-removed.sh` takes minutes | it reinstalls and rebuilds the whole workspace |

## Extension points

- A new journey: add a `K-*.spec.ts` under `tests/journeys/`, a matching `J-*.test.ts` under
  `cognate/test/`, and an IDM journey instance. →
  [../how-to/add-a-journey-test.md](../how-to/add-a-journey-test.md)
- A new driver method: add it to `Driver` and implement it in both drivers. The interface is the
  contract that keeps specs system-agnostic.
- A new checkpoint: add it to both capture scripts with the same name, then re-run compare.
- A new architectural criterion: add a file under `tests/architecture/` and a row in
  `architecture-evidence.md`.

## Source trail

- `reference-manifest.json` — the pin, the launch, the auth handoff, the environment notes
- `fixtures/mock-model/server.ts:58-202` — the scenario scripts
- `fixtures/mock-model/server.ts:226-243` — scenario/step derivation from the message history
- `fixtures/mock-model/server.ts:258-264` — `__REFLECT_TOOL_RESULT__`
- `fixtures/mock-model/server.ts:335-346` — the `retry` scenario's history-hash keying
- `fixtures/mock-model/server.ts:403-433` — `streamInterrupt`, the Stop-button target
- `fixtures/mock-model/server.ts:462-464` — `GET /__abort-count`
- `fixtures/README.md` — the scenario table and how to point a system at the mock
- `tests/drivers/types.ts:31-53` — `Expectations`, the only sanctioned divergence
- `tests/drivers/types.ts:104-120` — `prepareApprovalTrigger`, `sendInPlanMode`
- `tests/journeys/harness.ts:75-87` — `currentSystem`, `makeDriver`
- `tests/journeys/run.ts:1-10` — the runner's contract, including the flake rule
- `tests/journeys/results/summary.md` — the last recorded run
- `tests/visual/compare.ts:1-18` — "evidence, not a gate"; the hardcoded `ROOT` at line 20
- `tests/architecture/framework-purity.test.ts:40-74` — the Findings traceability check
- `architecture-evidence.md` — the nine criteria and how to run them
- `cognate/observations/aria/`, `reference/observations/aria/` — the accessibility trees
- `critic/round-6.md`, `critic/round-7.md` — the final reviews
