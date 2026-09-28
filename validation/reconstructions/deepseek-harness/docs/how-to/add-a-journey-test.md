# How to add a journey test

There are two kinds of journey test, and a feature usually wants both: a Bun integration test in
`cognate/test/` that asserts behaviour at the API and event level, and a Playwright spec in
`tests/journeys/` that asserts the same journey through the interface. This page covers both.

## What a journey is

A journey has a canonical identity in the Interaction Domain Model: an
`Instance … of "CanonicalJourney"` record with a `journey_id`, an actor, a precondition, steps, a
settlement condition, and variants. The journey id is the name of both test files. That is not
convention for its own sake — it is the traceability link from a UI behaviour to a semantic entity to
a test.

The ten existing ids are listed in `cognate/.sea/interaction/canonical-journey-catalog.md` and mapped
to tests in [../reference/journeys.md](../reference/journeys.md).

## Decide: a new journey, or a case in an existing one?

| | New journey | New case in an existing file |
|---|---|---|
| The behaviour has its own actor, precondition, and settlement | yes | no |
| It is independently reachable | yes | no |
| It needs its own IDM instance | yes | no |

`J-CFG-model-provider` and `J-WS-select` exist as separate journeys precisely because each is
independently reachable with its own capability ids; `handoff.md` warns explicitly against collapsing
them. Everything else — a second tool, a second denial — belongs in the existing file.

---

## Part 1 — the integration test (`cognate/test/J-<id>.test.ts`)

### The harness

`cognate/test/helpers.ts` gives you three things, and you should not reimplement any of them:

```ts
await withTempHome(async (home) => {
  const mock = await bootMockModel();          // a real separate process on its own port
  const { app, client } = await bootApp(home); // port 0, temp home
  try {
    // …
  } finally {
    await app.stop();
    await mock.stop();
  }
});
```

`bootMockModel` runs `fixtures/mock-model/server.ts --port=0` as a **child process** rather than
importing it, because the mock belongs to another tranche and this app's strict tsconfig should not
typecheck it. Each test gets its own home and its own mock port, so tests do not interfere.

### The standard preamble

Almost every journey test needs a model and a workspace before it can do anything:

