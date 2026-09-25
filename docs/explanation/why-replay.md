# Why runs replay instead of resuming

**What is confirmed vs. inferred.** The mechanism is confirmed by the implementation and pinned
by tests. The *rationale* below is reconstructed from the code's shape, the spec, and the ADRs;
treat the motivations as strong inference unless a line is cited.

## The decision

An execution of a run does not pick up where it left off. It re-reads the run's event stream,
re-enters `agent.run(input, ctx)` from the top, and every `RunContext` call whose step id already
has a recorded result returns that result instead of doing the work.

```ts
// packages/runtime-bun/src/executor.ts
const done = find(stepId);
if (done) return field(done.payload, "result") as T;
const result = toJson(await fn());
await append({ eventType: "run.step.completed", payload: { result }, metadata: { stepId } });
return result as T;
```

## Why not suspend the fiber and resume it?

A suspended fiber is the obvious design, and it is what most runtimes do. It fails in three ways
this system cares about:

1. **It does not survive a process restart.** A continuation has to hold a closure, a fiber, or a
   stack. None of those exist after `kill -9`. Durable suspension means re-entering the agent.
2. **It makes the durable log a side effect.** With a suspended fiber, the code's memory is the
   truth and the log is a transcript. Replay inverts that: the log is the truth and memory is a
   cache — which is the property every other part of the system depends on (erasure, rebuild,
   projection).
3. **It duplicates the semantics of `waitFor`.** If fibers can suspend, "waiting for a human" is
   the engine's job. Then "waiting for a capability to appear" needs a second mechanism, and
   "waiting until 3am" a third. Replay makes one mechanism cover all of them: the wait is just a
   recorded result that is not there yet.

## The cost, stated honestly

Replay is not free, and the codebase shows where it hurts:

- **Agent authors must be deterministic** given the recorded results. A bare `Date.now()` or
  `Math.random()` inside a run makes a replay diverge.
- **`emit`/`invoke`/`artifact` are numbered, not named.** A conditional `ctx.invoke` changes the
  numbering on the next replay and the run takes a different path. The discipline is: get
  nondeterminism through `ctx.step` or `ctx.invoke` first, then branch on the recorded result.
- **Steps are at-least-once.** A step that was in flight when the process died runs again. Any
  externally visible effect therefore belongs in `CommitmentService`
  (`packages/runtime-bun/README.md`, *Limits*).
- **A long run re-executes its whole preamble.** The cost is bounded by how much work happens
  *before* the first recorded result, and by the fact that most of the preamble is `step`/`emit`
  calls that return immediately on replay.

## Why the state read is a step

`ctx.state(id)` is the sharpest illustration. It re-reads both state streams *fresh* on every
call — so a caller write that landed after this execution started is visible — and then records
the folded value under `state:<id>`. Replay returns the recorded value.

Without the recording, a run would be non-deterministic by construction: the same code would see
different state on the second pass. With it, the run remembers what it saw, which is exactly the
guarantee the agent author needs to reason about their own code.

## What the tests pin

- `packages/runtime-bun/README.md` *Replay rules* — the step-id scheme and the
  `expectedVersion` race with `cancelRun`.
- `tests/integration/continuation-restart.test.ts` — a run resumes after a whole-process restart.
- `tests/integration/crash.test.ts` — recovery after an abrupt stop.
- `tests/properties/replay.property.test.ts` — deterministic projections replay to equivalent
  state.
- `tests/integration/shared-state.test.ts` — the state-read step contract.
- The runtime conformance kit in `packages/runtime-api/src/conformance.ts` — every implementation
  of `RuntimeService` must satisfy the same replay-visible behavior.

## Trade-off summary

| | Suspended fiber | Replay |
|---|---|---|
| Survives a restart | no | yes |
| Event log is | a transcript | the truth |
| One mechanism for all waiting | no | yes |
| Author burden | low | determinism discipline |
| Duplicate side effects | rare | possible; use commitments |
| Re-execution cost | none | proportional to the preamble |

Cognate chose replay because durability, rebuildability, and erasure all reduce to "the log is
the truth", and because one suspension mechanism is worth more than a cheaper preamble.

## Source trail

- `packages/runtime-bun/src/executor.ts` — the mechanism.
- `packages/runtime-bun/README.md` — *Replay rules*, *Limits*.
- `packages/runtime-api/src/types.ts:28-31` — the contract statement.
- spec §11, §12 — the requirement.
- [decisions/ADR-0011-runtime-service-contract-package.md](../decisions/ADR-0011-runtime-service-contract-package.md)
  — the decision that made replay the durable run model.

## Related

- [../workflows/run-execution.md](../workflows/run-execution.md) — the full trace and the step-id
  table.
- [why-projection-not-storage.md](why-projection-not-storage.md) — the larger claim this is an
  instance of.
