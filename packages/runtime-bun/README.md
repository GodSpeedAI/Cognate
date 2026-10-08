# @godspeedai/runtime-bun

Bun reference runtime implementing `RuntimeService` (ADR-0011) in-process.

## Architecture
- `runtime.ts` composes: SQLite store (or a supplied `DurableStore`), Cordis kernel with mounted components,
  `ContinuationService`, `ArtifactService`, `ProjectionRunner`s (user projections + cognitive indexer), background loop.
- `service.ts` authorizes (`actions` policy), enforces tenancy (other tenants see `not_found`), maps typed errors.
- `executor.ts` runs agents by replay; `fold.ts` derives `RunView` from the run stream; `inspect.ts` rebuilds causal chains.
- `invoker.ts` wraps the kernel policy (AsyncLocalStorage) to pass the caller tenant and capture each decision.

## Run model
A run is stream `run-<id>`: `run.started` (input in payload; agent/startedBy in metadata) → recorded steps →
`run.completed | run.failed | run.cancelled`. Each event's `causationId` is the previous run event. A `runs`
record holds ids only; views are folds over events, so erased payloads vanish from `getRun`.

## Replay rules
Every execution re-reads the stream and re-enters the agent from the top. Calls get deterministic step ids
(`step:<id>`, `emit:<n>`, `invoke:<n>`, `artifact:<n>`, `recall:<id>`, `wait:<id>`) kept in event metadata; a
recorded result is returned instead of re-executing. `waitFor` opens continuation `<runId>.wait.<id>` (handler
`run.resume@1`), records `run.waiting`, and suspends; re-entry records `run.resumed` (returns input) or
`run.wait.closed` (throws `ContinuationClosedError`). Appends are CAS on the stream version; losing a race
(e.g. to `cancelRun`) re-runs the replay, which then sees the terminal state.

## Background loop
Every `tickMs` (and on kicks): expire due continuations, deliver `continuation.resume` (handler re-executes the
run), drain `run.execute` outbox intents (committed with `run.started`), re-enter queued runs. Executions of one
run are serialized. `idle()` polls until no tick, execution, available outbox item, or projection lag remains.

## Limits
- Single process, single writer; executions within a tick run sequentially (a slow agent delays others).
- Polling loop (default 10 ms), including `expireDue` scans over open continuations.
- Kernel is single-tenant; the tenant reaches `Policy` via the invoker wrapper only.
- Continuation records/idempotency snapshots and `run.recall` results hold copies of content that
  erasing run events does not remove.
- Default cognition indexes run output only.
- Public projections must key state `<tenant>/<key>`; `readProjection` returns only the caller's prefix
  (stripped, key order), `[]` for an empty partition, `not_found` for unknown names.
- Denied artifacts return `not_found` deliberately, hiding whether the artifact exists (spec §32).
- Steps are at-least-once: a step running at a crash re-executes on restart; put external effects in `CommitmentService`.
