# Testing and verification

Four suites, each proving something different. This page is about which one to run and what it can
establish.

## The suites at a glance

| Suite | Command | Needs the reference? | Gate? | Proves |
|---|---|---|---|---|
| App journey tests | `cd cognate && bun test test` | no | **yes** | behaviour, event order, exact strings, real filesystem effects, restart durability |
| Architectural criteria | `bun test tests/architecture` | mostly no (two tests want it present) | **yes** | the reconstruction is independent of the reference and does not cheat |
| Playwright journeys | `cd tests && bun run journeys` | yes, for the reference side | yes | the same journeys through a real browser, on both systems |
| Screenshot capture + compare | `cd tests && bun run visual/compare.ts` | yes, to diff | **no** — evidence only | appearance and accessible-name structure |

Plus `bun run typecheck` in `cognate/`, which is its own project extending the repository root's.

## 1. The app journey tests

```bash
cd cognate
bun test test
```

**Last recorded result: 21 tests across 11 files, 21 pass, 0 fail, 123 `expect()` calls, ~26s.**

The heaviest of the suites by far, because each test boots a real server on port 0 with a temp home
and a real mock-model child process on its own port. No mocking of the runtime; the app under test is
the app.

| File | Tests | What it establishes |
|---|---|---|
| `J-CFG-model-provider.test.ts` | 1 | Hot-swap without restart; and **the secret never enters the durable log** — it opens `app.sqlite` read-only and scans `payloads`, `events.metadata`, `records`, `projection_state` |
| `J-WS-select.test.ts` | 2 | A stable `workspaceId` per canonical path; re-selection creates no duplicate record; a non-existent path fails closed |
| `J-B-basic-session.test.ts` | 1 | A turn streams (≥2 progress events), completes, is projected, and its history reaches the next turn. Also the literal-first-message title |
| `J-C-tool-execution.test.ts` | 2 | The tool order `["read","bash","edit"]`; **the file on disk actually changed**; a path escape is rejected without touching the filesystem |
| `J-D-approval.test.ts` | 4 | Allow (waiting status, `OPEN` continuation, correct payload, completion after resolve); deny (exact denial substrings in the output); **a pending approval survives a full restart**; **no tool executed twice after a mid-run restart** |
| `J-E-plan.test.ts` | 2 | Plan mode on before the model call; to-dos progress; a `plan-review` continuation with the right heading and markdown; Approve's exact output text; to-dos persist; and `exit_plan_mode` failing closed outside plan mode |
| `J-F-delegation.test.ts` | 2 | The parent completes immediately with `started subagent <id>`; the child completes independently; its result reaches the parent's next turn; the child is absent from `sessions`; a restart spawns no duplicate |
| `J-G-persistence.test.ts` | 1 | Session row, title, workspace record, and history all survive a real `stop()` + `startServer` |
| `J-H-cancellation.test.ts` | 1 | Stop mid-stream → `cancelled`; **the mock server observed the connection abort** (`GET /__abort-count`); partial text retained; no `message.completed`; a follow-up turn still works |
| `J-H-provider-error.test.ts` | 3 | Exactly 5 retries then one `turn.failed` with `HTTP_500`; recovery on the first retry; **no duplicated retries across a restart** |
| `J-I-work-details.test.ts` | 2 | The setting is absent on a fresh home, present after an invoke, and survives a restart; an unknown mode is rejected |
| `helpers.ts` | — | `withTempHome`, `bootApp`, `bootMockModel` |

### What makes these tests worth running

Every one of them asserts a **settlement condition against real state** — a file on disk, a row in
SQLite, a run's output text, a `waited` status after a genuine restart. Not "no exception was thrown".
That is the difference between a suite that catches a regression and one that notices an exception.

### Conventions worth copying

- `withTempHome` — a fresh directory per test, removed in `finally`. Tests never share a store.
- `bootMockModel` — a real child process, so a test cannot import another tranche's in-memory state.
- Poll `getRun` / `readProjection` rather than sleeping a fixed time.
- `await app.runtime.idle()` before reading a projection written asynchronously by a run.
- `MODEL_RETRY_BACKOFF_MS` set low in retry tests and deleted in `finally`.
- Restart tests pass an explicit longer timeout (15,000 ms).

→ [../how-to/add-a-journey-test.md](../how-to/add-a-journey-test.md)

## 2. The architectural criteria

```bash
bun test tests/architecture
# plus, separately and slowly:
bash tests/architecture/reference-removed.sh
```

**Last recorded result: 62 tests across 8 files, all pass**, plus criterion 8 as a separate script.

