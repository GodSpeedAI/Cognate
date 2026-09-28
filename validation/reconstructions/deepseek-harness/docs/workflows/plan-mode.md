# Workflow: plan mode

Journey `J-E-plan`. Plan mode is session state, not a capability: the agent emits four event types,
the `plans` projection folds them, and one read-only capability (`plan.state`) tells the agent where
it stands at the start of each turn.

## Summary

A `/plan ` prefix in the user's message turns plan mode on for this and following turns. The model's
`todo_write` calls maintain a visible to-do list. When the model calls `exit_plan_mode` with a
markdown plan, a `plan-review` continuation opens — a *distinct* mechanism type from a tool approval,
because the payload is a plan to review rather than a permission to allow. Approving exits plan mode
and feeds an exact reflection text back to the model; requesting changes returns feedback as a failed
tool call. Calling `exit_plan_mode` outside plan mode fails closed.

## Turning plan mode on and off

**On.** `splitPlanPrefix(message)` matches `/^\/plan\b\s*/i` (and is not the exact `/plan off`
command). If it matches and plan mode is off, the agent emits `plan.mode.changed {on: true}` **before
calling the model** and continues with the message text unchanged — the prefix is not stripped before
the model sees it, only recognised.

**Off by command.** `isPlanOffCommand(message)` matches exactly `/^\/plan\s+off$/i` on the trimmed
message. The agent then emits `plan.mode.changed {on: false}` (only if it was on), emits
`message.completed` with the text `"Plan mode off."`, and returns — **no model round trip**. The
composer's "Plan mode on, press to turn off" button works by sending exactly that message as a new
turn, which is why the same handler serves both.

**Off by approval.** Approving a plan review emits `plan.mode.changed {on: false}`.

## The to-do list

`todo_write {todos: [{content, status}]}` is handled inline, and **regardless of plan mode** — the
reference's to-do widget also works in a normal session. The agent emits `plan.todos.updated` (whole
array replacement) and `tool.call.completed` with `{todos}`, and feeds back
`Todos updated (N in progress, M pending).`

To-dos persist after plan mode exits: `plan.mode.changed` deliberately does not clear the `review`
field, and it does not touch `todos`.

## The plan review

```ts
const heading = extractPlanHeading(markdown);          // first markdown heading, else first 80 chars
emit plan.review.requested {sessionId, toolCallId, heading, markdown};
const decision = await ctx.waitFor(`plan-review:${call.id}`, {
  type: "plan-review",
  condition: {kind: "human_approval"},
  payload: {tool, toolCallId, heading, markdown},
});
emit plan.review.decided {sessionId, toolCallId, approved: decision.approved};
```

**Why a separate continuation type.** `BINDINGS.md` and the code comment both say it: a plan review's
payload and outcome differ from a tool approval's. A review carries a heading and markdown and its
"negative" outcome is *request changes* (stay in plan mode, revise, re-present), not *deny* (stop).
Reusing `tool-approval` would conflate them, and the UI resolves the two by `continuation.type`.

**Approved:** `plan.mode.changed {on: false}`, the tool result is
`Plan approved — plan mode exited; carry out the plan starting with your next step.`, and
`tool.call.completed` with `{approved: true}`.

**Changes requested:** the tool result is
`Error: the user requested changes to this plan[: <feedback>]; revise the plan and call exit_plan_mode again`,
and `tool.call.failed` is emitted. **This wording is this app's own invention** — the reference path
was not exercised during the pinned capture, so it is shaped by the journey's step description rather
than copied. `J-E-plan` deliberately asserts only the approve branch for the same reason.

**Not in plan mode:** the result is exactly
`Error: exit_plan_mode is only available in plan mode` and `tool.call.failed` is emitted. No
continuation is opened. `J-E-plan`'s second test asserts both the text and the absence of any
`plan-review` continuation.

## Presentation

- The `plans` projection drives the to-do widget, the plan review card, and the sidebar's
  "Plan awaiting review " prefix on the session title.
- The `PlanReviewCard` renders from the **continuation payload**, not the projection, so it appears
  immediately. It replaces the composer, and has a "View full plan" disclosure because there is no
  right-sidebar plan tab.
