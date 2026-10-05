# Workflow: persistence and restart

Journey `J-G-persistence`. What survives a process kill, what resumes, and what does not.

## Summary

Everything durable lives in one SQLite file under the home directory. A restart replays non-terminal
runs, rebuilds every projection from the event log, re-establishes the live model provider from the
`model-config` row, and serves the same visible state. Open continuations stay open. The only things
lost are browser-local conveniences and the temporary UI state that had no durable counterpart.

## What is durable

| Store | Path | Written by | Survives restart |
|---|---|---|---|
| Events, payloads, records, runs, continuations, projection state | `$COGNATE_HARNESS_HOME/app.sqlite` | the runtime | yes |
| Credentials | `$COGNATE_HARNESS_HOME/secrets.json` (0600) | `secret.put` | yes |
| Workspace files | the chosen directory | tools | yes, and deliberately so |
| Theme | `localStorage["cognate.theme"]` | `useTheme` | per browser only |
| Last open session per workspace | `localStorage["cognate.lastSession.<id>"]` | `rememberSession` | per browser only |
| Transcript, streaming text, open panels | React state | the browser | no — rebuilt from durable state |

`COGNATE_HARNESS_HOME` unset means `<cognate>/.data`, which is git-ignored. A "fresh install" is
therefore a new home directory, which is why the first-run dialogs reappear there and not elsewhere.

## What happens on restart

1. `startServer` opens the same SQLite file. The runtime resumes any run that is not in a terminal
   state (`running`, or `waiting` on a continuation).
2. `ProjectionRunner.catchUp()` rebuilds every registered projection from position 0, so all rows are
   current before anything reads them.
3. `workspaces` is read to reseed the in-memory known-id set.
4. `model-config` is read; if a `current` row exists, `registry.swap` mounts the provider again. **A
   resumed run cannot call `model.generate` without this** — the provider is not itself durable state,
   only the fact that a provider was configured is.
5. The live event follower restarts, and `workspace.added` events re-enter the known-id set (no
   duplicates, because it is a `Set` seeded from the projection).
6. A browser that reloads calls `openSession`, which reattaches to the run when the session row's
   `lastStatus` is `running` or `waiting` and it has a `runId`. Both fields come from the projection,
   so this works after a full restart, not just a soft reload.

## The three restart tests, and what each proves

**`J-G-persistence`** — run a turn, stop the app, reopen the same home, and assert: the session row
still says `lastStatus: "completed"`, the title still contains the first human message, the workspace
record still exists, and `session.history` returns the two messages. This is "the visible state matches
what was durably recorded".

**`J-D-approval`, third test** — get a run to `waiting` on an open approval, `app.stop()`, then
`startServer` against the same home. Assert the continuation is still `OPEN`, the run is still
`waiting`, resolve it, and the run completes. This is "a human decision in flight is not lost" — and
it is a deliberate divergence from the reference, which silently finalizes the turn.

**`J-D-approval`, fourth test** — start an `edit` scenario run, stop the app 150ms in, restart, and
assert each `toolCallId` appears **exactly once** among `tool.call.started` events. This is
replay-safety: the resumed run returned the recorded steps instead of re-executing them.

**`J-H-provider-error`, third test** — stop after two retries, restart, and assert the final count is
still exactly 5. Same property, applied to the backoff loop.

**`J-I-work-details`** — three sequential boots against one home: assert the `settings` row is absent
(fresh), invoke a change and assert `verbose`, then reopen and assert it is still `verbose`. Durable
across a full runtime restart, not just a client reload.

**`tests/architecture/event-history-authoritative.test.ts`** — the strongest form. Run a tool turn, a
plan turn, an approval turn, and a delegation; snapshot four projections; delete their
`projection_state`/`projection_checkpoints` rows directly in SQLite; restart; assert the rebuild is
deep-equal. Nothing in the app is allowed to depend on derived state surviving.

## Replay, precisely

