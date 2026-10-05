# Troubleshooting

Symptoms, causes, and where to look. Ordered roughly by how often you are likely to hit them.

## First moves

```bash
cd cognate
curl -s http://127.0.0.1:<port>/health
# {"ok":true,"semantic":{"objects":51,"digest":"sha256:43e412c9…"}}
cd cognate && bun test test          # does the app's own suite pass?
```

If the suite passes and your manual run does not, the difference is almost always **the home
directory**, **the environment variables**, or **a stale process**.

---

## Startup and boot

| Symptom | Likely cause | Where to look |
|---|---|---|
| `domain: failed to parse interaction-model.sea: …` | a syntax error in the `.sea` file | `domain/index.ts` — fail-fast by design; fix the model, do not bypass |
| `domain: expected N bound contracts, got M` | a `tranche*Bindings` list and its `bindTranche*` destructuring disagree | `domain/index.ts` — the list, the tuple, and the count are three things to edit together |
| A different object count or digest than 51 / `sha256:43e412c9…` | the `.sea` model changed | the boot log and `/health` both report it; that is the intended signal |
| `server: failed to bundle the UI: …` | a `Bun.build` failure; the message concatenates `build.logs` | `server.ts:252` |
| `runtime not ready` | a capability was invoked before `serviceRef.current` was assigned | the `getService` closure |
| Port already in use | `Bun.serve` throws | set `PORT`; the app has no port fallback |
| Every provider call fails right after a restart | the boot provider re-mount did not run or threw | `server.ts:200-213` — a resumed run needs a live `model.generate` |
| `bun test` passes but the browser 404s | a stale process is serving an old bundle | kill and restart; `.generated/entry.tsx` is rewritten per boot |

## Configuration and capability errors

| Symptom | Likely cause | Where to look |
|---|---|---|
| `Permission denied` invoking a new capability | its id is missing from `GRANTED_CAPABILITIES` | `server.ts:55-70` — restart after editing |
| `model.configure: providerId, baseURL, and model are required` | an empty required field | the wizard's validation, then the capability's own check |
| `workspace.select: not a directory: <p>` | the path is missing or is a file | the path you typed |
| `workspace.path: unknown workspaceId <id>` | no `record/<id>` row in the `workspaces` projection | a hand-edited store, or a run resumed after its projection was cleared |
| `settings.changeWorkDetails: workDetails must be one of compact, …` | an invalid mode | the shared mode union in `src/workDetails.ts` |
| `secret.put: key and value are required` | invalid input | `secretPut.ts` |
| Composer stays disabled | no workspace **or** no `model-config` row | `composerDisabled` in `App.tsx`; both come from projections, so give the commit a moment |

## Turn and tool failures

These are *returned to the model* as tool results rather than thrown, so they appear in the transcript
and in the run's output.

| Text | Meaning | Is it a bug? |
|---|---|---|
| `fs_not_observed: read <p> before editing it` | the model edited an existing file it had not read this turn | no — the guard working |
| `path escapes workspace root: <p>` | a tool argument resolved outside the workspace | no — containment working |
| `tool.edit: old_string not found in <f>` | precondition | no |
| `tool.edit: old_string is not unique in <f> (N matches) — provide more context or set replace_all` | precondition | no |
| `Reached the tool-call step limit for this turn.` | 20 tool steps consumed | only if unexpected — the model may be looping |
| `(command exited N with no output)` | the command produced neither stream | no |
| `…(truncated)` in output | the 20,000-char cap | no |
| `timedOut: true` | the 30s subprocess timeout | only if a legitimate command is slower |
| `Error: exit_plan_mode is only available in plan mode` | the tool was called outside plan mode | no — fail-closed |
| `Error: the user rejected escalating this program to "<perm>"; …` | an approval was denied | no |
| `Error: the user requested changes to this plan…` | a plan review was declined | no — and this wording is the app's own, not reference-observed |
| `started subagent <id>` as the turn's answer | fire-and-forget delegation | no — the child is still running |
| `workspace.path: unknown workspaceId` mid-turn | the workspace record is gone | yes — investigate how the projection lost the row |

