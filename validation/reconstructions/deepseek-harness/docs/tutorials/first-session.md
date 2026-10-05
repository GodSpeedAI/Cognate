# Tutorial: your first session, end to end

A guided, verified walkthrough. By the end you will have a running app, a configured model, a real
workspace on disk, and a completed turn that the agent actually mutated files in.

**Time:** about 10 minutes.
**Prerequisites:** `bun` (1.4.0 was used for this run), a browser, and `git` (the fixture workspace
git-inits itself).
**You do not need:** a real model API key. The tutorial uses the repository's deterministic mock.

Every step below states what you should see and which test proves the same thing, so if a step does not
behave as described you can tell whether the tutorial or the app is wrong.

---

## Step 1 — Create a workspace to work in

The agent's tools are confined to a directory you choose, so make one.

```bash
cd validation/reconstructions/deepseek-harness
bun fixtures/workspace/make-workspace.ts /tmp/cg-demo-ws
```

The script copies `fixtures/workspace/template/` (`README.md`, `notes.txt`, `package.json`,
`src/greet.ts`), git-inits it with a fixed author and fixed dates so the commit SHA is deterministic,
and prints the path. `src/greet.ts` contains:

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

That `Hello` is what step 6 will change.

## Step 2 — Start the mock model

```bash
bun fixtures/mock-model/server.ts            # listens on 127.0.0.1:4010
```

You should see:

```
[mock-model] listening on http://127.0.0.1:4010 (chunk delay 40ms)
```

This server is the app's model provider for the whole tutorial. It has no sessions and no memory: a
`[[scenario:<name>]]` marker in your message picks a script, and the "step" within the script is the
number of tool results already in the conversation. The same conversation always produces the same
answer.

Leave it running in its own terminal.

## Step 3 — Start the app

```bash
cd cognate
PORT=3180 COGNATE_HARNESS_HOME=/tmp/cg-demo-home bun run dev
```

Three lines of output matter:

```
[domain] loaded 51 semantic objects (digest sha256:43e412c9…) from …/cognate/.sea/interaction/interaction-model.sea
[deepseek-harness] listening on http://127.0.0.1:3180 (home: /tmp/cg-demo-home)
[deepseek-harness] dev auth: Authorization: Bearer local:operator
```

The first proves the semantic model parsed. The second is your URL. The third is the dev token the
browser uses automatically — the UI bundle embeds it, so you do not need it for this tutorial, and the
server labels it explicitly as not production auth.

Confirm it is healthy:

```bash
curl -s http://127.0.0.1:3180/health
# {"ok":true,"semantic":{"objects":51,"digest":"sha256:43e412c9…"}}
```

## Step 4 — Get past the first-run dialogs

Open <http://127.0.0.1:3180/>.

You should see a modal headed "Internal Testing Notice" with a single **Continue** button. Press it.
Then a second modal, "Add an API key to get started", with **Configure later** and **Save and continue**
(the latter disabled until you type something). Press **Configure later**.

**What to notice:** these reappear whenever `COGNATE_HARNESS_HOME` changes, and never reappear on the
same home. They are derived from the `onboarding` projection — a fresh home has no rows. Pressing
Continue recorded an `onboarding.dismissed` event; it did not set a flag in memory.

To see them again, stop the app and start it with a different home.

*Proved by:* `cognate/src/capabilities/onboardingDismiss.ts`, and the `onboarding` projection.

## Step 5 — Configure the model and choose the workspace

The center column shows the workspace chooser: a notice, a path input labelled "Workspace directory
path", and a **Choose workspace** button.

**First, the model.** Open **Settings** (gear, bottom of the sidebar) → **Models**. With nothing
configured you get an empty state and "+ Add model provider". Open the wizard and fill the
**Custom model API** tab:

| Field | Value |
|---|---|
| Provider ID | `mock` (lowercase, starts with a letter; it also names the stored credential) |
| Display name | `mock` |
| Base URL | `http://127.0.0.1:4010/v1` |
| API protocol | OpenAI Chat Completions |
| API key | anything, e.g. `not-a-real-key` |
| Models | press **Add model**, then set the row's Model ID to `mock-model-1` |

Then **Create provider**.

Two things the wizard will not tell you but this documentation should: **Display name is required**
(the button stays disabled without it), and **only the first Models row is actually used** — the
backend holds exactly one live provider configuration, so extra rows are structural only. "Fetch
available models" is present and disabled; there is no live provider-introspection capability.

**What to notice:** the model is usable immediately — no restart. `model.configure` writes the key to a
`0600` file, mounts a live provider fiber, and records the non-secret part as an event. The Models list
now shows a configured-provider card whose key field reads as already-set, never showing your key
back. Switching the Base URL and saving again swaps the provider in place.

**Second, the workspace.** Back in the center column, type `/tmp/cg-demo-ws` and press **Choose
workspace**.

**What to notice:** a sidebar appears with the workspace name, and the composer becomes enabled. It
was disabled because there was no workspace *and* no model. A non-existent path is rejected with a
visible error, because `workspace.select` validates it server-side.

*Proved by:* `cognate/test/J-CFG-model-provider.test.ts` and `cognate/test/J-WS-select.test.ts`.

## Step 6 — Run your first turn

In the composer, send:

```
[[scenario:multi]] change the greeting
```

Within a second or two you will see, in order:

1. Your message bubble.
2. A status line and a running-tool row, and streamed text beginning "Read greet.ts…".
3. Three tool entries — a `read`, a `bash`, and an `edit` — each flipping from running to done.
4. A file-change card reading roughly "Edited `src/greet.ts` +1 −1", expandable into a diff.
5. The final answer: "Read greet.ts, confirmed a clean tree, then updated the greeting from "Hello" to
   "Howdy"."

Now check the filesystem:

```bash
grep -n Howdy /tmp/cg-demo-ws/src/greet.ts     # → line 2
grep -n Hello /tmp/cg-demo-ws/src/greet.ts     # → no match
git -C /tmp/cg-demo-ws diff --stat            # → src/greet.ts | 2 +-
```

**This is the point of the exercise.** The agent really ran `read`, really spawned `bash`, and really
wrote the file. It was also *required* to read the file first: had the model tried to edit without
reading, the turn would have failed with `fs_not_observed: read src/greet.ts before editing it`.

**What to notice:** the sidebar session title is your message text, truncated — set at turn *start*,
not from the answer.

*Proved by:* `cognate/test/J-C-tool-execution.test.ts`, which asserts the tool order
`["read","bash","edit"]`, no failed call, the answer text, and the on-disk mutation.

## Step 7 — Prove the durability claim

Ask one more message, then kill the process:

```
[[scenario:plain]] one more thing
```

Let it finish, then `Ctrl-C` the app and start it again **with the same home**:

```bash
PORT=3180 COGNATE_HARNESS_HOME=/tmp/cg-demo-home bun run dev
```

Open the page. You should land back in the same session: the title, both turns, and the file-change
card are all still there, because they were read back from the event log. The first-run dialogs did
**not** reappear. The workspace is still selected.

*Proved by:* `cognate/test/J-G-persistence.test.ts`.

## Step 8 — See a human decision stop the agent

Send:

```
[[scenario:approval]] run something risky
```

The model calls `run_code` asking for `sandbox_permissions: "workspace-write"` while the session's
access mode is `read-only`. That is an escalation, so the run stops and the composer is replaced by an
approval card showing the tool, the requested permission, and the justification ("Need to remove a
stale cache directory outside the default workspace sandbox.").

**The interesting part:** reload the page right now. The approval card is still there. Kill the app,
restart it with the same home, and the card is *still* there. The reference product silently finishes
the turn in that situation; this one does not, deliberately.

Press **Reject**. The agent's next step receives this text as the tool result:

```
Error: the user rejected escalating this program to "workspace-write"; it stays denied, so stop and explain instead of working around it
```

and the turn completes. The session's mode badge in the header now reads **PTC mode** — sticky, because
this session has crossed into a permission-to-continue exchange.

*Proved by:* `cognate/test/J-D-approval.test.ts` (allow, deny, restart-while-pending, replay safety).

## Step 9 — Plan mode, and hand work to a subagent

Send:

```
/plan [[scenario:plan]] change the greeting
```

The `/plan ` prefix turns plan mode on *before* the model is called, and the composer placeholder
changes. The model calls `todo_write` (the To-dos widget appears) and then `exit_plan_mode` with a
markdown plan — which opens a **plan review card**, not an approval card. The review shows a heading
("Update greeting") and the plan body, with a **View full plan** disclosure.

Approve it. Plan mode exits, the agent receives the exact text
`Plan approved — plan mode exited; carry out the plan starting with your next step.`, and the To-dos
widget stays — to-dos persist after plan mode exits. Send `/plan off` to leave plan mode without a
model call.

Then send:

```
[[scenario:delegate]] delegate this
```

The model calls `subagent`. The parent's turn finishes *immediately* with the text
`started subagent <id>` — the child is still running. A few seconds later an "N subagent(s)"
disclosure appears in the header; expand it, and the child's status flips to completed. Open it to see
the child's prompt and its one-sentence answer. The child does **not** appear in the sidebar's session
list — subagents are not sessions.

Now send any plain message. The child's answer appears in this turn's model context, folded in
silently. That is the "result returns to the parent" mechanism.

*Proved by:* `cognate/test/J-E-plan.test.ts` and `cognate/test/J-F-delegation.test.ts`.

## Step 10 — Stop it, and see a failure

Send `[[scenario:interrupt]] keep going`. After a few words, press the composer's **Stop generating**
(the label is exactly that). The partial text is kept with a "Stopped" pill and no duration. Ask
another message in the same session — it works normally.

Then send `[[scenario:error]] do the thing`. The provider fails every time, so the app retries five
times, then fails the turn with "This turn failed / Internal server error / HTTP_500" and a retry
disclosure listing each attempt. The composer stays available.

*Proved by:* `cognate/test/J-H-cancellation.test.ts` and `cognate/test/J-H-provider-error.test.ts`.

## Where to go next

- Change the app: [../how-to/add-a-tool.md](../how-to/add-a-tool.md),
  [../how-to/add-a-capability.md](../how-to/add-a-capability.md)
- Understand what you just saw: [../workflows/run-a-turn.md](../workflows/run-a-turn.md)
- Change the look: `cognate/DESIGN.md`, then `cognate/src/ui/app.css`'s `:root` tokens
- Clean up: delete `/tmp/cg-demo-home` and `/tmp/cg-demo-ws`, and stop both servers
