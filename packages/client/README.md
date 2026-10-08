# @godspeedai/client

Headless client over any `RuntimeService` (in-process or remote). No React (§25.1).

- `run(runId)` — live `RunState` derived only from durable events: text (`message.delta`), shared state (`state.changed` snapshot or RFC 6902 patch), status, open continuations, artifacts, output, last position.
- `updateState(runId, update, options?)` — shared state is bidirectional (§29.1): a caller can write it too, appending a caller-sourced `state.changed` event the agent observes through `RunContext.state`. `startRun(agent, input, { state })` seeds a run's initial state. Both the client's fold and the runtime's fold share `@godspeedai/runtime-api`'s `applyStateUpdate`/`foldState` semantics.
- `subscribe({ afterPosition })` — event stream that resumes from the last delivered position after a disconnect; no gaps, no duplicates; `status` reports connecting/live/reconnecting/closed (§31.8).
- `provideCapability(name, handler)` — serves frontend capabilities: open `frontend_capability` continuations naming `name` are executed locally and resolved `{ ok, value | error }` (see `invokeFrontend` in runtime-api). Returns an unregister function.
- `projection`, `invoke`, `artifact`, `startRun`, `cancelRun`, `resolveContinuation`, `close`.

Proof: `test/client.test.ts` (CG-CLT-001).
