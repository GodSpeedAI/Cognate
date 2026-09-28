# How to add a tool

A tool is something the *model* may ask for. Adding one is a smaller change than adding a capability,
because the loop, the events, the UI timeline, and the diff view already handle any tool name.

The worked example is `tool.grep`, a recursive content search inside the workspace.

## Decide first: is this a tool or an inline handler?

The agent's dispatch has three kinds of branch, and picking the wrong one is the most common mistake.

| Use | When |
|---|---|
| **A capability** (`tool.<name>`) | the work is I/O: filesystem, subprocess, or a remote call. Recorded, replayable, contained. This is 6 of the 7 existing tools. |
| **An inline handler in `agent.coding`** | the work is *state*: emitting a domain event, opening a continuation, starting a run. `todo_write` and `exit_plan_mode` are inline; `subagent` is inline plus one capability. |
| **A pure helper in `src/domain/`** | the work is a decision with no I/O and no state, like `approvalGate`. |

If your tool needs to touch the disk or spawn anything, it is a capability. If it only records
something, keep it inline — wrapping an event emission in a capability would add an invocation record
for no I/O.

## Prerequisites

- [../how-to/add-a-capability.md](./add-a-capability.md) understood, since a tool usually means a
  capability.
- A mock-model scenario that exercises the new tool, so the loop can be driven end to end. Without one
  you cannot test the tool without a real model.

## Procedure

### 1. The capability

Add the contract and handler in `cognate/src/capabilities/tools.ts`, following the existing shape:

```ts
export interface ToolGrepInput {
  readonly workspaceRoot: string;
  readonly pattern: string;
  readonly glob?: string;
}
export interface ToolGrepResult {
  readonly matches: readonly { readonly path: string; readonly line: number; readonly text: string }[];
}

fiber.provide(contract("grep"), async (rawInput): Promise<ToolGrepResult> => {
  const input = rawInput as ToolGrepInput;
  // Resolve and contain every path you touch — always via resolveInWorkspace.
  // …walk, match, cap the result…
});
```

Two obligations:

- **Containment.** Any path you touch goes through `resolveInWorkspace`. For a recursive walk, resolve
  the root once and build every candidate from it; do not join user input onto a path and hope.
- **Bounds.** The existing subprocess tools cap output at `MAX_OUTPUT` (20,000) and time out at
  `DEFAULT_TIMEOUT_MS` (30s). A recursive search needs its own cap — a result set is a denial-of-service
  vector just as much as output length. Return a truncated, clearly-marked result rather than an
  unbounded one.

### 2. The tool definition

Add to `TOOL_DEFS` in `cognate/src/agents/agentCoding.ts`:

```ts
{
  name: "grep",
  description: "Search file contents in the workspace.",
  inputSchema: {
    type: "object",
    properties: { pattern: { type: "string" }, glob: { type: "string" } },
    required: ["pattern"],
  },
},
```

Match the existing conventions: `required` lists only genuinely required fields; optional fields are
present in `properties` only; descriptions are one short imperative sentence, the way `read` and `bash`
read. Names and argument shapes in this file were taken from the reference's tool catalogue — if your
tool exists there, match it exactly rather than inventing a shape.

### 3. The result text

`formatToolResult` decides what the model actually reads. The default branch is
`JSON.stringify(result)`, which is acceptable for a new tool but worth doing better:

```ts
if (name === "grep") {
  const r = result as unknown as ToolGrepResult;
  if (r.matches.length === 0) return "(no matches)";
  return r.matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n");
}
```

What matters: the text is the tool's *only* channel back to the model. JSON with a wrapper key the
model was never told about wastes the turn.

### 4. The mock scenario

Add a script to `SCENARIOS` in `fixtures/mock-model/server.ts` so the loop is drivable:

```ts
grep: [
  { kind: "tool", calls: [{ name: "grep", arguments: { pattern: "Hello", glob: "**/*.ts" } }] },
  { kind: "text", text: "__REFLECT_TOOL_RESULT__" },
],
```