- The completed-session "Open plan: `<title>`" button exists but is disabled — no plan-artifact
  viewer.

## State changes

```
events:  plan.mode.changed {on}          → plans.on
         plan.todos.updated {todos}      → plans.todos
         plan.review.requested {…}       → plans.review = {pending, toolCallId, heading, markdown}
         plan.review.decided {approved}  → plans.review.status = approved | changes_requested
         run.waiting                     → sessions.lastStatus = "waiting"
```

`plan.review.decided` is **ignored unless its `toolCallId` matches the stored review** — a stale
decision cannot resolve a newer review.

## Failure branches

| Situation | Behaviour |
|---|---|
| `exit_plan_mode` outside plan mode | fails closed, no continuation |
| `exit_plan_mode` with a plan that has no heading | falls back to the first non-empty line, truncated to 80 characters |
| Approve, then a new `plan.review.requested` | the new request replaces the review field |
| Deny, then approve a later review | each `decided` must match that review's own `toolCallId` |
| A review is open and the operator reloads | `openSession` reattaches via `lastStatus: "waiting"`; the `plan-review` continuation is re-listed by the runtime |
| `/plan off` while already off | no `plan.mode.changed` is emitted; `"Plan mode off."` is still returned |
| `todo_write` in a non-plan session | recorded and shown; plan mode is untouched |

## Sequence diagram

```mermaid
sequenceDiagram
  participant U as Operator
  participant A as agent.coding
  participant L as Event log
  participant P as plans projection
  participant UI as App

  U->>A: "/plan make a plan [[scenario:plan]]"
  A->>L: session.turn.started
  A->>A: invoke plan.state → {on:false}
  A->>L: plan.mode.changed {on:true}
  L->>P: fold → on:true
  P-->>UI: To-dos widget ready, composer placeholder switches
  A->>A: invoke model.generate
  A->>L: tool.call.started (todo_write)
  A->>L: plan.todos.updated {todos:[in_progress, pending]}
  A->>L: tool.call.completed
  A->>A: model returns exit_plan_mode {plan:"# Update greeting\n…"}
  A->>L: tool.call.started (exit_plan_mode)
  A->>L: plan.review.requested {heading:"Update greeting", markdown}
  A->>L: ctx.waitFor("plan-review:<id>") → run waiting
  L-->>UI: plan-review continuation open
  UI-->>U: PlanReviewCard replaces the composer
  U->>L: resolveContinuation(id,"resume",{approved:true})
  L-->>A: resume {approved:true}
  A->>L: plan.review.decided {approved:true}
  A->>L: plan.mode.changed {on:false}
  A->>L: tool.call.completed {approved:true}
  Note over A: model receives "Plan approved — plan mode exited;…"
  Note over P: todos persist, review.status = approved
```

## Source trail

- `cognate/src/agents/agentCoding.ts:262-274` — the plan-mode control flow at turn start
- `cognate/src/agents/agentCoding.ts:300-306` — the `todo_write` branch
- `cognate/src/agents/agentCoding.ts:307-330` — the `exit_plan_mode` branch
- `cognate/src/domain/planGate.ts:8-22` — `isPlanOffCommand`, `splitPlanPrefix`
- `cognate/src/domain/planGate.ts:27-32` — `extractPlanHeading`
- `cognate/src/domain/planGate.ts:37-52` — the three exact strings
- `cognate/src/projections/plans.ts:38-80` — the four folds and the `toolCallId` guard
- `cognate/src/capabilities/planState.ts:20-28` — the read side
- `cognate/src/ui/App.tsx:1235-1262` — `TodoWidget`
- `cognate/src/ui/App.tsx:1325-1397` — `PlanReviewCard`
- `cognate/src/ui/App.tsx:196-206` — `usePlanReviewPendingSessions`
- `cognate/test/J-E-plan.test.ts:45-119` — the full approve branch
- `cognate/test/J-E-plan.test.ts:121-149` — fail-closed outside plan mode
- `cognate/DEVIATIONS.md` — "Plan mode (T9)": no right-sidebar tab, the invented request-changes text
- `cognate/.sea/interaction/interaction-model.sea:166-177` — the `j_e_plan` instance
