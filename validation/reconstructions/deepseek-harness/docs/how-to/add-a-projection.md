# How to add a projection

A projection is a pure fold from the event log to named rows. It is the cheapest thing in the system to
add and the easiest to get subtly wrong, because a wrong fold is not an error — it is a plausible row.

The worked example is a `usage` projection counting `run.invocation.progress` text deltas per session,
so a future stats footer has something real to read instead of a hardcoded zero.

## Decide first: a new projection or an existing one?

| Situation | Do |
|---|---|
| The rows describe a genuinely different thing, with a different lifetime | new projection |
| The rows are another attribute of an existing thing | extend that projection's fold |
| The rows are computed *from* other rows rather than from events | do not project them — read the other projection, as `session.history` reads `subagents` |

That last row is the one people get wrong. `session.history` needs subagent results, and it reads the
`subagents` projection at invocation time instead of duplicating the fold. Projections fold **events**;
anything that needs a *join* belongs in a capability.

## Prerequisites

- [../subsystems/projections.md](../subsystems/projections.md), especially the keying and
  tenant-stripping conventions.
- Events that actually carry what you need. A projection cannot invent data.

## Procedure

### 1. Write the fold, pure and total

```ts
// cognate/src/projections/usage.ts
import type { Projection } from "@cognate/projections";

export const usageProjection: Projection = {
  name: "usage",
  version: "1.0.0",
  apply(event) {
    if (event.eventType !== "run.invocation.progress") return [];
    const payload = event.payload as { readonly kind?: string; readonly text?: string };
    if (payload.kind !== "text") return [];
    const sessionId = event.correlationId.startsWith("session:")
      ? event.correlationId.slice("session:".length)
      : undefined;
    if (!sessionId) return [];
    return [{ key: `${event.tenant}/${sessionId}`, value: { deltas: 1 } }];
  },
};
```

Rules, each of which exists because breaking it produced a real bug at some point:

- **Return `[]` for anything you do not own.** No `throw`, no default branch that mutates.
- **Never touch the clock.** Use `event.recordedAt`, never `Date.now()` — a fold must be a pure
  function of the log.
- **Read `state` only when you need to accumulate.** The `state` map holds your own rows, keyed
  *including* the tenant prefix.
- **Do not create a row for a lifecycle event that has no payload ids.** `run.waiting`,
  `run.cancelled`, and `run.failed` carry neither `sessionId` nor `workspaceId`; recover the id from
  `event.correlationId`, and — as `sessions.ts` does — return `[]` if there is no existing row rather
  than inventing one.
- **Be total about types.** Existing projections cast `event.payload` without validating. Follow the
  convention, but keep the cast narrow and check the discriminants you depend on.

### 2. Make identity explicit where the creating event is not the only source

`subagents.ts` is the model to copy when a row's identity is spread across two events: the creating
event (`subagent.spawned`, on the parent) does not carry the correlation the completing event uses, so
the projection parses `subagent:<parentRunId>:<toolCallId>` back apart and only then updates. A row
that "just works" for the creating event and is orphaned by the completing one is the classic failure.

Split on the **first** separator only, so an id containing the separator survives.

### 3. Decide how absence is read

Ask: what does "no row" mean? For `settings` and `onboarding` it is the default, and that is a feature.
For `sessions` it means "no turn has started". Write the comment stating which it is, because the next
reader will rely on it.

### 4. Register it

```ts
// cognate/src/server.ts
projections: [
  // …
  { projection: usageProjection, public: true },
],
```

`public: true` makes it readable by the browser through `readProjection`. Register it even if only the
server reads it — `createRuntime` catches every registered projection up on boot, and an unregistered
one has no rows at all.

### 5. Read it

From a capability, using the invocation's caller:

```ts
const rows = await service.readProjection({ actor: ctx.actor, tenant: ctx.tenant ?? "local" }, { name: "usage" });
```

From the UI, with a hook that mirrors the existing ones in `cognate/src/ui/App.tsx`:

```ts
function useUsage(sessionId: string | undefined) {
  return useProjection("usage", LOCAL /* … */);
}
```

Remember: `readProjection` strips the tenant prefix, so a row written as `local/<id>` reads back as
`<id>`.

### 6. Test the rebuild, not just the happy path

The property that matters is not "the row is right now" but "the row is right after a replay from
position 0":

1. Drive a run that produces the events.
2. `await app.runtime.idle()`.
3. Read the projection and assert the rows.
4. Stop the app, restart with the same home, read again, and assert **the same values** — including
   any accumulated totals.

`tests/architecture/event-history-authoritative.test.ts` is the template for step 4 at scale: it
snapshots four projections across four journey types, deletes their state directly in SQLite, restarts,
and asserts a deep-equal rebuild. If your projection is worth registering, it is worth adding there.

## Validation

```bash
cd cognate && bun run typecheck && bun test test
```

Minimum assertions:

- the row appears after the producing event
- the row is unchanged by an unrelated event (`apply` returned `[]`)
- the row survives a restart with identical values
- if a lifecycle event is involved: no row is created for a correlation that has no prior row

## Common failure symptoms

| Symptom | Cause |
|---|---|
| No rows at all | the projection is not in `server.ts`'s `projections` array, or the event type does not match |
| Rows keyed with a tenant prefix in the UI | you keyed with the prefix and read with the raw key, or the reverse — `readProjection` strips it |
| A counter is wrong after a restart | the fold is not idempotent under replay, or it reads a clock, or it double-counts on a second application of the same event |
| A row is created for a subagent child | the correlation guard is missing; `sessions.ts`'s first line is the pattern |
| The row updates but the UI does not | the projection is not `public: true`, or the UI holds its own copy instead of subscribing |
| Values differ between two reads at the same instant | the fold is mutating `state` in place; return new values |

## Rollback

Remove the registration and the file. If events already exist for the tenant, the rows become
unreachable rather than deleted — harmless, but note it. There is no migration step and no schema to
change.

## Related

- [add-a-capability.md](add-a-capability.md) — usually the reason you need a new projection
- [../subsystems/projections.md](../subsystems/projections.md) — the seven existing folds
- [../reference/projections.md](../reference/projections.md) — keys and shapes
- [../reference/events.md](../reference/events.md) — what you can fold
- [../explanation/durability-model.md](../explanation/durability-model.md) — why derived reads are the right home