On boot the runtime resumes a non-terminal run by re-executing its body with a replayed context:

- `ctx.invoke` of a **completed** step returns the recorded result without calling the capability.
- `ctx.step` returns the recorded answer without running the callback. This is what keeps the
  `edit-exists:<id>` disk check and the retry backoff from re-happening.
- `ctx.emit` of an already-recorded event is not duplicated — the D1 framework fix addressed a
  counter-drift defect here where an emit inside a step shifted counters on replay and could collide
  with a later emit.
- The agent's only non-deterministic local state, `readFiles`, is a plain `Set` rebuilt identically
  from the same sequence of recorded `tool.read` results.
- `subagent.start` uses the child's idempotency key, so a replayed delegation does not spawn a second
  child.

## State changes

```
restart:  projection rows recomputed from position 0
          running/waiting runs resumed
          open continuations still OPEN
          provider re-mounted from the model-config row
browser:  transcript rebuilt from session.history
          reattached to the in-flight run if lastStatus is running|waiting
          theme and last-session restored from localStorage (if the same browser)
```

## Failure branches

| Situation | Behaviour |
|---|---|
| The home is a different directory | everything looks like a fresh install: dialogs, no workspace, no model |
| The store file is corrupt | the runtime fails to open it; boot throws |
| A resumed run needs the provider and the re-mount failed | the run fails on its next `model.generate` |
| A resumed run's `workspace.path` finds no record | the run fails with `unknown workspaceId` — for example if the workspace projection was cleared by hand |
| A run was `running` with an unresolvable external dependency | it resumes and may fail; there is no dead-letter path |
| `localStorage` was cleared | the theme resets to light and no session is auto-opened; the user opens one and the reattach path still works |
| The user reloaded in a *different* browser | no localStorage, so no auto-open; durable state is unchanged and correct |
| A cancelled run is restarted | cancelled is terminal; it is not resumed. Its partial text stays in the log but is not in history |

## Sequence diagram

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Server
  participant R as Runtime
  participant DB as SQLite
  participant P as Model provider

  Note over S: process killed
  B->>S: reload after restart
  S->>R: createRuntime(store)
  R->>DB: open
  R->>R: ProjectionRunner.catchUp() — rebuild all 7 projections
  R->>R: resume non-terminal runs
  S->>DB: read workspaces → seed known ids
  S->>DB: read model-config
  opt a row exists
    S->>P: registry.swap → mount provider, wait ACTIVE
  end
  S-->>B: serve UI
  B->>S: openSession(id)
  S->>DB: sessions row → lastStatus "waiting", runId
  Note over B: reattach to the in-flight run;<br/>approval card reappears from the open continuation
```

## Source trail

- `cognate/src/server.ts:182-185` — reseeding `knownWorkspaceIds` from the projection
- `cognate/src/server.ts:200-213` — provider re-mount on boot, with the reason in the comment
- `cognate/src/server.ts:219-231` — the event follower that survives the restart
- `cognate/src/ui/App.tsx:1982-2021` — `openSession`'s reattach logic
- `cognate/src/ui/App.tsx:1974-1980` — `rememberSession` and its "convenience, not durable state" comment
- `cognate/src/agents/agentCoding.ts:6-8` — the `readFiles` determinism note
- `cognate/src/agents/agentCoding.ts:226-228` — the boxed disk check
- `cognate/src/capabilities/subagentStart.ts:45` — the child's idempotency key
- `cognate/test/J-G-persistence.test.ts:21-79` — visible state after a restart
- `cognate/test/J-D-approval.test.ts:124-177` — a pending approval across a restart
- `cognate/test/J-D-approval.test.ts:179-235` — no tool executed twice
- `cognate/test/J-I-work-details.test.ts:9-58` — a setting across three boots
- `tests/architecture/event-history-authoritative.test.ts` — delete the derived state, prove the rebuild
- `cognate/.gitignore` — `.data/`, `.generated/`, `*.sqlite`, `secrets.json`
