# Glossary

Repository-specific vocabulary, defined before use. Where a term could be misread, the "not this"
line says what it is not.

---

## Runtime concepts (from the Cognate framework)

**Event** — An append-only record that something happened: an `eventType`, a JSON `payload`, a
`tenant`, a `correlationId`, a `runId`, and a `recordedAt` timestamp. The log is the authoritative
state of the app.
*Not this:* a log line, a debug message, or a UI state change. Events are addressed later by
projections; nothing reads them as "the current value".

**Run** — One execution of an `AgentDefinition`. Has a `runId`, an input, a status, and exactly one
status at a time: `running`, `waiting`, `completed`, `failed`, `cancelled`.
*Not this:* a turn. One turn is one run, but a run is the more general term — `agent.config` runs
exist too and are not turns.

**Correlation** — The routing key stamped on every event a run produces. Two shapes exist here:
`session:<sessionId>` for a top-level turn, and `subagent:<parentRunId>:<toolCallId>` for a
delegated child. Nothing else produces runs.
*Not this:* a session id. `sessions.ts` only folds events whose correlation starts with `session:`,
which is precisely how child runs stay out of the sidebar's session list.

**Correlation id is how a bare `run.waiting` finds its session.** Lifecycle events such as
`run.waiting`, `run.cancelled`, and `run.failed` carry no payload ids — only the envelope's
`correlationId` and `runId`. The projections parse it back to a session.

**Capability** — A named, versioned I/O contract published by a component and invoked by an agent
(`ctx.invoke`) or the UI (`client.invoke`). Example: `tool.read` v1.0.0.
*Not this:* a function you export. A capability is a contract with an id, a version, and a component
behind it, which is what lets the runtime record, replay, and authorize it.

**Component** — The Cordis-style unit that publishes capabilities. A component declares `provides`
and, when activated, registers handlers on a fiber. `toolCapabilitiesComponent` publishes four
capabilities from one component; `streamingProviderComponent` publishes one and is mounted fresh on
every provider change.

**Component handle / fiber** — A mounted component instance. `ProviderRegistry.swap` disposes the
previous handle and keeps the new one: that is the entire mechanism behind "switch models without
restarting".

**Projection** — A named pure function `(event, state) => rows[]` that folds the event log into
key/value rows. Marked `public: true`, therefore readable by the browser.
*Not this:* a cache, and not a source of truth. Every row can be deleted and recomputed. The test
`tests/architecture/event-history-authoritative.test.ts` deletes all projection state and asserts
the rebuild is identical.

**`readProjection` tenant stripping** — Projections key rows as `${tenant}/…`, but `readProjection`
returns them with the tenant prefix removed. So a projection that writes `local/current` is read as
`current`, and `local/record/<id>` as `record/<id>`. This trips up anyone reading projection code
cold.

**Continuation** — A durable suspension point created by `ctx.waitFor` inside a running agent. The
run's status becomes `waiting` until someone resolves the continuation with a resume input. Two
types exist: `tool-approval` (resume input `{approved: boolean}`) and `plan-review` (resume input
`{approved: boolean, feedback?: string}`).
*Not this:* a modal dialog or a promise. It is persisted state; the browser can close and come back.

**Step** (`ctx.step`) — A recorded unit of non-deterministic computation. On first execution it runs
the callback; on every replay it returns the recorded answer without running it. The app uses this
for the `edit` tool's "does this file exist yet?" disk check, and for retry backoff sleeps.

**Invoke** (`ctx.invoke`) — A recorded capability call. Its arguments and result become
`run.invocation` events; its progress deltas become `run.invocation.progress` events.

**`run.invocation.progress`** — The durable streaming channel. A capability handler calls
`ctx.progress({kind:"text", text})`; each call becomes one event. This channel did not exist in the
framework before this reconstruction forced the question, and adding it is recorded as the G1
framework finding in `primitive-provenance.md`.

**Policy** — The kernel's authorization hook. `rulePolicy("deepseek-harness-app", [fn])` in
`server.ts` grants a fixed list of capability ids to `user` and `system` actors.
*Not this:* the approval gate. Policy decides *whether a capability may be invoked at all*; the
approval gate decides *whether this particular tool call needs a human* before it runs.

**System actor** — `{id: "system", kind: "system"}` (named `SYSTEM_CALLER`). Used for the
`agent.config` runs that record configuration changes, and as the caller for child subagent runs.

**Semantic projection / binding** — At boot the app parses `.sea/interaction/interaction-model.sea`
into 51 semantic objects (logged with a digest, also served by `/health`). `bindCapabilities` then
turns *explicitly listed* pairs of `{semanticId, capability}` into `CapabilityContract`s carrying a
`SemanticRef`. There is no automatic binding. Two published capabilities are deliberately unbound.

**`SemanticRef`** — The pointer a bound contract carries, recorded in `run.invocation` events. It is
how an invocation stays traceable to the IDM concept that motivated it.

---

## Application concepts

**Cognate Console** — The working name of this app (`cognate/PRODUCT.md`). It was known internally
as "the DeepSeek Harness reconstruction" while the parity goal was live.

**Workspace** — A directory on disk, chosen by the operator, that every tool call is confined to.
**workspaceId** is `sha256(resolve(path)).slice(0,16)` — stable for the same canonical path, which is
why re-selecting a directory does not create a duplicate record.

