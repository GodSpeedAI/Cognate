# Subsystem: projections

Seven public projections, one file each under `cognate/src/projections/`. They are the only way the
browser reads application state, and the only derived state in the system.

## Purpose

Turn an append-only event log into named, tenant-scoped key/value rows that the interface can read
and subscribe to, cheaply and identically on every boot.

## Responsibilities

- Fold the event types they care about into rows.
- Key rows so that "the current thing" and "all the things" are both expressible.
- Be pure: no I/O, no clock reads beyond the event's own `recordedAt`, no randomness, no ordering
  assumptions beyond the log's order.
- Encode identity in the key when the event that creates a row is not the only source of that row's
  identity.

## Non-responsibilities

- Projections never write events and never invoke capabilities.
- They do not validate. A malformed payload becomes a malformed row; validation belongs at the
  producer.
- They are not durable state. Their rows can be deleted; `createRuntime` catches up from position 0
  on boot.
- They do not know about the browser. A projection is public because `server.ts` says so, not because
  it renders anything.

## Position in the system

Declared in `server.ts` inside the `projections` array, each as `{projection, public: true}`.
Written by: the agents (via `ctx.emit`) and, indirectly, by capabilities that start `agent.config`
runs. Read by: the browser through `readProjection` and `useProjection`, and by four capabilities
(`session.history`, `workspace.path`, `plan.state`, and `session.history`'s subagent fold).

## Shared conventions

**Keying.** Keys are built as `` `${event.tenant}/…` `` inside `apply`, and `readProjection` strips
the tenant prefix. So the browser sees `current`, `record/<workspaceId>`, `<sessionId>`,
`<parentRunId>/<toolCallId>`, or `notice` / `apikey`.

**State access.** `state` is a `Map` of the projection's own rows, keyed exactly as they will be
stored (tenant prefix included). Two projections read it — `sessions` for "has this session already
been titled" and "does a row exist at all" — and several ignore it.

**Event-type dispatch.** Every projection is a chain of `if (event.eventType === …)` guards returning
`[]` for anything unrecognised. There is no default branch that throws.

**The "absence is the value" pattern.** Three projections rely on a row *not existing* to mean a
default: `settings` (no row → work details is `standard`), `onboarding` (no row → the first-run
dialogs reappear), `plans` (no row → plan mode off, no to-dos). This is why a fresh
`COGNATE_HARNESS_HOME` is a meaningful state in its own right.

---

## `model-config`

Folds `model.configured` into a single `current` row per tenant: `{providerId, baseURL, protocol,
model, configuredAt}`. The folded payload never contained a secret — the capability that starts the
`agent.config` run destructures the non-secret fields before emitting.

Read by: `server.ts` on boot (to re-mount the provider) and the UI (to show the configured model and
to prefill the Edit wizard).

## `workspaces`

- `workspace.added` → `record/<workspaceId>` = `{id, path, title}`.
- `workspace.selected` → `current` = the bare `workspaceId` string (not an object).

Read by: `server.ts` (seeding `knownWorkspaceIds` on boot, keyed off the `record/` prefix), the UI
(the sidebar workspace label), and `workspace.path` (the agent's per-turn root resolution).

## `sessions`

The most stateful projection, because it reconstructs status from events the runtime emits and the
agent emits, in a fixed order. It **ignores anything not correlated `session:`** — that single guard
is what keeps subagent child runs out of the session list.

| Event | Effect |
|---|---|
| `session.turn.started` | `lastStatus: "running"`, `runId`, `updatedAt`; sets the title from the message the first time only |
| `message.completed` | `lastStatus: "completed"`, `runId`, `updatedAt`; keeps the existing title |
| `run.waiting` | `lastStatus: "waiting"`, `runId` — requires a correlation-derived sessionId **and** an existing row |
| `tool.approval.requested` | sets `mode: "ptc"` — sticky, never cleared |
| `run.cancelled` | `lastStatus: "cancelled"` |
| `run.failed` | `lastStatus: "failed"` |

Three details worth internalising:

- **The title is the literal first human message, truncated to 80 characters with an ellipsis, set at
  turn *start*.** A second turn in the same session must not overwrite it. This matches the observed
  reference behaviour and is asserted by `J-B-basic-session` and `J-G-persistence`.
- **Lifecycle events carry no payload ids.** `run.waiting`, `run.cancelled`, and `run.failed` have no
  `sessionId` in their payload, so the row is found by parsing `session:<id>` out of
  `event.correlationId`.
- **A missing row is not created by a lifecycle event.** If no `session.turn.started` has been seen
  for that session, `run.waiting` and friends return `[]` rather than inventing a row.

Read by the UI for the sidebar tree, the "Waiting for approval" prefix and badge, the mode badge, and
whether to reattach to a still-in-flight run on reopen.

## `plans`

One row per session, folding four events into `{sessionId, on, todos, review?}`:

- `plan.mode.changed` → `{on}`
- `plan.todos.updated` → `{todos}` (whole-array replacement)
- `plan.review.requested` → `review = {status: "pending", toolCallId, heading, markdown}`
- `plan.review.decided` → `review.status` becomes `"approved"` or `"changes_requested"`, **but only if
  the `toolCallId` matches the stored review**; otherwise it returns `[]`.

`plan.mode.changed` deliberately does not clear `review` — the completed-session "Open plan" affordance
refers back to it after plan mode exits.

Read by `plan.state` (the agent's per-turn check) and the UI (to-do widget, plan review card, and the
"Plan awaiting review" sidebar prefix).

## `subagents`

One row per `subagent` tool call, keyed `<parentRunId>/<toolCallId>`. This is the unusual one: it
observes a **child run's** events rather than anything the parent emits, because delegation is
fire-and-forget and the parent has no way to know when the child finishes.

- `subagent.spawned` (on the parent's run) → create the row:
  `{parentRunId, sessionId, toolCallId, childRunId, title: description, desc: prompt truncated to 40,
  prompt: prompt in full, status: "running", startedAt}`.
- `message.completed` on correlation `subagent:<parentRunId>:<toolCallId>` → `status: "completed"`,
  `completedAt`, `output`.
- `run.failed` on that correlation → `status: "failed"`, `completedAt` (only if it was still running).

`parseSubagentCorrelation` splits on the **first** colon only, so a `toolCallId` that itself contains
colons stays intact. A completion for an unknown row returns `[]`.

Read by the UI (the "N subagent(s)" disclosure, the subagent tree, the child transcript panel) and by
`session.history` (so a completed child's result reaches the parent on its next turn).

## `onboarding`

Folds `onboarding.dismissed` into one row per step, `notice` or `apikey`:
`{dismissed: true, at}`. Ignores any other step value. Absence of a row for a step is exactly what
makes that dialog reappear.

## `settings`

Folds `settings.changed` into a single `current` row: `{workDetails, updatedAt}`. Absence of the row
is what makes the UI fall back to `standard`. `J-I-work-details.test.ts` asserts the row is absent on a
fresh home, present after an invoke, and still present after a full runtime restart.

---

## State

Each projection owns one namespace of rows. No two projections write the same key. The store's
`records` and `projection_state` tables hold them; `projection_checkpoints` holds each projection's
event position.

## Lifecycle

`createRuntime` runs `ProjectionRunner.catchUp()` for every registered projection before returning, so
by the time `startServer` continues, every projection is current. After that the runner applies new
events as they commit, and the app reads through `readProjection` (point-in-time) or the browser's
`useProjection` (subscribed).

## Failure modes

| Symptom | Cause |
|---|---|
| A row never appears after a restart | the projection is not in the `projections` array, or the producing event is not emitted |
| A key lookup by full `tenant/…` fails from the browser | `readProjection` already stripped the prefix |
| `run.waiting`/`cancelled`/`failed` ignored | no correlation id, or no prior `session.turn.started` for that session |
| Subagent row stuck `"running"` | the child never emitted `message.completed` and never failed |
| `plan.review.decided` ignored | the `toolCallId` did not match the stored review |
| A second turn renames the session | a modified `sessions` title rule; the `existing?.title !== "New Session"` guard is the thing to check |
| Projections diverge after deleting state | a real bug — `tests/architecture/event-history-authoritative.test.ts` is the gate for this |

## Extension points

- A new projection: pure `apply`, add it to `server.ts` with `public: true` if the browser should read
  it. → [../how-to/add-a-projection.md](../how-to/add-a-projection.md)
- A new event folded by an existing projection: add a branch. Keep the guards narrow; a projection
  that reacts to events it does not own will pick up unrelated traffic.
- A new *lifecycle* status on a session row: add a branch that parses the correlation id, and remember
  that runtime-emitted events carry no payload ids.

## Source trail

- `cognate/src/projections/modelConfig.ts:5-26` — `modelConfigProjection`
- `cognate/src/projections/workspaces.ts:4-18` — `workspacesProjection`
- `cognate/src/projections/sessions.ts:15-20` — `titleFrom`, 80-char truncation
- `cognate/src/projections/sessions.ts:24-26` — `sessionIdFromCorrelation`
- `cognate/src/projections/sessions.ts:37` — the `session:` correlation guard
- `cognate/src/projections/sessions.ts:98-104` — the sticky `mode: "ptc"` badge
- `cognate/src/projections/sessions.ts:111-119` — cancelled/failed status
- `cognate/src/projections/plans.ts:11-32` — `TodoItem`, `PlanReview`, `PlanState`
- `cognate/src/projections/plans.ts:70-80` — `plan.review.decided` toolCallId guard
- `cognate/src/projections/subagents.ts:46-52` — `parseSubagentCorrelation`
- `cognate/src/projections/subagents.ts:54-103` — `subagentsProjection`
- `cognate/src/projections/onboarding.ts:9-18` — `onboardingProjection`
- `cognate/src/projections/settings.ts:6-19` — `settingsProjection`
- `cognate/src/server.ts:169-177` — the registration array
- `cognate/test/J-G-persistence.test.ts:54-71` — rows and history after a restart
- `cognate/test/J-I-work-details.test.ts:17-30` — absence as the default
- `tests/architecture/event-history-authoritative.test.ts` — delete-all-projection-state rebuild
