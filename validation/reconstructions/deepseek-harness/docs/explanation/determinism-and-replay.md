# Determinism and replay

How a run survives being killed mid-flight, and what the code has to do to make that safe.

## The claim

A run interrupted by a process restart resumes and completes **without re-executing completed work**.
Verified by three tests that assert a *count* rather than a mood:

- `J-D-approval` (fourth): after a restart mid-run, each `toolCallId` appears exactly once among
  `tool.call.started` events.
- `J-H-provider-error` (third): after a restart with two retries landed, the final
  `model.request.retried` count is exactly 5, not 7.
- `J-F-delegation` (second): after a restart mid-delegation, exactly one child run exists on the
  `subagent:` correlation and exactly one `subagents` row.

## The three mechanisms

### 1. `ctx.invoke` — external effects are recorded

A capability call's arguments and result become `run.invocation` events. On replay, a completed
invocation returns the recorded result without calling the capability. The agent does not need to know
whether it is replaying.

This is why the tool loop needs no resume logic: a `tool.edit` that already ran is a recorded
invocation, and a `model.generate` that already returned is a recorded invocation.

### 2. `ctx.step` — non-determinism is recorded

Some work is neither a capability call nor pure: a filesystem existence check, a sleep. `ctx.step`
runs the callback once and records its return value. On replay it returns the recorded value without
running the callback.

Two uses in this app:

- **The read-before-edit guard.** `ctx.step("edit-exists:<id>", () => fileExists(root, path))`. The
  comment is explicit about the reason: "boxed in `ctx.step` (not called bare) so this filesystem read
  stays replay-safe: the same recorded answer is returned on replay instead of re-touching the disk."
  The step id includes the `toolCallId`, so two edits of different files do not share a record.
- **Retry backoff.** `ctx.step("backoff:<callIndex>:<attempt>", …)`. A replayed run does not sleep; it
  returns the recorded duration. `callIndex` is the tool-loop step number, which keeps two sequential
  model calls in one turn from colliding.

### 3. Idempotency keys — for things that are *not* replayed

`subagent.start` passes the child's idempotency key (`"<parentRunId>:<toolCallId>"`) to `startRun`, so
a replayed delegation returns the same child run rather than creating a second one. The same pattern
is used for every `agent.config` run started by a capability, though those use a fresh `randomUUID()`
each time — correct there, because each one *should* produce a new event.

## The one non-deterministic local value, and why it is safe

`agent.coding` holds `const readFiles = new Set<string>()` across a turn, appended to after each
successful `tool.read`. It is the only mutable local state in the agent, and the header comment states
the invariant: it "is a plain `Set` rebuilt identically on every replay from the same sequence of
recorded `tool.read` results, so it stays deterministic."

The argument: a `tool.read` either happens or does not happen, and whether it happened is in the
recorded invocation. A replay walks the same steps in the same order, so it appends the same paths in
the same order. No clock, no randomness, no ordering ambiguity.

This invariant is load-bearing for the read-before-edit guard: if the set diverged between runs, a
replay could deny an edit that the original allowed (or worse, allow one it denied).

## The failure this design was built to prevent

**Verified, from `parity-report.md`:** finding D1. `RunContext.emit` called *inside* a `ctx.step`
shifted the `emit:<n>` counters on replay, which let a later emit collide with one recorded inside
the step — a collision that could drop or reorder an event. The fix is in the framework
(`packages/runtime-bun/src/executor.ts`), with a conformance test named for the finding. The lesson for
this app: recording order is part of the contract, and an event emitted from inside a recorded step has
to be accounted for twice.

## What is *not* deterministic, and does not need to be

| Value | Where | Why it is safe |
|---|---|---|
| `crypto.randomUUID()` for idempotency keys | `model.configure`, `workspace.select`, `onboarding.dismiss`, `settings.changeWorkDetails`, and the browser's `startRun` | at a boundary that is never replayed |
| `Date.now()` in the UI | duration badges, relative times, the elapsed tick | presentation only; no durable state depends on it |
| `Date.now()` in `server.ts` | none — the server never stamps an event itself | the runtime stamps `recordedAt` |
| `relativeTime` in the UI | sidebar timestamps | display only |

`tests/architecture/event-history-authoritative.test.ts`'s special-case audit classified every
`Date.now()`/`Math.random()`/direct-I/O hit it found in `src/` and `domain/`, and each was either a
dev-server path, a browser UI timer, an idempotency key at a non-replayed boundary, I/O boxed inside a
capability, or a secret destructured out before `ctx.emit`. No hit required a "special case" verdict on
any provenance row.

## Invariants to preserve when changing the agent

These are the constraints a change to `agent.coding` can break silently:

1. **No bare I/O.** Every filesystem read, subprocess, and HTTP call goes through `ctx.invoke` or
   `ctx.step`. A bare `await readFile(...)` in the agent body is both a determinism hole and an
   unrecorded side effect.
2. **No wall-clock or randomness in the run body.** Use the event's `recordedAt` or the context's
   signal; do not call `Date.now()`.
3. **`tool.call.started` before the gate.** The UI derives tool entries from it; the approval bar
   depends on the entry existing.
4. **Every capability the agent invokes must be idempotent-safe to replay**, which for a read-only
   fold is automatic and for a mutation means the call must be recorded *before* its effect is
   considered done.
5. **The four inline tools must stay side-effect-light.** `todo_write`, `exit_plan_mode`, and
   `subagent` emit events and (for the last two) open continuations. If one of them ever needs to
   touch the filesystem or a subprocess, it becomes a capability.

## Related

- [../workflows/persistence-and-restart.md](../workflows/persistence-and-restart.md) — the mechanics
- [../subsystems/agent-coding.md](../subsystems/agent-coding.md) — the read-before-edit guard
- [../workflows/cancellation-and-failure.md](../workflows/cancellation-and-failure.md) — backoff as a step
- [../workflows/delegation.md](../workflows/delegation.md) — the idempotency key that prevents a duplicate child
- [../architecture.md](../architecture.md) §4 — dependency direction that keeps `domain/` I/O-free
- `parity-report.md` §"Framework findings" — D1, G1, F3
