# Journey reference

The ten canonical journeys: their identity, their settlement condition, and the three tests that cover
each one.

## The three layers of evidence

A journey is checked at three levels, and a claim is only as good as the layer that establishes it.

| Layer | Where | What it can prove |
|---|---|---|
| Bun integration | `cognate/test/J-<id>.test.ts` | behaviour, event order, exact strings, real filesystem and restart effects — through the service, not the DOM |
| Playwright journey | `tests/journeys/<K>-<name>.spec.ts` | the same journey driven through the browser, on **both** the app and the pinned reference |
| Visual capture | `cognate/screenshots/<viewport>/`, `diffs/` | appearance and accessible-name structure. **Historical**: the visual target was retired on 2026-09-27. |

The IDM journey id names the integration test. The Playwright spec uses its own letter
(`A`, `B`, … `H`) because two IDM journeys (`J-CFG-model-provider`, `J-WS-select`) fold into the
`A-first-use` spec.

## The journeys

### `J-A-first-use` — first launch to a usable composer

| | |
|---|---|
| Actor | User |
| Precondition | No workspace selected |
| Settlement | The composer is enabled and a routable model exists |
| Integration test | none of its own — composed of the two below |
| Playwright | `tests/journeys/A-first-use.spec.ts` — *"launch shows initial UI with no workspace yet, then model config + workspace selection enable the composer"* |
| IDM | `interaction-model.sea:88-99` (`j_a_first_use`); `canonical-journey-catalog.md` §J-A-first-use |

### `J-CFG-model-provider` — configure a model route

| | |
|---|---|
| Actor | User |
| Precondition | Settings is reachable regardless of workspace or session state |
| Settlement | A usable route exists and the next request uses it, hot-applied with no restart |
| Integration test | `cognate/test/J-CFG-model-provider.test.ts` — configures against mock A, generates, reconfigures against mock B, generates, asserts the `model-config` row holds B; then opens `app.sqlite` read-only and asserts the secret appears in none of `payloads`, `events.metadata`, `records`, `projection_state` |
| Playwright | folded into `A-first-use` |
| IDM | `interaction-model.sea:101-112` |

This journey exists separately from `J-A-first-use` because reconfiguring a provider mid-session is not
part of "first use" — collapsing them would lose that.

### `J-WS-select` — bind a session to a directory

| | |
|---|---|
| Actor | User |
| Precondition | A directory can be chosen |
| Settlement | A `WorkspaceRecord` exists (a stable id over the canonical path, plus a display title) and the composer is enabled |
| Integration test | `cognate/test/J-WS-select.test.ts` — two tests: a record and a `current` pointer, with re-selection producing **no duplicate record**; and a non-existent path failing closed |
| Playwright | folded into `A-first-use` |
| IDM | `interaction-model.sea:114-125` |

### `J-B-basic-session` — one complete turn

| | |
|---|---|
| Actor | User |
| Precondition | A workspace is selected, a model is configured |
| Settlement | The session log contains the completed turn, and the sidebar shows the session with a generated title after switching away and back |
| Integration test | `cognate/test/J-B-basic-session.test.ts` — two turns with the `plain` scenario; asserts ≥2 `run.invocation.progress` events, `completed`, the answer text, the session row's `lastStatus` and title, and that after two turns `session.history` returns 4 alternating messages |
| Playwright | `B-basic-session.spec.ts` — *"send a deterministic prompt, see it stream to completion, then find it in history and switch back to it"* |
| IDM | `interaction-model.sea:127-138` |

### `J-C-tool-execution` — read, run, edit, and the file really changes

| | |
|---|---|
| Actor | OperatorAgent |
| Precondition | A workspace is selected and the fs/bash tools are not denied for the requested scope |
| Settlement | The edited file's on-disk content reflects the tool call, and the read-before-mutation policy was satisfied for every write |
| Integration test | `cognate/test/J-C-tool-execution.test.ts` — two tests: (1) the `multi` scenario with `tool.call.started` order asserted as exactly `["read","bash","edit"]`, no failed call, the answer text, and `src/greet.ts` on disk containing `Howdy` and **not** `Hello`; (2) a path escape rejected with `/escapes workspace root/` |
| Playwright | `C-tool-execution.spec.ts` — *"a multi-step coding task shows tool activity, produces a final answer, and actually mutates the workspace file on disk"* |
| IDM | `interaction-model.sea:140-151` |
| Variants | Writing a new file needs no prior read; editing an existing one does. |