## Provider and network failures

| Symptom | Likely cause | Where to look |
|---|---|---|
| `HTTP_401` / `HTTP_403` in the failure block | a wrong or missing key | the provider; the key is write-only, so re-enter it |
| `HTTP_500` / "Internal server error" after 5 retries | the provider failed 6 times | the mock's `error` scenario does this deliberately |
| `TIMEOUT` / "Request timed out." | `details.kind === "cancelled"` or status 408 | `classifyModelFailure` |
| The failure block says `HTTP_404` | the base URL is wrong (a missing `/v1`, say) | the configured `baseURL` |
| No streaming text in the UI | the provider does not advertise streaming, or `ctx.progress` is absent | `streamingProviderComponent` |
| `swap` takes 5s and then the run fails | the new component never reached `ACTIVE` | `ProviderRegistry.swap` |
| The mock model is not listening | start it separately; nothing starts it for you | `bun fixtures/mock-model/server.ts` |

## UI symptoms

| Symptom | Likely cause | Where to look |
|---|---|---|
| First-run dialogs reappeared | the home changed. `COGNATE_HARNESS_HOME` unset means `<cognate>/.data` | the environment |
| "No workspace selected" | the `workspaces/current` row is absent | select a directory |
| "Waiting for approval" prefix never clears | an open `tool-approval` continuation, or a `run.waiting` that arrived before the session row existed | `sessions.ts`'s no-row guard |
| The subagent banner appears before the child finishes | the row is created at `subagent.spawned`, i.e. at start | by design; catalogued as a deviation |
| Verbose mode folds steps on a reloaded turn | `session.history` returns `stepCount`, not per-step detail | a documented gap, not a regression |
| The stats footer reads zeros | no accounting is implemented | deliberate; `PRODUCT.md` says not to fake it |
| The theme reset to light | `localStorage` unavailable, or a different browser | `useTheme` swallows the error by design |
| A capture lands on a completed frame | the app's tools are sub-millisecond | a capture-timing artifact; see [../reference/deviations.md](../reference/deviations.md) |
| `diffs/` is empty | `tests/visual/compare.ts` hardcodes an absolute `ROOT` | see [../how-to/run-parity-capture.md](../how-to/run-parity-capture.md) |

## Durability symptoms

| Symptom | Likely cause | Where to look |
|---|---|---|
| State is lost after a restart | a different `COGNATE_HARNESS_HOME` | the environment |
| A feature survives a reload but not a restart | something is held in component memory instead of derived from the log | [../how-to/add-a-capability.md](../how-to/add-a-capability.md) — step 8's check |
| A resumed run fails on a provider call | the provider was not re-mounted | `server.ts:200-213` |
| A tool executed twice after a restart | a filesystem read or call outside `ctx.step`/`ctx.invoke` in the agent body | [../explanation/determinism-and-replay.md](../explanation/determinism-and-replay.md) |
| A subagent spawned twice | the child's idempotency key was not passed | `subagentStart.ts` |
| Projections disagree with the log | a fold is not total or not idempotent under replay | [../how-to/add-a-projection.md](../how-to/add-a-projection.md) |
| A pending approval vanished | it was resolved, or the run was cancelled | check for `tool.approval.decided` in the events |

## Test-suite symptoms

