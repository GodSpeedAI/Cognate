# Why gates are pure functions and blocks are continuations

## The question this answers

The app has two places where a human must answer before the agent can continue: a privileged tool
call, and a plan awaiting sign-off. Why are these built as a *pure decision function* plus a
*durable continuation*, rather than as a capability, a `Policy` declaration in the `.sea` model, or a
promise?

## Verified fact: the shape

```ts
// a pure function — no I/O, no runtime, no clock
approvalGate({tool, args, mode}) → {required, permission?, justification?}

// a durable suspension point, created by the agent
ctx.waitFor("approve:<toolCallId>", {type: "tool-approval", condition: {kind: "human_approval"}, payload})
```

Both halves are recorded in the durable log, and both are exercised by
`cognate/test/J-D-approval.test.ts`.

## Why not a capability

**Strong inference, from three converging pieces of evidence.** A capability is something a `Component`
publishes and a caller invokes. Neither of these things is one:

1. `cognate/BINDINGS.md` states the rule — an approval gate "is a policy decision over an
   already-invoked tool call's arguments, not itself an invokable capability; there is nothing for a
   `Component` to `provide`".
2. `cognate/.sea/interaction/handoff.md` says the `.sea` `Policy` construct "is a referenced
   constraint only", and warns downstream agents not to encode the authority rules as `.sea` `Policy`
   declarations "expecting them to be enforced". The real authority is the kernel policy plus the
   continuation machinery.
3. `cognate/domain/index.ts`'s doc comments for the T7 and T9 binding functions both say the same
   thing: `ApprovalGate` and `PlanMode` are "a pure decision function plus a `ctx.waitFor`
   continuation inside `agent.coding`, not as a `CapabilityContract`".

The practical consequence: a `tool.read` invocation is an I/O request a component can serve; an
"is this allowed?" question is a predicate with no I/O. Modelling it as a capability would have added
an indirection with no behaviour behind it, and would have put a decision on the same footing as an
effect.

## Why pure rather than a policy object

Three reasons, in descending order of confidence.

**1. Fail-closed behaviour is easier to state, test, and audit in a pure function.** The rule is six
lines with one interesting decision: an unrecognised permission or mode ranks `+Infinity`, above
every known one. That single line is the fail-closed property the journey model demands
(`j_d_approval`: "fail-closed by default"). Expressing the same thing as a policy rule set would
scatter it across a configuration surface and make the "what happens for an unknown value" case
implicit.

**2. `mode` will become dynamic; the gate will not need to change.** The access mode is currently a
parameter with a conservative default, because the composer's mode dropdown is inert. When it is
wired up, the change is "pass the real value in" — `AgentCodingInput.mode` already exists for exactly
that. The gate's signature does not change, so no test needs rewriting.

**3. The pure functions are directly unit-testable.** `approvalGate` and the `planGate` helpers have no
dependencies. Their behaviour — ranking, normalisation, heading extraction, the exact reflection
strings — can be verified without booting a runtime, which is why the exact strings are asserted in
integration tests *and* are readable in one place.

## Why a continuation, and why a *distinct type* per gate

**Verified fact: a continuation is the only runtime construct that suspends a run durably.** The run's
status becomes `waiting`, the suspension point is persisted, and resuming supplies the input. An
in-memory `await` on a promise would not survive a restart; the `J-D-approval` restart test is exactly
the assertion that this one does.

**Why `tool-approval` and `plan-review` are separate types.** The `planGate.ts` header and
`BINDINGS.md` both give the reason, and it holds up on inspection:

| | `tool-approval` | `plan-review` |
|---|---|---|
| Payload | tool, args, permission, justification | plan heading and markdown |
| Affirmative | allow → the tool runs | approve → plan mode exits |
| Negative | deny → the tool does not run, denial text says "stop and explain instead of working around it" | request changes → stay in plan mode, revise, re-present |
| State transition | none | `plan.mode.changed {on:false}` |
| Continuation key | `approve:<toolCallId>` | `plan-review:<toolCallId>` |

The negative outcomes are semantically different, not cosmetically different. Merging them would force
the UI to branch on a flag inside one payload, and would make the *durable* record of what was asked
ambiguous — after a restart, which question is this run waiting on? The separate type answers that from
the row itself. The UI exploits this: `App.tsx` finds the approval by
`openContinuations.find(c => c.type === "tool-approval")` and the plan review by
`c.type === "plan-review"`.

## The ordering constraint that is easy to miss

`tool.call.started` is emitted **before** the gate is consulted — for every call, approval-required or
not. The code comment gives the reason: `useToolTimeline` keys tool entries off that event, so
emitting it only after an approval would leave a pending approval with no visible tool card at all.
The approval bar would appear with nothing above it explaining what was being approved.

This is a real coupling between the agent's emit order and the UI's derivation strategy, and it is
worth preserving if the dispatch is refactored.

## The state the gate does *not* own

The gate returns a decision. It does not remember one. The consequences of a decision live in events
(`tool.approval.requested`, `tool.approval.decided`) and in the `sessions` projection's sticky
`mode: "ptc"`. The `J-E-plan` follow-up is instructive: a plan review also has a *pending* indicator in
the projection (`review.status`), which the sidebar reads independently of the continuation, so the
"Plan awaiting review" prefix survives a reload even if no client is subscribed.

## The known weakness

**Verified limitation:** a denied escalation is enforced by *telling the model* not to work around it.
The exact text is "stop and explain instead of working around it", and the model is free to try
`bash` instead of `run_code` — `bash` never reaches the gate, because in the reference the escalation
field only exists on `run_code`. The app constrains `bash` to the workspace working directory, but does
not restrict absolute paths inside a command. This is documented in
[../reference/deviations.md](../reference/deviations.md) under `run_code`'s sandbox, and it is a real
gap in enforcement, not a documentation omission.

**Uncertain:** whether the reference's own enforcement is stronger. The reference's `run_code` runs in
a "real sandbox exposing a `tools` object" per `DEVIATIONS.md`, and that sandbox was not read or
reproduced. If the reference enforces path-level sandboxing, this reconstruction is weaker in a way
that only matters against a hostile model.

## Related

- [../subsystems/agent-coding.md](../subsystems/agent-coding.md) — the dispatch order
- [../subsystems/projections.md](../subsystems/projections.md) — the `ptc` badge and plan review state
- [../workflows/approval-gate.md](../workflows/approval-gate.md) — the full gate workflow
- [../workflows/plan-mode.md](../workflows/plan-mode.md) — the plan review workflow
- [../subsystems/domain-model.md](../subsystems/domain-model.md) — why `ApprovalGate` is not bound
- [../reference/capabilities.md](../reference/capabilities.md) — the 12 bound capabilities
