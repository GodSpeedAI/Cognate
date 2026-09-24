# @cognate/client

Headless client over any `RuntimeService` (in-process or remote). No React (§25.1).

- `run(runId)` — live `RunState` derived only from durable events: text (`message.delta`), shared state (`state.changed` snapshot or RFC 6902 patch), status, open continuations, artifacts, output, last position.
- `subscribe({ afterPosition })` — event stream that resumes from the last delivered position after a disconnect; no gaps, no duplicates; `status` reports connecting/live/reconnecting/closed (§31.8).
- `provideCapability(name, handler)` — serves frontend capabilities: open `frontend_capability` continuations naming `name` are executed locally and resolved `{ ok, value | error }` (see `invokeFrontend` in runtime-api). Returns an unregister function.
- `projection`, `invoke`, `artifact`, `startRun`, `cancelRun`, `resolveContinuation`, `close`.

Proof: `test/client.test.ts` (CG-CLT-001).
