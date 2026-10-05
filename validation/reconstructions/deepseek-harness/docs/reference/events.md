# Event and continuation reference

Every event type in the log, who emits it, what carries it, and which projection folds it.

Envelope fields on every event: `eventType`, `payload`, `tenant`, `correlationId`, `runId`,
`recordedAt`. This page documents the payload and the two conventions that keep surprising people
surprised: **routing lives on the envelope**, and **lifecycle events carry no payload ids**.

---

## Who emits what

| Emitter | Events |
|---|---|
| `agent.coding` (`ctx.emit`) | `session.turn.started`, `message.completed`, `turn.failed`, `model.request.retried`, `tool.call.started`, `tool.call.completed`, `tool.call.failed`, `tool.approval.requested`, `tool.approval.decided`, `plan.mode.changed`, `plan.todos.updated`, `plan.review.requested`, `plan.review.decided`, `subagent.spawned` |
| `agent.config` (`ctx.emit`) | `model.configured`, `workspace.added`, `workspace.selected`, `onboarding.dismissed`, `settings.changed` |
| The runtime executor | `run.invocation`, `run.invocation.progress`, `run.waiting`, `run.cancelled`, `run.failed`, and the rest of the `run.*` lifecycle set |

---

## Turn events

### `session.turn.started`

| | |
|---|---|
| Emitted by | `agent.coding`, as the first thing in `run()` |
| Payload | `{sessionId, workspaceId, message}` |
| Folded by | `sessions` — creates the row, sets `title` (first turn only), `lastStatus: "running"`, `runId`, `updatedAt` |
| Note | The title is set **here**, from the human message, at 80 chars. That is why a session is named before its answer arrives. |

### `message.completed`