`__REFLECT_TOOL_RESULT__` makes the model echo the tool result verbatim, which is the cheapest way to
assert the exact text your formatting produced. Add the scenario to the table in `fixtures/README.md`.

### 5. The presentation

Usually nothing. `useToolTimeline` folds any `tool.call.*` into an entry, `ToolActivity` renders a
label, and `MessageBubble` renders the args and result. Two things you may want to add:

- **A label** in `toolActionLabel` (`cognate/src/ui/App.tsx`): without one, the running row reads
  `Running grep`. Add `if (entry.tool === "grep") return detail ? \`Searching · ${args.pattern}\` : "Searching";`
  and respect the `showsLiveProcessDetail` gate the existing labels use.
- **A diff card** only for mutating tools. `EditDiff` is written for `edit`'s `diffLines` shape; do not
  force another tool into it.

### 6. A guard, if the tool should not run blind

`edit` has a read-before-edit guard in `invokeTool` and a step limit on the whole loop
(`MAX_TOOL_STEPS = 20`). If your tool needs the same — for example, a delete that should require a
prior listing — put the check in `invokeTool` next to the existing one and box any disk read in
`ctx.step`:

```ts
await ctx.step(`<your-check>:${call.id}`, () => …);
```

A guard that reads the filesystem outside `ctx.step` breaks replay-safety. See
[../explanation/determinism-and-replay.md](../explanation/determinism-and-replay.md).

## Implementation locations

| Concern | Location |
|---|---|
| Definition advertised to the model | `cognate/src/agents/agentCoding.ts` — `TOOL_DEFS` |
| I/O and containment | `cognate/src/capabilities/tools.ts` |
| Result → model text | `cognate/src/agents/agentCoding.ts` — `formatToolResult` |
| Preconditions | `cognate/src/agents/agentCoding.ts` — `invokeTool` |
| Running label | `cognate/src/ui/App.tsx` — `toolActionLabel` |
| Driveable script | `fixtures/mock-model/server.ts` — `SCENARIOS`; `fixtures/README.md` |
| Binding, if it has IDM meaning | `cognate/domain/index.ts` — the `Tool` entity |

## Validation

```bash
cd cognate && bun run typecheck && bun test test
```

Then assert the four things a tool test must cover:

1. The call is made with the right arguments — collect `tool.call.started` from the event stream.
2. The result text reaches the model — assert on the run's final output (use the mock's
   `__REFLECT_TOOL_RESULT__`).
3. **The effect is real** — read the file, or check the subprocess's effect. `J-C-tool-execution`
   asserts `src/greet.ts` really changed on disk; that is the assertion that makes the suite meaningful.
4. Containment — a path escape throws `PathEscapeError` and the filesystem is untouched.

## Common failure symptoms

| Symptom | Cause |
|---|---|
| The model never calls it | it is not in `TOOL_DEFS`, or the provider is not given `TOOL_DEFS` (`invokeModelGenerate` passes it on every call) |
| `RuntimeError: no such capability: tool.grep` | the contract id is not in `provides` **and** `fiber.provide`, or the component was not mounted |
| Permission denied | the id is missing from `GRANTED_CAPABILITIES` |
| The model calls it in an infinite loop | `MAX_TOOL_STEPS` (20) is the only bound; check the result text actually answers the question |
| Works in a test, fails in the browser | the app was not restarted, so the component is not mounted |
| Replay executes the tool twice | a bare filesystem read or an unrecorded call slipped into the agent body |

## Rollback

Remove the `ToolDefinition`, the handler, the `formatToolResult` branch, the label, and the mock
scenario. Capability ids are free of migrations, so nothing durable needs cleaning. A `run.invocation`
event referencing a now-removed capability will replay to its recorded result, which is fine.

## Related

- [add-a-capability.md](add-a-capability.md) — the full vertical slice
- [../workflows/tool-loop.md](../workflows/tool-loop.md) — how dispatch works
- [../reference/tools.md](../reference/tools.md) — the current tool set
- [../subsystems/capabilities.md](../subsystems/capabilities.md) — containment and subprocess bounds
- [../explanation/determinism-and-replay.md](../explanation/determinism-and-replay.md) — why `ctx.step` matters
