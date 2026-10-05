# Tool reference

The tools `agent.coding` advertises to the model, and what each one actually does when it runs.

Definitions live in `TOOL_DEFS` in `cognate/src/agents/agentCoding.ts`. Six of the seven have a
capability in `cognate/src/capabilities/tools.ts`; `todo_write` and `exit_plan_mode` are handled
inline by the agent, and `subagent` is inline plus one capability.

## The set

| Tool | Capability | Gate | Inline | Changes the filesystem |
|---|---|---|---|---|
| `read` | `tool.read` | no | no | no |
| `edit` | `tool.edit` | no (but has a read-before-edit guard) | no | **yes** |
| `bash` | `tool.bash` | no | no | **yes** |
| `run_code` | `tool.run_code` | **approval** when escalating | no | **yes** |
| `todo_write` | — | no | yes | no |
| `exit_plan_mode` | — | no | yes (opens a continuation) | no |
| `subagent` | `subagent.start` | no | yes | no (in the parent) |

## `read`

| | |
|---|---|
| Arguments | `file_path` (string, required) |
| Result | `{file_path, content}` — the path is echoed as given |
| Model sees | The file's contents, verbatim |
| Fails with | `path escapes workspace root: <p>`; a `readFile` error for a missing file |
| Also | On success, the path is added to the turn's `readFiles` set, which is what satisfies the read-before-edit guard for a later `edit`. A **failed** read does not count. |

## `edit`

| | |
|---|---|
| Arguments | `file_path`, `old_string`, `new_string` (all required), `replace_all` (boolean, optional) |
| Result | `{file_path, replacements, diffLines, additions, deletions}` |
| Model sees | `Edited <file_path> (N replacement[s]).` |
| Preconditions | `old_string` must occur at least once — else `tool.edit: old_string not found in <f>`. More than once without `replace_all` — else `tool.edit: old_string is not unique in <f> (N matches) — provide more context or set replace_all`. |
| `replacements` | The occurrence count when `replace_all`, otherwise 1 |
| `diffLines` | A common-prefix/suffix line diff: ` ` unchanged, `-` removed, `+` added. The UI's collapsed/expanded diff card and the split review panel both render from it. |
| **Guard** | If the file already exists on disk and was not read this turn, the agent fails the call with `fs_not_observed: read <file_path> before editing it` and **does not invoke the capability**. A file that does not exist yet needs no prior read. The existence check is boxed in `ctx.step`, so a replay does not re-touch the disk. |
| Containment | `resolveInWorkspace` applies, like every file tool. |

## `bash`

| | |
|---|---|
| Arguments | `command` (required), `description` (optional) |
| Result | `{command, exitCode, stdout, stderr, timedOut}` |
| Model sees | `stdout` and `stderr`, trimmed, joined by a newline; or `(command exited <N> with no output)` |
| Execution | `bash -lc <command>` with `cwd` = the resolved workspace root |
| Bounds | 30s default timeout (`timeoutMs` may override), kill on expiry; each stream capped at 20,000 chars with `…(truncated)` |
| Gate | **Never.** Escalation lives on `run_code` in the reference's tool schemas, so `bash` never reaches the gate. |
| Running label | `Running commands · <description or command>` — the suffix is hidden in `compact` and `verbose` work-details modes |

**Containment limit, stated plainly:** `cwd` is the workspace root, but the command itself may
reference absolute paths anywhere. This is a working-directory constraint, not a sandbox. See
[../explanation/security-and-trust.md](../explanation/security-and-trust.md).

## `run_code`

| | |
|---|---|
| Arguments | `code` (required), `description`, `sandbox_permissions`, `justification` (all optional) |
| Result | `{exitCode, stdout, stderr, timedOut}` |
| Model sees | `stdout` + `stderr` trimmed and joined; or `(run_code completed with no output)` |
| Execution | `bun -e <harness>` with `cwd` = the resolved workspace root, same 30s / 20,000-char bounds |
| Harness | An original small wrapper defining a single `tools.bash({command})`, running the snippet in an async IIFE, and setting `process.exitCode = 1` on a throw. It is **not** the reference's sandbox. |
| **Gate** | The only approval-gated tool. `sandbox_permissions` is read by `approvalGate` and never enforced as an argument; the gate fires when the requested level ranks **above** the session's access mode. |
| Running label | `Running code · <description>` |

## `todo_write`

| | |
|---|---|
| Arguments | `todos: [{content, status}]` (required; `status` is a free string) |
| Emits | `plan.todos.updated` — replaces the `plans` row's `todos` wholesale |
| Model sees | `Todos updated (N in progress, M pending).` |
| Gate | none |
| **Recorded regardless of plan mode** | The to-do widget also works in an ordinary session. This matches the reference and is a deliberate design point. |
| Inline | Yes — the effect is state, not I/O. |

