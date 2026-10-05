# Projection reference

Seven public projections, all registered with `public: true` in `cognate/src/server.ts`.

**Key convention:** rows are written as `` `${event.tenant}/…` `` and `readProjection` **strips the
tenant prefix** before returning them. So `local/current` reads back as `current`, and
`local/record/<id>` as `record/<id>`. The two tables below give the written key; the *read* key is that
value minus the `local/` prefix.

---

## `model-config`

| | |
|---|---|
| Source | `cognate/src/projections/modelConfig.ts` |
| Folds | `model.configured` |
| Rows | one per tenant |

| Key (written) | Value |
|---|---|
| `<tenant>/current` | `{providerId, baseURL, protocol, model, configuredAt}` |

`protocol` is always the literal `"openai-compatible"`. No row ⇒ no model configured ⇒ the composer is
disabled. Read by `server.ts` on boot (to re-mount the provider) and by the UI.

## `workspaces`

| | |
|---|---|
| Source | `cognate/src/projections/workspaces.ts` |
| Folds | `workspace.added`, `workspace.selected` |

| Event | Key | Value |
|---|---|---|
| `workspace.added` | `<tenant>/record/<workspaceId>` | `{id, path, title}` |
| `workspace.selected` | `<tenant>/current` | the bare `workspaceId` **string**, not an object |

`record/*` keys are how `server.ts` reseeds `knownWorkspaceIds` on boot. `current` holding a string
rather than an object is easy to misread. Read by the UI and by the `workspace.path` capability.

## `sessions`

| | |
|---|---|
| Source | `cognate/src/projections/sessions.ts` |
| Folds | `session.turn.started`, `message.completed`, `run.waiting`, `tool.approval.requested`, `run.cancelled`, `run.failed` |
| Guard | **Only events whose `correlationId` starts with `session:`.** This is what keeps subagent children out of the session list. |

| Key | Value shape |
|---|---|
| `<tenant>/<sessionId>` | `{id, workspaceId, title, lastStatus, runId, updatedAt, mode?}` |

| `lastStatus` | Set by |
|---|---|
| `running` | `session.turn.started` |
| `completed` | `message.completed` |
| `waiting` | `run.waiting` |
| `cancelled` | `run.cancelled` |
| `failed` | `run.failed` |

| Field | Rule |
|---|---|
| `title` | The first human message, whitespace-collapsed, truncated to 80 chars with `…`. Set at `session.turn.started` and **not** overwritten by a later turn or by `message.completed`. Falls back to the answer text only if a `session.turn.started` was somehow never seen. |
| `mode` | `"ptc"` once the session has ever emitted `tool.approval.requested`. Sticky; never cleared. Drives the header's "PTC mode" vs "Standard mode" badge. Absent ⇒ standard. |
| `runId` / `updatedAt` | The run and the event's `recordedAt` that last touched the row. `openSession` uses them to reattach to an in-flight run. |

Two behaviours to preserve. `run.waiting` and the cancelled/failed branches return `[]` when there is
no existing row, so a lifecycle event never invents a session. And those same events recover the
session id from `correlationId`, because their payloads carry none.

## `plans`

| | |
|---|---|
| Source | `cognate/src/projections/plans.ts` |
| Folds | `plan.mode.changed`, `plan.todos.updated`, `plan.review.requested`, `plan.review.decided` |

| Key | Value |
|---|---|
| `<tenant>/<sessionId>` | `PlanState` = `{sessionId, on, todos: TodoItem[], review?: PlanReview}` |

`TodoItem` = `{content, status}`. `PlanReview` = `{status, toolCallId, heading, markdown}` with
`status` of `pending | approved | changes_requested`.

| Event | Effect |
|---|---|
| `plan.mode.changed` | sets `on`; **preserves** `review` and `todos` |
| `plan.todos.updated` | replaces `todos` wholesale |
| `plan.review.requested` | replaces `review` with `status: "pending"` |
| `plan.review.decided` | sets `review.status`; **only if `toolCallId` matches**, else `[]` |