| Symptom | Likely cause | Where to look |
|---|---|---|
| A journey test times out waiting for completion | the mock was never started, or the base URL points at 4010 instead of `mock.port` | the test's `baseURL` |
| `no provider mounted` | `model.configure` was not awaited | the test preamble |
| `unknown workspaceId` | `workspace.select` was not awaited | the test preamble |
| A tool had no effect on disk | the workspace was made with `mkdir` instead of `makeWorkspace`, so the file did not exist | `fixtures/workspace/make-workspace.ts` |
| A restart test fails | it used `bootApp` (a new home) instead of `startServer({port: 0, home})` | the test |
| A journey suite refuses to start | `SYSTEM` is neither `reference` nor `cognate` | `harness.ts` |
| The reference journeys fail to launch | the pinned checkout is not at the path in `reference-manifest.json` | that file |
| `pnpm` refuses to run from the repo root | the `nub` shim and a `bun.lock` in the same directory | run from inside the clone; `npx -y pnpm@11.7.0` also works |
| A criterion "skips" | it needs the reference checkout present | see [testing.md](testing.md) |
| `framework-purity.test.ts` cannot find a merge base | no `main` branch, or not a git checkout | criteria 1 and 4 need git history |

## Reading the log directly

When nothing above explains it, read the durable record rather than the UI.

```ts
import { Database } from "bun:sqlite";
const db = new Database("<home>/app.sqlite", { readonly: true });
for (const r of db.query(
  "SELECT event_type, correlation_id, run_id, recorded_at FROM events ORDER BY id"
).all()) console.log(r);
```

That gives the order and the routing without decoding payloads. For payloads, the `payloads` table
joins on the event row. This is exactly what the tests do, and it is usually faster than reproducing
the problem in the browser.

## Known documentation drift

Where the documentation in this tree is known to disagree with the code, and which side is right.

| Claim | Where | Reality | Resolution |
|---|---|---|---|
| "Provider-error code mapping is text-based, not status-based, by construction" | `cognate/DEVIATIONS.md` | **Stale.** `classifyModelFailure` prefers structured `failure.details` (status 408/500/n) since framework finding F3; the regex is a fallback | Trust `agentCoding.ts:57-74` and [cancellation-and-failure.md](../workflows/cancellation-and-failure.md). The *behaviour* is unchanged and still asserted by `J-H-provider-error`. |
| "See `src/ui/tokens.css`, generated alongside this file" | `cognate/DESIGN.md` §Exports | **Stale.** No `tokens.css` exists; the token layer is the `:root` block in `cognate/src/ui/app.css` | Trust `app.css`. |
| "No plan mode, no subagents, no cancel/retry — later tranches (T9–T11)" | `cognate/README.md` §Known gaps | **Stale.** T9, T10, and T11 are all implemented, with tests | Trust the code and [testing.md](testing.md). The same file's T9/T10/T11 sections describe them correctly, so its "Known gaps" list predates them. |
| "…~2,000-line `app.css` with … no shared design-token layer" | `cognate/PRODUCT.md` §Constraints | **Partly stale.** `app.css` is ~2,130 lines and has a real `--cg-*` token set in `:root`; there is still no separate token file and no component decomposition | Trust `app.css` for tokens; the decomposition point still holds |
| The whole file is titled "tranches T5-T8" while documenting T9–T11 | `cognate/README.md` | Cosmetic | Ignore |
| `tests/visual/compare.ts` resolves paths absolutely | `tests/visual/compare.ts:17` | **A defect**, not drift: a hardcoded `ROOT` makes the script silently no-op on any other checkout path | Fix by deriving from `import.meta.dir`, as the other scripts do |

If you find a discrepancy not listed here, treat the **code and the tests** as authoritative and fix
the prose.

## Escalating a problem

Before concluding it is the app, check whether it is the **environment**: the mock model, the fixture
workspace, the home directory, a stale process, or the missing reference checkout account for most
"impossible" results. Running `bun test test` takes about half a minute and settles a large fraction
of questions immediately.

## Related

- [testing.md](testing.md) — the suites and what they prove
- [../reference/deviations.md](../reference/deviations.md) — intended differences
- [../explanation/determinism-and-replay.md](../explanation/determinism-and-replay.md) — the invariants
- [../subsystems/](../subsystems/) — per-subsystem failure tables