## `exit_plan_mode`

| | |
|---|---|
| Arguments | `plan` (markdown, required) |
| Outside plan mode | `tool.call.failed` with exactly `Error: exit_plan_mode is only available in plan mode`. **No continuation is opened.** |
| Inside plan mode | Emits `plan.review.requested {sessionId, toolCallId, heading, markdown}` and opens a `plan-review` continuation |
| `heading` | The plan's first markdown heading, `#`s stripped. Falls back to the first non-empty line truncated to 80 chars. |
| Approved | `plan.review.decided {approved:true}`, `plan.mode.changed {on:false}`, `tool.call.completed {approved:true}`; the model receives `Plan approved — plan mode exited; carry out the plan starting with your next step.` |
| Changes requested | `plan.review.decided {approved:false}`, `tool.call.failed`; the model receives `Error: the user requested changes to this plan[: <feedback>]; revise the plan and call exit_plan_mode again` |
| Running label | `Calling tools · exit_plan_mode` (the tool name is the detail, so the work-details mode does not change it) |
| Inline | Yes — plus one continuation. |

The request-changes wording is **this app's own**, not reference-observed; the pinned capture never
exercised that path.

## `subagent`

| | |
|---|---|
| Arguments | `description` (required), `prompt` (required), `run_in_background` (optional, **ignored** — delegation is always fire-and-forget) |
| Emits | `subagent.spawned {sessionId, toolCallId, description, prompt, childRunId}` |
| Result | `{childRunId}` |
| Model sees | `started subagent <childRunId>` — a confirmation, **not** the child's answer |
| Child | A real `agent.coding` run with a fresh history, the `prompt` as its only message, the same workspace, correlated `subagent:<parentRunId>:<toolCallId>` |
| Parent | Returns immediately. Nothing waits. The child's completion is observed by the `subagents` projection from the child's own events. |
| Reaching the parent | On the parent's **next** turn, `session.history` folds a synthetic `Subagent "<title>" completed: <output>` context message. |
| Running label | `Coordinating subagents · <description>` |
| Inline | Yes — plus the `subagent.start` capability. |

## Tool result formatting

`formatToolResult` in `agent.coding` decides what the model actually reads. Its rules:

- `read` → the file content, verbatim.
- `edit` → `Edited <path> (N replacement[s]).`
- `bash` / `run_code` → trimmed `stdout` + `stderr` joined by a newline, or a
  `(… no output)` placeholder.
- everything else → `JSON.stringify(result)`.

The result text is the tool's only channel back to the model. `bash` and `run_code` deliberately drop
their structured result and send plain text, because the model reads prose better than JSON here.

## The loop's bounds

| Bound | Value | Behaviour at the limit |
|---|---|---|
| Steps per turn | 20 | `message.completed` with `Reached the tool-call step limit for this turn.` |
| Approvals per turn | at most 1 open at a time | the loop is sequential, so a second approval cannot open until the first resolves |
| Reads tracked for the edit guard | per turn | `readFiles` is rebuilt on replay, so the guard is deterministic |

## Driving a tool without a real model

The mock server's scenarios make each path reachable from a message marker:

| Marker | Script |
|---|---|
| `[[scenario:read]]` | `read(README.md)` → summary |
| `[[scenario:edit]]` | `read` → `edit` (`Hello`→`Howdy`) → summary |
| `[[scenario:shell]]` | `bash(git status --short)` → `bash(ls)` → summary |
| `[[scenario:multi]]` | `read` → `bash` → `edit` → summary |
| `[[scenario:approval]]` | `run_code` with `sandbox_permissions: "workspace-write"` → reflect the result |
| `[[scenario:plan]]` | `todo_write` → `exit_plan_mode` → reflect the decision |
| `[[scenario:delegate]]` | `subagent` → reflect; the child answers via `[[scenario:child]]` |

Without a marker the mock answers a plain markdown message. The mock's step within a script is the
number of `tool` messages after the marked user message, so the same conversation always replays the
same way. `__REFLECT_TOOL_RESULT__` makes the model echo the tool result verbatim, which is how the
tests assert exact feedback text.

## Related

- [capabilities.md](capabilities.md) — the underlying capability contracts
- [../workflows/tool-loop.md](../workflows/tool-loop.md) — the dispatch order
- [../workflows/approval-gate.md](../workflows/approval-gate.md) — the `run_code` gate
- [../workflows/plan-mode.md](../workflows/plan-mode.md) — the plan tools
- [../workflows/delegation.md](../workflows/delegation.md) — the `subagent` tool
- [../how-to/add-a-tool.md](../how-to/add-a-tool.md) — adding one