### `J-D-approval` — privilege escalation behind a human

| | |
|---|---|
| Actor | ApprovalAuthority |
| Precondition | An approval answerer is attached to the session (fail-closed `unavailable` if not) |
| Settlement | Exactly one asked and one decided per approval; the gated action's execution state matches the decision, and completion is persisted |
| Integration test | `cognate/test/J-D-approval.test.ts` — **four** tests: (1) allow — the run is `waiting` with an `OPEN` continuation whose payload carries `run_code`, `workspace-write`, and a justification containing "stale cache"; resolving completes the run; (2) deny — the run completes and its output contains both halves of the denial text; (3) a pending approval **survives a full `app.stop()` + fresh `startServer`** and still completes when resolved; (4) replay after a mid-run restart leaves each `toolCallId` appearing exactly once among `tool.call.started` |
| Playwright | `D-approval.spec.ts` — both branches |
| IDM | `interaction-model.sea:153-164` |
| Divergence | `Expectations.approvalSurvivesRestart` is `false` for the reference and `true` for the app. The reference silently finalizes the turn across a process restart; this app does not, deliberately. |

### `J-E-plan` — plan, sign-off, to-dos

| | |
|---|---|
| Actor | OperatorAgent |
| Precondition | Plan mode is the effective target for the session |
| Settlement | Plan mode reaches a terminal, explicitly-decided state with a legible plan-review record |
| Integration test | `cognate/test/J-E-plan.test.ts` — two tests: (1) `/plan … [[scenario:plan]]` — plan mode on before the model is called, two to-dos with the right statuses, a `plan-review` continuation (asserted as `type === "plan-review"`, not `tool-approval`) whose payload has heading `"Update greeting"` and markdown containing `"Read src/greet.ts"`, the review `pending` before resolution; then Approve → the run's output is **exactly** `Tool result: Plan approved — plan mode exited; carry out the plan starting with your next step.`, and afterwards `on: false`, to-dos still length 2, review `approved`; (2) the same scenario without the `/plan ` prefix → the output contains `Error: exit_plan_mode is only available in plan mode` and **no** `plan-review` continuation exists |
| Playwright | `E-plan.spec.ts` |
| IDM | `interaction-model.sea:166-177` |
| Not covered | The "request changes" branch. It was not exercised against the reference, so its wording is this app's own and no test asserts it. |

### `J-F-delegation` — hand a sub-task to a child run

| | |
|---|---|
| Actor | OperatorAgent |
| Precondition | A subagent provider is registered |
| Settlement | The result is recorded and the parent's completed turn reflects the delegated outcome |
| Integration test | `cognate/test/J-F-delegation.test.ts` — two tests: (1) the parent completes **immediately** with output matching `^Tool result: started subagent (<id>)$`; the `subagents` projection has one row titled "Summarize project status"; the child is queryable at correlation `subagent:<parentRunId>:<toolCallId>` and its `runId` equals the id the parent echoed; the child then completes independently and its row reaches `completed` with the expected output; the child is **absent** from `sessions`; and the parent's next-turn `session.history` contains `Subagent "Summarize project status" completed: <output>`. (2) a restart mid-delegation yields exactly one child run and exactly one row |
| Playwright | `F-delegation.spec.ts` |
| IDM | `interaction-model.sea:179-190` |
| Divergence from the IDM | The IDM says the child's result is rendered inline in the parent's tool-call card. The reference's actual behaviour is fire-and-forget with the result arriving on the parent's *next* turn, and that is what is implemented. |

### `J-G-persistence` — survive a full process restart

| | |
|---|---|
| Actor | User |
| Precondition | State was written through the durable log, not held in memory |
| Settlement | The reopened session's visible state matches what was recorded before termination |
| Integration test | `cognate/test/J-G-persistence.test.ts` — one turn, `app.stop()`, `startServer` on the same home, then: the session row still `completed`, its title still contains the first human message, the workspace record still exists, and `session.history` returns 2 messages |
| Playwright | `G-persistence.spec.ts` — two cases: a real process kill and restart, and the documented approval-restart difference |
| IDM | `interaction-model.sea:192-203` |
| Strengthened by | `tests/architecture/event-history-authoritative.test.ts`, `J-D-approval` (restart + replay), `J-H-provider-error` (no duplicated retries), `J-I-work-details` |

### `J-H-cancellation` — interrupt a turn, and handle a provider error

