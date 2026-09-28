# Workflow: the approval gate

Journey `J-D-approval`. A `run_code` call that asks for more authority than the session currently has
stops the run until a human decides.

## Summary

`approvalGate` is a pure function over `(tool, args, mode)`. When it says approval is required, the
agent emits a request event and opens a durable `tool-approval` continuation, which puts the run into
`waiting`. The browser answers with `{approved: boolean}`. Approved runs the tool; denied does not and
feeds a specific refusal text back to the model.

## The rule

```ts
const PERMISSION_RANK = { "read-only": 0, "workspace-write": 1, "full-access": 2 };

if (request.tool !== "run_code") return { required: false };
const permission = request.args.sandbox_permissions;
if (typeof permission !== "string" || permission.length === 0) return { required: false };
const mode = request.mode ?? "read-only";
if (rank(permission) <= rank(mode)) return { required: false };
return { required: true, permission, justification };
```

`normalize` trims, lowercases, and collapses whitespace to hyphens, so `"Workspace Write"` and
`"workspace-write"` are the same value. `rank` returns `+Infinity` for anything unrecognised — so an
unknown permission, or an unknown mode, ranks above every known permission. **That is the fail-closed
property**: the gate escalates rather than waves through something it does not understand.

Why only `run_code`: in the reference, sandbox escalation lives on `run_code` and not on `bash` — the
`bash` schema has no `sandbox_permissions` field. `read`, `edit`, and `bash` therefore never reach the
gate, and `run_code` without the field never triggers it.

`mode` defaults to `"read-only"`. The composer's access-mode dropdown exists in the UI but is inert, so
this default is not yet wired to a user control. `AgentCodingInput.mode` exists so that can be fixed
without touching the gate.

## Sequence — allow branch

1. The model returns `run_code {code, description, sandbox_permissions: "workspace-write", justification}`.
2. `tool.call.started` is emitted.
3. `tool.approval.requested {sessionId, toolCallId, tool, permission, justification}` is emitted.
4. `ctx.waitFor("approve:<toolCallId>", {type: "tool-approval", condition: {kind:"human_approval"}, payload: {tool, args, permission, justification}})`.
   The executor persists the continuation and the run's status becomes `waiting`. `run.waiting` is
   emitted; the `sessions` projection reads the session id out of the correlation and sets
   `lastStatus: "waiting"`, which is what puts the "Waiting for approval" prefix and badge in the
   sidebar.
5. The `sessions` projection also sets `mode: "ptc"` on the first `tool.approval.requested` — sticky,
   so the header badge changes permanently for that session.
6. The browser's `useToolTimeline` marks the entry's `approval.status = "pending"`; `App` renders
   `ApprovalBar` **in place of the composer**.
7. The operator chooses. `resolveContinuation(id, "resume", {approved: true})`.
8. `tool.approval.decided {approved: true}` is emitted, the tool runs through the normal
   `invokeTool` path, `tool.call.completed` is emitted, and the loop continues.

## Sequence — deny branch

Steps 1–6 are identical. Then:

7. `resolveContinuation(id, "resume", {approved: false})`.
8. `tool.approval.decided {approved: false}` is emitted.
9. `tool.call.failed` is emitted with the denial text, and **the tool is not invoked**.
10. The denial text is pushed as the tool result:

```
Error: the user rejected escalating this program to "workspace-write"; it stays denied, so stop and explain instead of working around it
```

The wording is deliberate and reference-matched. Two phrases carry weight: *"it stays denied"* (so the
model does not retry the same escalation) and *"stop and explain instead of working around it"* (so it
does not achieve the same effect by another tool). `J-D-approval` asserts both substrings appear in
the run's final text.

## The continuation is durable, and that is a deliberate divergence

The reference keeps a pending approval across a page reload but **silently finalizes the turn as
"Worked" after a full process restart** — no approval card, no answer. This reconstruction does not
reproduce that. An open continuation is SQLite-backed state, so a full `stop()` plus a fresh
`startServer` against the same home leaves the continuation `OPEN` and the run `waiting`, and
resolving it then still completes the run. `J-D-approval`'s third test asserts exactly that.

Making this work required one supporting change: `server.ts` re-mounts the last-configured provider on
boot, because a run resumed after a restart needs a live `model.generate` before it can finish.