No row ⇒ `{sessionId, on: false, todos: []}` (that default lives in the `plan.state` capability).
Read by the capability and by the UI's to-do widget, plan review card, and "Plan awaiting review"
prefix.

## `subagents`

| | |
|---|---|
| Source | `cognate/src/projections/subagents.ts` |
| Folds | `subagent.spawned` (parent run), `message.completed` and `run.failed` (**child** run) |
| Key | `<tenant>/<parentRunId>/<toolCallId>` |

`SubagentRow` = `{parentRunId, sessionId, toolCallId, childRunId, title, desc, prompt, status,
startedAt, completedAt?, output?}`.

| Field | Meaning |
|---|---|
| `title` | The tool call's `description` argument |
| `desc` | The `prompt` argument, truncated to 40 chars — the tree row's secondary text |
| `prompt` | The `prompt` in full — the child transcript panel's first message |
| `status` | `running` → `completed` (with `output`) or `failed` |
| `output` | The child's final answer text, from `message.completed`'s `text` |

The correlation parser splits `subagent:<parentRunId>:<toolCallId>` on the **first** colon only, so a
`toolCallId` containing colons survives. A completion for a row that does not exist returns `[]`, and a
`run.failed` for a row not in `running` is ignored.

Read by the UI (the "N subagent(s)" disclosure, the tree, the child panel) and by `session.history`.

## `onboarding`

| | |
|---|---|
| Source | `cognate/src/projections/onboarding.ts` |
| Folds | `onboarding.dismissed` |

| Key | Value |
|---|---|
| `<tenant>/notice` | `{dismissed: true, at}` |
| `<tenant>/apikey` | `{dismissed: true, at}` |

Any other `step` value is ignored. **No row ⇒ that dialog appears.** This is the whole mechanism by
which a fresh `COGNATE_HARNESS_HOME` shows the first-run pair.

## `settings`

| | |
|---|---|
| Source | `cognate/src/projections/settings.ts` |
| Folds | `settings.changed` |

| Key | Value |
|---|---|
| `<tenant>/current` | `{workDetails, updatedAt}` |

**No row ⇒ `standard`.** One row per tenant, overwritten by each change — so this is a current value,
not a history. The history is the events.

---

## Quick reference: who reads what

| Reader | `model-config` | `workspaces` | `sessions` | `plans` | `subagents` | `onboarding` | `settings` |
|---|---|---|---|---|---|---|---|
| `server.ts` boot | ✓ | ✓ | | | | | |
| `workspace.path` capability | | ✓ | | | | | |
| `session.history` capability | | | | | ✓ | | |
| `plan.state` capability | | | | ✓ | | | |
| `app.sqlite` event-history-authoritative test | | ✓ | ✓ | ✓ | ✓ | | |
| the UI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Invariants

1. **Pure.** No I/O, no clock, no randomness. `event.recordedAt` is the only time source.
2. **Total.** Unrecognised events return `[]`.
3. **Tenant-scoped keys.** Every key starts with the tenant, and the client never sees it.
4. **No row is a value.** Three projections use absence as a default; treat that as part of the
   contract, not an implementation detail.
5. **No two projections write the same key.**
6. **Deleting every row changes nothing.** Verified by
   `tests/architecture/event-history-authoritative.test.ts`.

## Reading them

```ts
// server side, inside a capability handler
const caller = { actor: ctx.actor, tenant: ctx.tenant ?? "local" };
const rows = await service.readProjection(caller, { name: "plans" });
const row = rows.find((r) => r.key === sessionId);   // tenant prefix already stripped
```

```ts
// browser
const sessions = useProjection("sessions", caller);
```

## Related

- [events.md](events.md) — the payloads these fold
- [../subsystems/projections.md](../subsystems/projections.md) — the fold mechanics and the failure modes
- [../how-to/add-a-projection.md](../how-to/add-a-projection.md) — adding one
- [../explanation/durability-model.md](../explanation/durability-model.md) — why absence-as-default is a feature