| | |
|---|---|
| Actor | User |
| Evidence class | **`inferred`** — the only journey not marked `declared` |
| Precondition | A cancel or steer affordance is reachable during the running turn |
| Settlement | The turn reaches an explicit interrupted or failed state, and a retried turn completes where the reference allows it |
| Integration test | two files. `cognate/test/J-H-cancellation.test.ts`: Stop mid-stream → `cancelled`, the mock's `GET /__abort-count` ≥ 1 (**proving the connection really closed**), the concatenated text deltas non-empty, **no** `message.completed`, the session row `cancelled`, and a follow-up turn completing with both user messages in history and the cancelled turn's partial reply absent. `cognate/test/J-H-provider-error.test.ts`: three tests — the `error` scenario yields exactly 5 `model.request.retried` with attempts `[1..5]` and one `turn.failed` carrying `code: "HTTP_500"`, `message: "Internal server error"`; the `retry` scenario recovers on the first retry with exactly 1 retry event; and a restart after two retries still ends with exactly 5 |
| Playwright | `H-cancellation.spec.ts` — two cases |
| IDM | `interaction-model.sea:205-216` |
| Divergence | `Expectations.providerErrorCode`. The reference's confirmed code vocabulary was only observed for a genuine network timeout; the mock's scripted 500 is asserted loosely for it. |

### `J-I-work-details` — a durable presentation setting

Not an IDM journey. It exists because the reference's Work-details setting is a P1 behaviour with its
own checkpoint family, and its durability needed proving.

| | |
|---|---|
| Test | `cognate/test/J-I-work-details.test.ts` — two tests. Three sequential boots against one home: the `settings` row is **absent** on a fresh home (which is what makes `standard` the default), `verbose` after an invoke, and still `verbose` after reopening. Plus: an unknown mode is rejected. |
| Captures | `21-work-details-{compact,standard,detailed,verbose}`, `22-settings-general` |
| Behaviour | `verbose` un-folds completed turns; `compact`/`standard`/`detailed` fold identically at this app's single-turn depth; the running-tool label's `· <detail>` suffix shows for `standard`/`detailed` and hides for `compact`/`verbose` |

## Coverage map

| Journey | IDM instance | Integration test | Playwright | Capture checkpoints |
|---|---|---|---|---|
| J-A-first-use | ✓ | (composed) | `A-first-use` | `01`, `03` |
| J-CFG-model-provider | ✓ | ✓ | (in A) | `02`, `02b`, `02c`, `02d` |
| J-WS-select | ✓ | ✓ | (in A) | `03`, `04` |
| J-B-basic-session | ✓ | ✓ | `B-basic-session` | `05`–`07`, `15`–`17` |
| J-C-tool-execution | ✓ | ✓ | `C-tool-execution` | `08`–`10` |
| J-D-approval | ✓ | ✓ (4 tests) | `D-approval` | `11`, `11b`, `12` |
| J-E-plan | ✓ | ✓ (2 tests) | `E-plan` | `13`, `13b`, `13c` |
| J-F-delegation | ✓ | ✓ (2 tests) | `F-delegation` | `14`, `14b` |
| J-G-persistence | ✓ | ✓ (+4 more across other files) | `G-persistence` | `17` |
| J-H-cancellation | ✓ (inferred) | ✓ (2 files) | `H-cancellation` | `18`, `19` |
| J-I-work-details | — | ✓ | — | `21`×4, `22` |
| Theme | — | — | — | `20` |

## The last recorded results

`tests/journeys/results/summary.md`, generated 2026-09-27: **11/11 journey rows PASS on both systems.**
Two rows are marked `FLAKY` on the reference (D-approval deny, F-delegation) — passing on retry, with no
message — while the app's corresponding runs were single-attempt passes. The app's own suite:
**21 tests across 11 files, 21 pass, 0 fail, 123 `expect()` calls.**

Treat these as a snapshot, not a live status; see
[../explanation/parity-method.md](../explanation/parity-method.md#confirmed-versus-inferred).

## Related

- [../how-to/add-a-journey-test.md](../how-to/add-a-journey-test.md) — adding one
- [../operations/testing.md](../operations/testing.md) — running the suites
- [../subsystems/validation-harness.md](../subsystems/validation-harness.md) — the Driver contract
- `cognate/.sea/interaction/canonical-journey-catalog.md` — the full definitions, which this page summarises rather than replaces
- `reference-behavior-matrix.md` — what the reference does for each