**Session** — A conversation bound to one workspace. It is not a first-class store: a session is
*defined by* the set of runs correlated `session:<id>`, and everything the UI shows about it comes
from the `sessions` projection.

**Turn** — One user message and the agent's work on it. Mechanically: one `agent.coding` run with
`correlationId = session:<sessionId>`.

**Tool call / `toolCallId`** — An id minted by the model provider for a requested call. It is the
join key across `tool.call.started` / `tool.call.completed` / `tool.call.failed`,
`tool.approval.requested` / `tool.approval.decided`, and `subagent.spawned`. A run's tool loop is
sequential, so at most one call is ever `running` and at most one approval is ever open.

**Approval gate** — A *pure function*, `approvalGate({tool, args, mode})`, not a capability. Returns
`{required, permission, justification}`. Required exactly when `tool === "run_code"` and its
`sandbox_permissions` string ranks above the session's access mode
(`read-only < workspace-write < full-access`). An unrecognised permission or mode ranks above every
known one — fail-closed.

**Access mode** — The session's current authority, compared against a requested escalation. Its
default is `"read-only"`. The composer's access-mode dropdown is present but inert, so the value is
not yet wired to a user control.

**PTC mode** — The sticky per-session badge, set the first time a session emits
`tool.approval.requested`, never cleared. Derived from the reference's "permission to continue"
framing. The header shows "PTC mode" for those sessions and "Standard mode" otherwise.

**Plan mode** — Per-session state, not a capability. Turned on by a leading `/plan ` prefix in the
user's message; turned off by the exact message `/plan off` or by approving a plan review. The
agent's `todo_write` and `exit_plan_mode` calls drive the to-do list and the review card.

**To-dos** — The `todos` array a `todo_write` call carries. Recorded regardless of plan mode, so the
widget also works in a normal session. They persist after plan mode exits.

**Plan review** — A `plan-review` continuation plus the `plans` projection's `review` field. It is
deliberately *not* the same mechanism type as a tool approval: the payload is a plan heading and
markdown, not a permission.

**Subagent** — A child `agent.coding` run started by the `subagent` tool, correlated
`subagent:<parentRunId>:<toolCallId>`, started fire-and-forget. It is **not** a session: it never
appears in the `sessions` projection, and it has no separate transcript store. Its result reaches the
parent as a synthetic context message on the parent's *next* turn.

**Work details mode** — A presentation setting with four values (`compact`, `standard`, `detailed`,
`verbose`), default `standard`, controlling how much of each tool call renders. Durable as an event,
so it survives a restart. It changes rendering only; it changes no behaviour of the agent.

**Deviation** — A deliberate, documented difference from the pinned reference product. Some are
brand substitutions the exercise explicitly allowed (dialog copy, provider preset list). One is a
deliberate *behavioural* difference: a pending approval survives a restart here and does not in the
reference. Enumerated in [../reference/deviations.md](../reference/deviations.md).

**Reconstruction** — The exercise this repository embodies: reproduce a third-party product's
behaviour on a different framework, then prove (a) the behaviour matches or is a documented
deviation, and (b) no reference-specific framework primitive was needed to do it.

---

## Harness concepts

**Pinned reference** — `deepseek-ai/deepseek-harness` at commit `477b4f42`, `@deepseek-ai/dsh-root`
0.1.7-rc.2, captured 2026-09-26. Identifiers and how to relaunch it are in
`reference-manifest.json`.

**Driver** — The `Driver` interface (`tests/drivers/types.ts`) that lets one journey script drive
either system. Branding and selector differences are absorbed inside a driver; the *assertions* live
in the shared spec and never weaken per system.

**Expectations** — The two named, documented places where the two systems are allowed to differ:
`approvalSurvivesRestart` and `providerErrorCode`. A spec reads the expectation instead of branching
on which system it is driving.

**Checkpoint** — One named UI state in the screenshot suites (`04-workspace-selected`,
`11-approval-pending`, …). 28 of them, captured at two viewports.

**Journey** — A canonical end-to-end behaviour with an IDM identity, exercised twice: once as a Bun
integration test in `cognate/test/` and once as a Playwright spec in `tests/journeys/`. The pair is
what makes a claim checkable at both the API and the interface level. See
[../reference/journeys.md](../reference/journeys.md).

**Critic round** — A review pass over captured evidence with findings and a disposition file. Rounds
1–7 are in `critic/`.

**Settlement gate** — The 19-criterion checklist in `parity-report.md` that had to be MET for the
reconstruction to be considered done. All 19 are recorded as MET.

---

## Terms the code uses that you will misread

| Identifier | Reads as | Actually |
|---|---|---|
| `mode` in `approvalGate` | the model's mode | the *session's* access mode, default `read-only` |
| `PROTOCOL_OPTIONS` / `protocol` | the wire protocol | always the literal `"openai-compatible"` in the backend; the UI offers three labels but only that one reaches `model.configure` |
| `plan.state` | a setter | read-only. Plan-mode *changes* are events, not a capability |
| `subagents` projection | child sessions | one row per `subagent` tool call, not per session |
| `session.history` | stored transcript | a *fold* computed on demand from runs, and it returns a `stepCount` field the UI needs |
| `started subagent <id>` | the child's answer | confirmation text; the child is still running |
| `TODO`/`todos` in the tool schema | a task list | the plan's to-do widget state |
| `.data/` | checked-in data | git-ignored default home directory |
| `.generated/entry.tsx` | source | regenerated and rewritten on every server boot |