| | |
|---|---|
| Emitted by | `agent.coding` on every terminal success path: a plain model answer, the tool-step limit, and `/plan off` |
| Payload | `{sessionId, workspaceId, text}` |
| Folded by | `sessions` (`lastStatus: "completed"`, keeping the existing title); `subagents` **when the correlation is `subagent:`** (sets the child's `status: "completed"` and `output`) |
| Note | Also the UI's completion signal. **Not emitted for a cancelled or failed run.** |
| Read by | `session.history`, for the assistant message |

### `turn.failed`

| | |
|---|---|
| Emitted by | `agent.coding` — `invokeModelGenerate`, after the retry budget is spent, immediately before it throws |
| Payload | `{code, message}` — e.g. `{code: "HTTP_500", message: "Internal server error"}` |
| Folded by | nothing |
| Read by | the UI's `useStreamingTurn` → the failure block |
| Codes | `TIMEOUT`, `HTTP_500`, `HTTP_<status>`. See [cancellation-and-failure.md](../workflows/cancellation-and-failure.md). |

### `model.request.retried`

| | |
|---|---|
| Emitted by | `agent.coding` — once per retry, before the backoff step |
| Payload | `{attempt, maxRetries, error: {code, message}}` |
| Folded by | nothing |
| Read by | the UI's retry disclosure |
| Guarantee | Exactly 5 events with `attempt` `[1,2,3,4,5]` before a terminal failure; none at all if the first attempt succeeds. `maxRetries` is always 5. |

---

## Tool events

### `tool.call.started`

| | |
|---|---|
| Emitted by | `agent.coding` for **every** tool call, before any gate is consulted |
| Payload | `{sessionId, toolCallId, tool, args}` |
| Folded by | nothing |
| Read by | the UI's `useToolTimeline` (creates the entry) |
| Invariant | Emitting it after an approval would leave a pending approval with no visible tool card. Do not reorder. |

### `tool.call.completed`

| | |
|---|---|
| Payload | `{sessionId, toolCallId, tool, result}` |
| `result` | `read` → `{file_path, content}`; `edit` → `{file_path, replacements, diffLines, additions, deletions}`; `bash` → `{command, exitCode, stdout, stderr, timedOut}`; `run_code` → `{exitCode, stdout, stderr, timedOut}`; `todo_write` → `{todos}`; `subagent` → `{childRunId}`; `exit_plan_mode` → `{approved: true}` |
| Read by | the UI timeline; `MessageBubble` renders the result, and an `edit` result's `diffLines` drive the diff card and the review panel |

### `tool.call.failed`

| | |
|---|---|
| Payload | `{sessionId, toolCallId, tool, error}` |
| `error` | The same text that is fed back to the model, so a UI reader and the model see one message |
| Common values | `fs_not_observed: read <p> before editing it`; `path escapes workspace root: <p>`; `old_string not found in <f>`; `the user rejected escalating this program to "<perm>"; …`; `exit_plan_mode is only available in plan mode`; the plan request-changes text |
| Note | Emitted for a **denied approval** as well as for a failing tool. A denial and a crash are the same event type; distinguish them by whether `tool.approval.decided` preceded it. |

---

## Approval events

### `tool.approval.requested`

| | |
|---|---|
| Emitted by | `agent.coding`, only when `approvalGate` returns `required: true` |
| Payload | `{sessionId, toolCallId, tool, permission, justification}` |
| Folded by | `sessions` — sets `mode: "ptc"` on the session row, **sticky and never cleared** |
| Read by | the UI timeline, to mark the entry's approval `pending` |
| Trigger | Exactly: `tool === "run_code"` with a non-empty `sandbox_permissions` string whose rank exceeds the session access mode's. |

### `tool.approval.decided`

| | |
|---|---|
| Payload | `{sessionId, toolCallId, approved}` |
| Folded by | nothing |
| Read by | the UI timeline, to move the entry's approval to `approved`/`denied` |
| Emitted | Immediately after the continuation resumes, before the tool runs or the denial is fed back. |

---

## Plan events

### `plan.mode.changed`

| | |
|---|---|
| Payload | `{sessionId, on}` |
| Folded by | `plans` — sets `on` |
| Emitted | `/plan ` prefix at turn start; `/plan off`; plan-review approval |
| Note | Does **not** clear `review` — the completed-session plan affordance refers back to it. |

### `plan.todos.updated`

| | |
|---|---|
| Payload | `{sessionId, todos: [{content, status}]}` |
| Folded by | `plans` — replaces `todos` wholesale |
| Emitted | On every `todo_write` call, **whether or not plan mode is on** |

### `plan.review.requested`

| | |
|---|---|
| Payload | `{sessionId, toolCallId, heading, markdown}` |
| Folded by | `plans` — `review = {status: "pending", toolCallId, heading, markdown}` |
| Emitted | Just before `ctx.waitFor("plan-review:<toolCallId>")` opens |
| `heading` | The plan's first markdown heading, minus the `#`s. Falls back to the first non-empty line truncated to 80 chars. |

### `plan.review.decided`

| | |
|---|---|
| Payload | `{sessionId, toolCallId, approved}` |
| Folded by | `plans` — `review.status` becomes `approved` or `changes_requested`, **but only if `toolCallId` matches the stored review**; otherwise the fold returns `[]` |
| `feedback` | Carried in the continuation's resume input, not in this event, so a rejected review's text is not in the log |

---

## Delegation events

### `subagent.spawned`

| | |
|---|---|
| Emitted by | `agent.coding`, immediately after `subagent.start` returns |
| Payload | `{sessionId, toolCallId, description, prompt, childRunId}` |
| Folded by | `subagents` — creates the row keyed `<tenant>/<parentRunId>/<toolCallId>` with `status: "running"` |
| Note | Emitted on the **parent's** run. The child's completion is observed from the child's own events, because the parent does not wait. |

---

## Configuration events (all emitted by `agent.config`)

| Event | Payload | Folded into | Absent row means |
|---|---|---|---|
| `model.configured` | `{providerId, baseURL, protocol, model}` | `model-config` row `current` | no model configured → the composer is disabled |
| `workspace.added` | `{workspaceId, path, title}` | `workspaces` row `record/<id>` | — |
| `workspace.selected` | `{workspaceId}` | `workspaces` row `current` (a bare string) | no workspace → the composer is disabled |
| `onboarding.dismissed` | `{step: "notice" \| "apikey"}` | `onboarding` row `notice` / `apikey` | that first-run dialog has not been dismissed |
| `settings.changed` | `{workDetails}` | `settings` row `current` | work details is `standard` |

`model.configured` is emitted with the `kind` field destructured out, so the payload never contained a
secret. That is the mechanism behind the write-only credential contract.

---

## Runtime lifecycle events

| Event | Payload | Folded by | Note |
|---|---|---|---|
| `run.invocation` | the capability's arguments and result | nothing | How every `ctx.invoke` is recorded. This is what makes replay return recorded results. |
| `run.invocation.progress` | `{kind: "text", text}` plus `metadata.attempt` | nothing | The streaming channel. The UI discards deltas from a superseded attempt — see `useStreamingTurn`. |
| `run.waiting` | **no payload ids** | `sessions` | The session is recovered from `correlationId`. Also what drives `lastStatus: "waiting"`. |
| `run.cancelled` | **no payload ids** | `sessions` (`cancelled`), `subagents` (`failed`, when the correlation is `subagent:`) | |
| `run.failed` | **no payload ids** | `sessions` (`failed`), `subagents` (`failed`) | Distinct from the agent's own `turn.failed`. |

**The convention, stated once:** agent-emitted events carry their ids in the payload;
runtime-emitted lifecycle events carry them only on the envelope's `correlationId`. A projection that
handles both must read the payload defensively and fall back to the correlation.

---

## Continuations

A continuation is not an event; it is durable state a `ctx.waitFor` creates. Two types exist.

| | `tool-approval` | `plan-review` |
|---|---|---|
| Created by | `ctx.waitFor("approve:<toolCallId>")` | `ctx.waitFor("plan-review:<toolCallId>")` |
| Condition | `{kind: "human_approval"}` | `{kind: "human_approval"}` |
| Payload | `{tool, args, permission, justification}` | `{tool, toolCallId, heading, markdown}` |
| Resume input | `{approved: boolean}` | `{approved: boolean, feedback?: string}` |
| Affirmative result | the tool runs | `plan.mode.changed {on:false}`; `tool.call.completed {approved:true}`; result text `Plan approved — plan mode exited; carry out the plan starting with your next step.` |
| Negative result | tool **not** invoked; `tool.call.failed`; result text `Error: the user rejected escalating this program to "<permission>"; it stays denied, so stop and explain instead of working around it` | stays in plan mode; `tool.call.failed`; result text `Error: the user requested changes to this plan[: <feedback>]; revise the plan and call exit_plan_mode again` |
| Puts the run in | `waiting` | `waiting` |
| Resolved by | `client.resolveContinuation(id, "resume", {approved})` | same, plus optional `feedback` |

Both are resolved with action `"resume"`. Continuations are durable: an open one survives a full
process restart with the run still `waiting`. See
[../workflows/approval-gate.md](../workflows/approval-gate.md#the-continuation-is-durable-and-that-is-a-deliberate-divergence).

---

## Reading the log directly

```ts
import { Database } from "bun:sqlite";
const db = new Database("<home>/app.sqlite", { readonly: true });
const rows = db.query("SELECT event_type, payload, correlation_id, run_id, recorded_at FROM events ORDER BY id").all();
```

Relevant tables: `events` (envelope), `payloads` (bodies), `records` and `projection_state` (derived
rows), `projection_checkpoints` (each projection's position). `J-CFG-model-provider.test.ts` opens
the file this way to prove a secret is absent from all four.

## Related

- [projections.md](projections.md) — which fold reads which event
- [capabilities.md](capabilities.md) — what produces the `run.invocation` records
- [../workflows/run-a-turn.md](../workflows/run-a-turn.md) — the order they arrive in
- [../subsystems/projections.md](../subsystems/projections.md) — the fold mechanics
- [../subsystems/agent-coding.md](../subsystems/agent-coding.md) — the emit sites