| # | Criterion | File | Needs the reference |
|---|---|---|---|
| 1 | No dependency on the reference package family in any manifest or `bun.lock` | `dependency-hygiene.test.ts` | no |
| 2 | No import resolving into the reference checkout, **including the built bundle** | `no-reference-imports.test.ts` | yes, to be meaningful |
| 3 | No copied source (8-line shingles) or byte-identical asset | `no-copied-source.test.ts` | yes — **skips without it** |
| 4 | No reference-specific primitive; every added export traceable to a declared finding | `framework-purity.test.ts` | no (diffs against `main`) |
| 5 | The app never imports the kernel implementation | `cordis-boundary.test.ts` | no |
| 6 | Event history is authoritative: projections rebuild identically after their state is deleted | `event-history-authoritative.test.ts` | no |
| 7 | The `.sea` grammar engine and RealityTrace are unmodified | `domainforge-realitytrace-unchanged.test.ts` | no |
| 8 | The app works after the reference checkout is physically moved away | `reference-removed.sh` + `.log` | the checkout, to remove it |
| 9 | The cognitive index is not load-bearing | `no-cognition-used.test.ts` | no — vacuously true, the app uses no cognition |

Three of these are worth reading the source for, because their approach is the interesting part:

- **Criterion 2** boots the real app and fetches the actual `/app.js` the server built, rather than
  reimplementing `Bun.build`. It also has to not flag Bun's own `// <source-path>` comments, which
  legitimately contain the repository path.
- **Criterion 4** is governance, not pattern-matching: it diffs `packages/` and `profiles/` against
  `git merge-base main HEAD`, requires no forbidden identifier in added lines, **and** requires every
  symbol the branch added to be declared in the plan's Findings section — with D1, D2, G1, and F3 each
  independently confirmed present in that document, so the mapping cannot silently drift.
- **Criterion 6** drives a tool turn, a plan turn, an approval turn, and a delegation, snapshots four
  projections, deletes their rows **directly in SQLite**, restarts, and asserts a deep-equal rebuild.

`reference-removed.sh` reinstalls and rebuilds the whole workspace, so run it deliberately, not in a
loop. Its recorded log shows six steps: move the checkout aside, `bun install --frozen-lockfile`,
typecheck, the app test suite, a Cognate-only Playwright capture smoke run, and restore.

## 3. The Playwright journey suite

```bash
cd tests
bun run journeys            # both systems
bun run journeys:cognate    # this app only — no reference needed
bun run journeys:reference
```

Drives both systems through the shared `Driver` interface. `run.ts` uses `--workers=1 --retries=2
--timeout=180000` and classifies each journey `passed | failed | flaky | timedOut | skipped`, writing
`results/<system>.json`, `results/.raw-<system>.json`, and `results/summary.md`.

**A test that passes on retry is recorded as `flaky`, not folded into `passed`.** The last recorded run
has 11/11 rows PASS on both systems, with two reference-side rows marked `FLAKY` (D-approval deny,
F-delegation) and no message.

`SYSTEM` selects the driver; any other value throws at startup. The suite is the place where a
divergence is expressed as data — `Expectations` in `tests/drivers/types.ts` — rather than as a branch
in a spec.

## 4. Screenshot capture and compare

Evidence, not a gate. The visual target was retired on 2026-09-27.

```bash
bun fixtures/mock-model/server.ts &
cd tests
bun run capture/cognate.capture.ts desktop 1440 900 /tmp/cg-home-desktop 3182 /tmp/cg-ws-desktop
bun run visual/compare.ts
```

→ [../how-to/run-parity-capture.md](../how-to/run-parity-capture.md), which covers the reference side,
the triptychs, and the `compare.ts` hardcoded-path defect.

## Which to run when

| You changed | Run |
|---|---|
| `agent.coding`, a capability, a projection, `server.ts` | app journey tests + typecheck |
| The UI's structure or copy | app journey tests, then the capture suite for before/after evidence |
| The `.sea` model or `domain/index.ts` | app journey tests + criterion 7 |
| Anything in `packages/` or `profiles/` | the architectural criteria |
| A new feature | app journey test, plus a Playwright journey if it is a journey |
| The mock model or fixtures | app journey tests — most of them depend on it |

**Always run the whole app suite, not one file.** The tests share a fixture, a store format, and a mock
server; a projection change can break a journey you did not touch.

## What no suite checks

Stated so you do not assume otherwise:

- **The visual system's conformance to its own design intent.** `cognate/redesign/` holds audits and a
  `verify.ts`, and `DESIGN.md` is the contract, but nothing in the automated suites enforces it.
- **Accessibility beyond accessible names and roles.** The aria observation trees record what the DOM
  exposes; no axe-style audit runs.
- **Multi-tenancy, auth strength, or network exposure.** The app is loopback-only with a dev token and
  no such tests exist.
- **Performance.** No latency, throughput, or memory assertions anywhere.
- **The reference side's own health.** Reference journey flakes are recorded, not fixed.

## Related

- [../reference/journeys.md](../reference/journeys.md) — what each journey asserts
- [../how-to/add-a-journey-test.md](../how-to/add-a-journey-test.md) — adding coverage
- [../how-to/run-parity-capture.md](../how-to/run-parity-capture.md) — the capture suite
- [../operations/troubleshooting.md](../operations/troubleshooting.md) — when a suite fails
- `architecture-evidence.md`, `parity-report.md` — the recorded results, with the exact commands
