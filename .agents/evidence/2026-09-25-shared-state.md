# Bidirectional shared application state (CG-STA-001) and DEBT-019 close-out — 2026-09-25

## Feature 1 — bidirectional shared state (spec §29.1)

**Contract (already written before this change):** `packages/runtime-api/src/state.ts` (strict
`applyJsonPatch`/`applyStateUpdate`, tolerant `foldState`, `StatePatchError`), and the doc comments
on `RunContext.state(id)`, `RuntimeService.startRun({ state })`, `RuntimeService.updateState`,
`RuntimeService.listRuns` in `packages/runtime-api/src/types.ts`.

**Cognate change:**
- `packages/runtime-api/src/conformance.ts` — new kit agent `agent.stateReader` (reads state
  before and after a wait) plus 10 conformance cases: a caller updates a waiting run's state and
  the agent reads it after resume; `startRun({ state })` seeding; `updateState` idempotency,
  `expectedVersion` enforcement, rejection of a non-applying patch (`invalid_argument`) and of a
  terminal run (`failed_precondition`); tenant isolation (`not_found`); authorization (`mallory` →
  `permission_denied`); a `listRuns` case (Feature 2); and 50 concurrent `startRun` calls all
  succeeding with `listRuns` returning them in `run.started` store-position order (Feature 2,
  contention regression guard — see below).
- `packages/runtime-bun/test/support.ts` — `kitPolicies` now also denies `run.state.*` actions for
  the kit's denied principal; `KitSetup.deniedPrincipal` doc comment updated.
- `packages/runtime-bun/src/fold.ts` — `runStateStream(runId)` (`run-state-<runId>`, a stream
  separate from the run stream so a caller write never races the executor's `expectedVersion`).
- `packages/runtime-bun/src/service.ts`:
  - `startRun`: when `state` is given, commits a caller-sourced `state.changed` `{snapshot}` on
    the state stream in the *same* commit as `run.started` (atomic); `state` is part of the
    idempotency fingerprint. `startRun` otherwise has the same single-commit shape it always had —
    no extra record, no retry loop (see "Regression and fix" below).
  - `updateState`: folds the run stream + state stream via `foldState`, applies the caller's update
    via `applyStateUpdate` (a `StatePatchError` maps to `invalid_argument`), rejects a terminal run
    (`failed_precondition`), enforces `expectedVersion` against the caller-write count
    (`failed_precondition` on mismatch), is authorized as `run.state.update`, and commits
    idempotently by key; retried on `ConcurrencyError`.
  - `listRuns`: `store.listRecords("runs", { tenant, correlationId?, agent? })`, then for each
    matched run reads only its first event (`store.readStream(runStream(runId), { limit: 1 })`,
    an indexed, O(1)-per-run read — not an event-log scan) and sorts by that `run.started` event's
    store position (spec §10's store-wide commit order) — exact and contention-free.
- `packages/runtime-bun/src/executor.ts` — `ctx.state(id)`: recorded under step id `state:<id>`
  (idempotent across replay like `ctx.step`); on first read, folds the run's own stream (read fresh,
  not the stale snapshot from execution start) plus the state stream via `foldState`.
- `packages/runtime-bun/src/index.ts` — `ActionPolicy.authorize` action union gains
  `"run.state.update"`.
- `proto/cognate/v1/execution.proto` / `runtime.proto` — `StartRunRequest.state`, `ListRunsRequest`
  /`ListRunsResponse`, `JsonPatchOp`/`JsonPatchOps`/`StateUpdate` (oneof `snapshot` | `patch`),
  `UpdateStateRequest`/`UpdateStateResponse`; `RuntimeService.ListRuns`/`UpdateState` RPCs.
  Regenerated via `bun run generate` in `packages/proto`; `packages/proto/test/codegen.test.ts`
  (byte-identical codegen gate) passes.
- `packages/protocol-connect/src/index.ts` — wire mapping both directions for `listRuns` and
  `updateState` (including the `StateUpdate`/`JsonPatchOp` oneof), and `state` on `startRun`.
- `packages/client/src/index.ts` — `updateState(runId, update, options?)`; `state` option on
  `startRun`; the client's private JSON Patch implementation (`applyJsonPatch`/`setIn`/`getIn`/
  `parsePointer`) is deleted and replaced by `@cognate/runtime-api`'s `applyStateUpdate`/
  `StatePatchError`, wrapped the same tolerant way `foldState` is (a patch that fails to apply is
  skipped, not thrown).