The `Expectations.approvalSurvivesRestart` flag is how the Playwright journey suite expresses this:
the same spec asserts the behaviour, reading the expected value from the driver, so the reference
asserts "finalized" and Cognate asserts "still open" from one piece of code.

## State changes

```
events:       tool.call.started → tool.approval.requested → run.waiting
              → [operator decides] → tool.approval.decided → tool.call.completed | tool.call.failed → message.completed
continuation: OPEN → resolved
sessions row: lastStatus running → waiting → running → completed; mode → "ptc"
```

The run passes through `waiting` twice in principle — once for the approval, once for the completion —
but the UI reattaches on the same `runId`, so the operator sees one continuous turn.

## Failure branches

| Situation | Behaviour |
|---|---|
| Denied | the tool is not invoked; the denial text goes back to the model |
| Approved but the tool then fails | normal tool failure: `tool.call.failed` with the tool's own error |
| `sandbox_permissions` present but not a string, or empty | not an escalation; the gate returns `required: false` |
| An unrecognised permission or mode | fail-closed: ranked `+Infinity`, so it *is* an escalation |
| Server restarts while waiting | continuation stays `OPEN`, run stays `waiting` |
| Page reloads while waiting | `openSession` sees `lastStatus: "waiting"` with a `runId` and reattaches, so the approval bar reappears |
| The UI is open but the projection has not caught up | `PlanReviewCard` reads from the continuation; `ApprovalBar` reads from the tool timeline, which is event-driven — so neither depends on the projection row |
| A second approval in the same turn | the loop is sequential, so the first must resolve before the next call is dispatched |
| Denied, then the model retries the same escalation | nothing prevents it; the denial text is the app's only countermeasure. This is a real limitation of a textual contract rather than an enforced one |

## Sequence diagram

```mermaid
sequenceDiagram
  participant M as Model
  participant A as agent.coding
  participant L as Event log / store
  participant U as Operator
  participant UI as App

  M-->>A: run_code {sandbox_permissions:"workspace-write", justification}
  A->>L: tool.call.started
  A->>A: approvalGate → required
  A->>L: tool.approval.requested {permission, justification}
  A->>L: ctx.waitFor → continuation OPEN, run waiting
  L-->>UI: run.waiting, tool.approval.requested
  UI-->>U: ApprovalBar replaces the composer
  U->>L: resolveContinuation(id, "resume", {approved})
  alt approved
    L-->>A: resume {approved:true}
    A->>L: tool.approval.decided {approved:true}
    A->>L: invoke tool.run_code → tool.call.completed
  else denied
    L-->>A: resume {approved:false}
    A->>L: tool.approval.decided {approved:false}
    A->>L: tool.call.failed (denial text)
    Note over A: text fed back to the model;<br/>tool NOT invoked
  end
  A->>M: next call with the result
```

## Source trail

- `cognate/src/domain/approvalGate.ts:13-31` — request and decision types
- `cognate/src/domain/approvalGate.ts:35-43` — `PERMISSION_RANK`, `normalize`, `rank` (+Infinity)
- `cognate/src/domain/approvalGate.ts:52-60` — `approvalGate`
- `cognate/src/domain/approvalGate.ts:66-68` — `approvalDeniedToolResult`
- `cognate/src/agents/agentCoding.ts:298` — the gate call
- `cognate/src/agents/agentCoding.ts:351-372` — the approval branch
- `cognate/src/projections/sessions.ts:85-104` — `run.waiting` and the sticky `ptc` mode
- `cognate/src/ui/App.tsx:1190-1233` — `ApprovalBar`
- `cognate/src/ui/App.tsx:1913-1922` — `decideApproval`, matching the first `tool-approval` continuation
- `cognate/test/J-D-approval.test.ts:47-87` — the allow branch
- `cognate/test/J-D-approval.test.ts:89-122` — the deny branch and the exact denial substrings
- `cognate/test/J-D-approval.test.ts:124-177` — survival across a full restart
- `cognate/.sea/interaction/interaction-model.sea:153-164` — the `j_d_approval` instance
- `cognate/DEVIATIONS.md` — "Pending approvals survive a full server restart; the reference does not"
- `tests/drivers/types.ts:31-41` — `Expectations.approvalSurvivesRestart`
- `tests/journeys/D-approval.spec.ts` — both branches at the interface level
