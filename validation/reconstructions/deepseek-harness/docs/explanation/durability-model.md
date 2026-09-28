# Why the durability model looks like this

## The question this answers

An agent chat UI has an obvious implementation: keep the conversation in memory, mutate it as the
model streams, and show it. Why is this app built as an event log with derived projections instead?

## Verified fact: the requirement, not the preference

The product framing in `cognate/PRODUCT.md` names durability as the differentiator, and the test
suite is organised around proving it:

- `J-G-persistence` — visible state matches after a full process restart.
- `J-D-approval` (third test) — a pending human decision survives a full restart.
- `J-D-approval` (fourth test) and `J-H-provider-error` (third test) — a resumed run does not
  re-execute completed work.
- `tests/architecture/event-history-authoritative.test.ts` — every projection rebuilds identically
  after its state is deleted.
- `parity-report.md` settlement gate items 10, 12, 16 all turn on this property.

So the architecture is a *response to a stated requirement*, not an aesthetic. The alternative was
measured and rejected on evidence: `cognate/DEVIATIONS.md` records that the reference product keeps a
pending approval across a page reload but silently finalizes the turn after a full restart. The
decision was not to copy that.

## The reasoning, step by step

**1. A pending human decision is not an in-memory value.**

When `run_code` escalates, the run has to stop and wait for a person who may close their laptop. An
in-memory promise dies with the process; the operator comes back to a turn that says "Worked" with no
answer. Encoding the wait as a durable continuation row makes the wait a fact about the world rather
than about the process.

**2. Derived reads are cheaper to make correct than durable writes.**

A `sessions` row is a fold of `session.turn.started` plus `message.completed` plus lifecycle events.
If the fold is wrong, the fix is to change a pure function and replay. If a *write* is wrong — a title
computed once and stored — the information needed to recompute it may simply not exist. Projections
push the complexity to the side of the system where complexity is cheap to correct.

**3. Replay-safety falls out rather than being added.**

Because every non-deterministic step is recorded (`ctx.step`) and every external call is recorded
(`ctx.invoke`), resuming a run is "re-execute the body, return recorded answers for finished steps".
That is why the app needs no bespoke resume logic per feature, and why the mid-run restart test can
assert a strong property — each tool call happened exactly once — rather than a weak one.

**4. The "absence is the default" trick.**

First-run dialogs, the work-details mode, plan state, and the current workspace are all derived from
whether a row exists. A fresh home has no rows, so the app is in its first-run state, correctly, with
no separate "has this been set up before" flag to keep in sync. This removes a whole class of bug
where a boolean and the data it describes drift apart.

## The trade-off this buys, and what it costs

**Buys:** restart transparency, a single source of truth, cheap derived views, and a complete
explanation of why the UI is showing what it is showing. A surprising number of the app's
architectural oddities stop being odd: `sessions.ts` parsing a session id out of a correlation string
is not a hack, it is the only information a lifecycle event carries.

**Costs, honestly:**

- **Every read becomes a fold.** `session.history` computes a transcript on demand from runs and
  their events, counting `tool.call.started` per run to produce a `stepCount` the UI needs. That is
  not free, and it is why per-step detail is *not* available for a reloaded turn — the fold returns a
  count, not the steps. The gap is documented rather than papered over.
- **Latency.** A projection write is a durable commit, so a UI that waits for a row before revealing
  state is one commit behind. The code works around this where it matters: `PlanReviewCard` renders
  from the continuation payload rather than the projection.
- **A flat file store for four different kinds of state.** Secrets sit next to the database because
  both are "under the home", but they have opposite properties: one is derived and deletable, the other
  is authoritative and must never reach the log. The separation is enforced by *how* each is written
  (`ctx.emit` for the log, a plain function call for the secret file), not by where it lives.
- **Verbosity.** Every feature touches four files. `onboarding.dismiss` is a component, an event, a
  projection, and a branch in `agent.config`. That is the price of the model, and it is paid
  consistently.

## Where the boundary actually is

Durability stops at the runtime's own event log. Three things are deliberately outside it:

- **The model provider is not durable.** Only the *fact* that a provider was configured is an event
  (`model.configured`). The live fiber is rebuilt on boot. This is why `server.ts` re-mounts it.
- **Tool effects are outside it by nature.** The event log records that `tool.edit` was invoked with
  certain arguments; the file on disk is a separate fact. The app records both, and does not pretend
  the first implies the second.
- **The browser's position is outside it.** Theme and last-open session are `localStorage` precisely
  because they are conveniences. If they were events, clearing your browser would be an application
  operation.

## Confirmed versus inferred

**Verified** (asserted by tests or read from code): the durability claims above; the reference's
restart behaviour as recorded in `DEVIATIONS.md`; the `readFiles` determinism constraint; the
`ctx.step`/`ctx.invoke` replay semantics; the projection rebuild equality.

**Strong inference:** the team would have chosen a simpler in-memory model had the requirement been
absent. The evidence is the volume of machinery that exists only to serve durability — the boxed disk
check, the boot-time provider re-mount, the correlation parsing in `sessions.ts`, the
event-history-authoritative test. The requirement is stated in `PRODUCT.md` and the machinery follows
it, but the counterfactual was not tested.

**Uncertain:** whether the projection-read latency is felt in practice. The single-turn depth of this
app means folds are small, and nothing in the test suite measures it. A long session with hundreds of
turns would be the case to measure, and no such measurement exists here.

## Related

- [../architecture.md](../architecture.md) §1 and §5 — the organising idea and the data architecture
- [determinism-and-replay.md](determinism-and-replay.md) — how resumed runs avoid double execution
- [gates-and-continuations.md](gates-and-continuations.md) — durability at the human-decision boundary
- [../workflows/persistence-and-restart.md](../workflows/persistence-and-restart.md) — the mechanics
- [../reference/deviations.md](../reference/deviations.md) — the approval-restart divergence