- `packages/react/src/index.tsx` — `useSharedState(runId)` hook: `{ state, update }` over
  `useRun`'s derived state and `client.updateState`.
- `packages/ag-ui/src/index.ts` — `RunAgentInput.state` seeds `startRun({ state })` when it is a
  non-empty object (the AG-UI client's default `state: {}` does not seed).

## Feature 2 — DEBT-019: `listRuns` replaces the AG-UI/Harness event-log scan

- `packages/store-sqlite/src/index.ts` `listRecords`: equality filters in `where` now push down as
  `json_extract(value, '$.<field>')` SQL predicates (validated field names) instead of loading every
  record in the collection into JS and filtering there; results are explicitly `ORDER BY id`. The
  collection name is embedded as a validated SQL literal (not bound) because SQLite only applies a
  partial index whose condition is a literal predicate — a bound `?` parameter defeats partial-index
  selection even when its runtime value matches. The query-building logic is extracted into an
  exported pure function, `buildListRecordsQuery(collection, where)`, so tests can run
  `EXPLAIN QUERY PLAN` on exactly the SQL the real code path issues, not a hand-written stand-in.
- `packages/store-sqlite/src/schema.ts` — migration 3: partial expression indexes on `records`
  for `collection = 'runs'` over `tenant`, `correlationId`, `agent`. `buildListRecordsQuery` adds
  an `INDEXED BY` hint naming the relevant index when querying the `runs` collection (SQLite's
  planner otherwise prefers the always-present `(collection, id)` primary key on a small table
  without `ANALYZE` statistics, which does not scale the way an index scoped to a selective slice of
  runs does). The hint is chosen by a **fixed selectivity priority — `correlationId` > `agent` >
  `tenant`** — not by the order fields appear in `where`: `runtime-bun`'s `listRuns` always builds
  `{ tenant, correlationId?, agent? }` with `tenant` first, so a naive "first key present" choice
  would force every thread/session lookup (`{ tenant, correlationId }`) onto the tenant-wide index,
  which filters every run in the tenant rather than the one thread's runs — defeating the point of
  DEBT-019. `packages/store-memory` needs no index (in-process `Map`, already filtered fully).
- `packages/store-sqlite/test/runs-index.test.ts` — three cases, each running `EXPLAIN QUERY PLAN`
  on `buildListRecordsQuery`'s own output: `{ tenant }` uses `records_runs_tenant_idx`;
  `{ tenant, correlationId }` uses `records_runs_correlation_idx` (not the tenant index); `{ tenant,
  agent }` uses `records_runs_agent_idx` (not the tenant index). None show `SCAN records`.
- `packages/ag-ui/src/index.ts` `resolveRunId` — now `service.listRuns(caller, { correlationId })`
  taking the last, replacing the `for await (const event of service.events(caller, {}))` scan.
- `profiles/harness/src/index.ts` `session()` — now `listRuns(HARNESS_USER, { correlationId:
  "session:<id>" })`, replacing its own event-log scan.
- `.agents/DEBT.md` — DEBT-019 marked Closed with the resolution above.

## Regression and fix: `startRun` must not serialize on a shared counter

An earlier draft of `listRuns` ordering bumped a shared per-tenant sequence-counter record
atomically with every `run.started` commit, to assign each run a strictly increasing number.
Orchestrator verification found this serializes all concurrent `startRun` calls in a tenant: 200
concurrent `service.startRun` calls with distinct idempotency keys went from all succeeding (before
the draft) to ~190/200 failing with `ServiceError: too much contention starting a run`, on both
`:memory:` and a SQLite file, because every one of them raced the same counter record's
compare-and-swap.

**Fix:** the counter is removed entirely — `startRun` is back to its original single atomic commit
(the run-stream append, the optional state-stream append, and the `runs` record — no extra counter
record, no retry loop, no `RecordConflictError` handling). `listRuns` instead orders by each matched
run's own `run.started` **store position** (`StoredEvent.position`, spec §10's store-wide commit
order — already assigned by the store on every commit, so no new coordination is needed): for each
`runs` record matching the filter, `store.readStream(runStream(runId), { limit: 1 })` reads only its
first event (an indexed, single-row read — not a scan of any event log), and the results sort by
that event's `position`. This is exact — `position` is authoritative commit order — and adds no
contention to `startRun`.