```ts
await client.invoke("model.configure", {
  providerId: "mock",
  baseURL: `http://127.0.0.1:${mock.port}/v1`,
  protocol: "openai-compatible",
  model: "mock-model-1",
  apiKey: "",
});
await mkdir(workspaceDir, { recursive: true });
const { workspaceId } = await client.invoke("workspace.select", { path: workspaceDir });
```

`J-C-tool-execution` additionally calls `makeWorkspace(workspaceDir)` from
`fixtures/workspace/make-workspace.ts` — required whenever the test asserts a **real** filesystem
effect, because the tool loop edits files that have to exist.

### Starting a turn

```ts
const run = await client.startRun(
  "agent.coding",
  { sessionId, workspaceId, message: "[[scenario:multi]] …" } as never,
  { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` },
);
```

The `[[scenario:…]]` marker is how the mock picks its script. Without it the mock answers `plain`.

### Waiting

There is no promise for "the run finished" in these tests; they poll, because the point is to observe
the durable state:

```ts
async function waitForCompletion(app: AppServer, runId: string) {
  for (let i = 0; i < 400; i++) {
    const run = await app.runtime.service.getRun(LOCAL_OPERATOR, { runId });
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return run;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`run ${runId} did not complete in time`);
}
```

Copy that helper into the file rather than importing it from another test — each test file is
self-contained by design. For continuations, poll `listContinuations` for an `OPEN` one
(`waitForCondition`). For projections, poll `readProjection` until the expected shape appears. Polling
`readProjection` rather than sleeping a fixed time is what keeps these tests from being flaky.

### What to assert

A journey test earns its place by asserting the **settlement condition** from the IDM, not by
asserting that nothing threw. For a tool journey that means the file changed on disk. For an approval
journey it means the exact text fed back to the model. For a persistence journey it means the state
after a real restart.

Four assertion categories, in rough order of value:

1. **The settlement condition**, against real state (disk, a projection row, a run output).
2. **The event sequence** — subscribe with `client.subscribe({}, …)` and collect `tool.call.*` in
   order. `J-C-tool-execution` asserts `["read","bash","edit"]`.
3. **Exact user-facing strings** where the string is the contract: the approval denial text, the
   plan-approved reflection, the not-in-plan-mode error.
4. **Counts where a count is the point**: exactly 5 `model.request.retried` events, exactly one
   `turn.failed`, each `toolCallId` appearing once.

### Restart tests

To prove durability, do a real restart, not a reload:

```ts
await app.stop();
const restarted = await startServer({ port: 0, home });   // same home
// assert, then restarted.stop() in a finally
```

Import `startServer` directly for this — `bootApp` would give you a new client but the point is that
the *same store* is reopened. Note the mock model process keeps running across the restart; only the
app is stopped.

### Speed

Set `MODEL_RETRY_BACKOFF_MS` low in any test that exercises retries (the existing ones use 10–150ms
and delete the variable in `finally`). Raise the test timeout for restart tests — the existing ones
pass `15_000` as the third argument to `test`.

## Part 2 — the interface journey (`tests/journeys/<K>-<name>.spec.ts`)

### Write against the Driver, never against the product

```ts
await env.driver.newSession(page);
await env.driver.send(page, "[[scenario:approval]] run something risky");
await expect(env.driver.locators.approvalPanel(page)).toBeVisible({ timeout: 15_000 });
await evidence(page, testInfo, "01-pending");
await env.driver.approve(page);
```

`setupJourney`/`teardownJourney`/`bootToReadyComposer` from `tests/journeys/harness.ts` handle system
selection, a fresh home, a fresh workspace, and a per-journey mock port. If you find yourself writing
a product-specific selector, you need a driver method instead.

### Divergences go in `Expectations`, not in a branch

If the two systems genuinely differ, add a cited field to `Expectations` in
`tests/drivers/types.ts` and implement it in both drivers. Do not write
`if (process.env.SYSTEM === "cognate")` inside a spec.

### Evidence

`evidence(page, testInfo, "01-pending")` attaches a screenshot. Attach one at each state the journey
is about, not at every step.

### Run it

```bash
cd tests
bun run journeys:cognate            # just this app
bun run journeys                    # both systems, writes results/summary.md
```

`run.ts` passes `--retries=2` and classifies a test that passes on retry as **flaky**, not passed.

## Validation

```bash
cd cognate && bun test test          # the integration test
cd tests  && bun run journeys:cognate   # the spec
bun test tests/architecture          # nothing regressed
```

Run the whole app suite, not just your file: these tests share a fixture and a store format, and a
projection change can break a journey you did not touch.

## Common failure symptoms

| Symptom | Cause |
|---|---|
| The test times out waiting for completion | the mock was never started, or the base URL points at the default 4010 instead of `mock.port` |
| `no provider mounted` | `model.configure` was not awaited before `startRun` |
| The run fails on an unknown workspace | `workspace.select` was not awaited, so the `workspaces` projection has no row yet |
| Flaky in CI, fine locally | a fixed `sleep` where a poll belongs, or a shared mock port |
| The tool had no effect on disk | the workspace was created with `mkdir` instead of `makeWorkspace`, so the target file did not exist |
| A spec passes for Cognate and fails for the reference | probably a real reference-side flake; check `results/summary.md`'s flake section before changing the spec |
| A restart test fails | the test used `bootApp` for the second server (a new home) instead of `startServer({port: 0, home})` |

## Related

- [../reference/journeys.md](../reference/journeys.md) — the ten journeys and their tests
- [../operations/testing.md](../operations/testing.md) — the four suites and what each proves
- [../subsystems/validation-harness.md](../subsystems/validation-harness.md) — the Driver contract
- [../explanation/parity-method.md](../explanation/parity-method.md) — why journeys are the primary evidence
- `cognate/.sea/interaction/canonical-journey-catalog.md` — the settlement conditions to assert