**Regression test:** `packages/runtime-api/src/conformance.ts` — "50 concurrent startRun calls all
succeed and listRuns returns them in start order": 50 concurrent `startRun` calls (distinct
idempotency keys, one correlation id) all resolve; `listRuns({ correlationId })` returns all 50, in
the same order as their `run.started` positions read independently via `service.events`. Confirmed
failing against the counter-based code (`ServiceError: too much contention starting a run`) before
the fix. A direct 200-concurrent repro matching the orchestrator's report was also run manually
against both `:memory:` and a SQLite file after the fix: 200/200 succeeded on each.

## Contract-first (RED before GREEN)

- `packages/runtime-api/src/conformance.ts` additions failed with `service.updateState is not a
  function` / `service.listRuns is not a function` against `packages/protocol-connect` before the
  wire was implemented (they already passed in-process against `runtime-bun` once its own
  implementation landed, since the conformance kit is shared — `packages/runtime-bun/test/
  service.test.ts` was the first to go green).
- The 50-concurrent-`startRun` case failed against the counter-based ordering code with
  `ServiceError: too much contention starting a run` before the counter was removed.
- `packages/store-sqlite/test/runs-index.test.ts` failed once (`Received: "SEARCH records USING
  INDEX sqlite_autoindex_records_1 (collection=?)"`, not the tenant index) before the `INDEXED BY`
  hint was added; again with `no query solution` while the collection value was still bound as a
  parameter (SQLite cannot use a partial index whose predicate is a literal against a bound
  parameter); and again (orchestrator-found) when the hint picked the first key present in `where`
  instead of the most selective one — `{ tenant, correlationId }` and `{ tenant, agent }` both used
  `records_runs_tenant_idx` — confirmed by temporarily reproducing that priority order and rerunning
  the test before restoring the selectivity-priority fix. Each failure diagnosed its fix rather than
  being incidental.

## Gate results

- `bun test ./packages/runtime-bun ./packages/protocol-connect ./packages/client ./packages/react
  ./packages/ag-ui ./profiles/harness ./packages/store-sqlite ./packages/store-memory
  ./packages/events ./tests/integration/shared-state.test.ts` — all green; the new/changed
  conformance and integration tests were run 3 times with no flakes.
- `bun run typecheck` (`tsc -p tsconfig.json`) — 0 errors.
- `bun run test` (full suite: `./compatibility/phase0/sqlite.test.ts ./tests ./packages
  ./profiles`) — 510 pass, 0 fail.
- `bun run check` (`scripts/check-substrate.ts`) — passes with the `CG-STA-001` ledger entry (78
  requirements, 78 implemented).
- `just verify` (`check` + `typecheck` + `tests/proof-routing.test.ts` + `gate.ts --implemented`) —
  78/78 gates pass.
- `just gates` (`gate.ts --all`) — 78/78 gates pass.

## What proves the acceptance criterion (AC-STA-001-01)

`tests/integration/shared-state.test.ts`, 5 tests: an agent's `state.changed` is visible through
the client; `client.updateState` writes state a waiting agent reads via `ctx.state` after resume;
`startRun({ state })` seeds the run before the agent's first read; AG-UI's `RunAgentInput.state`
seeds the run; AG-UI's client-default `state: {}` does not seed it.
