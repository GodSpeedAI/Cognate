# Workflow: application startup and the background loop

Everything that happens between "the process starts" and "the first request is served", plus the
loop that keeps runs moving for the process's whole life.

## Summary

A Cognate application is one Bun process. Startup composes a store, a kernel, the services that
build on them, the projection runners, and a polling loop; then it serves HTTP over a single
`Bun.serve`. The loop is the only thing that advances durable work: run execution, continuation
resumption, and continuation expiry all happen because it ticks.

## Sequence

1. Read `cognate.config.ts` from the app directory (dynamic `import()` of a file URL).
2. Parse every `domain/*.sea` through the DomainForge adapter; combine the per-file digests into
   one application digest.
3. Open the SQLite store at `.cognate/app.sqlite`; run pending schema migrations in one transaction.
4. `createRuntime(...)`:
   a. create the `Invoker` and the Cordis kernel (single-tenant: `tenant: "runtime"`);
   b. mount the profile's components and wait (up to 10 s each) for `ACTIVE`;
   c. construct `ContinuationService` and `ArtifactService` over the store;
   d. register the `run.resume@1` resume handler;
   e. build the `run.execute` `OutboxDispatcher`;
   f. construct `ProjectionRunner`s for user projections and, if cognition is configured, for
      `runtime.cognition` — clearing and rebuilding first when the index is not `persistent`;
   g. **recover**: scan the `runs` records and re-queue any run that was `running` at shutdown or
      whose wait closed, including a RESUMED wait whose delivery was acknowledged before the run
      persisted its resume event;
   h. start `setInterval(kick, tickMs ?? 10)` and kick once.
5. Bind the Connect service on an internal `Bun.serve` (port 0).
6. For the copilot profile, bundle the browser entry with `Bun.build` and read the Astryx
   stylesheet paths.
7. Bind the outer `Bun.serve` and print `listening on http://127.0.0.1:<port>`.

## Detailed path

| Step | Where |
|---|---|
| config load, `.sea` parse, digest | `packages/cli/src/index.ts:191-209` |
| store open + migrations | `packages/store-sqlite/src/index.ts` (`openSqliteStore`), `packages/store-sqlite/src/schema.ts` (`migrate`) |
| runtime composition | `packages/runtime-bun/src/runtime.ts:21-136` |
| component mount | `packages/runtime-bun/src/invoker.ts:45-53` |
| projection setup + non-persistent rebuild | `packages/runtime-bun/src/runtime.ts:107-122` |
| crash recovery scan | `packages/runtime-bun/src/runtime.ts:124-133` |
| HTTP surface | `packages/cli/src/index.ts:262-284` |
| internal Connect server | `packages/protocol-connect-bun/src/index.ts:53` |

## The background loop

`kick()` coalesces: if a tick is already running it sets a flag and returns, so overlapping kicks
never stack. One `tick()` prepares recovery and starts bounded deliveries:

```text
1. continuations.expireDue()       → mark runs whose wait expired
2. persistRecoveryIntents()        → reuse pending run.execute work or persist a recovery intent
3. dispatch run.execute and continuation.resume with shared admission capacity
```

The two delivery topics alternate priority. Recovery uses the same durable dispatcher retry/backoff
as new runs, retaining an existing pending intent's retry time instead of bypassing it.

`execute(runId)` serializes per run through a promise chain, so two kicks cannot execute the same
run concurrently. It calls `executeOnce` up to 5 times, because one attempt may end in
`ConcurrencyError` (see [run-execution.md](run-execution.md)).

`idle()` polls until two consecutive `quiescent()` observations agree, where quiescent means: no
tick in flight, no queued or executing run, no outbox item that is available now or has never
errored, and no projection lagging its checkpoint. It exists for tests and graceful shutdown, not
for request handling.

`close()` stops new admission and aborts cooperative active execution and pending eligibility
lookups. It leaves durable objectives and open continuations recoverable. It then drains tracked
delivery/execution paths before stopping projections and shutting down the kernel and owned store.
Signal-ignoring handlers can still block shutdown; interrupted provider calls may be repeated on
recovery. Native commitments and reconciliation remain necessary for ambiguous external effects.
See [bounded execution](../runtime-concurrency.md) for admission and cancellation details.

## State changes during startup

- `schema_versions` gains a row per applied migration.
- Projection checkpoints are read; a version mismatch triggers `rebuild()`.
- A non-`persistent` cognitive index is cleared, then its projection is rebuilt from position 0.
- The `runs` collection is read (not written).

## Failure branches

| Situation | Behavior | Where |
|---|---|---|
| `cognate.config.ts` missing | `cognate dev: no cognate.config.ts in <dir>`, exit 1 | `cli/src/bin.ts:52` |
| a `.sea` file fails to parse | throws with the typed `SemanticError` JSON; the app does not start | `cli/src/index.ts:205` |
| a component never reaches `ACTIVE` | the failure is swallowed so the rest of the app still starts; its capabilities are simply unavailable | `invoker.ts:52` |
| a projection version changed | `rebuild()` from position 0 | `runtime.ts:120` |
| `Bun.build` fails (copilot UI) | throws with the build logs; no server starts | `cli/src/index.ts:256` |
| a `tick()` throws | swallowed (`.catch(() => {})`); the loop keeps running, and the failing work is retried on the next kick | `runtime.ts:99` |

## Sequence diagram

```mermaid
sequenceDiagram
    participant U as Bun process
    participant CLI as cognate dev
    participant DF as domainforge adapter
    participant S as store-sqlite
    participant RT as runtime-bun
    participant K as kernel-cordis
    participant H as Bun.serve

    CLI->>CLI: import cognate.config.ts
    CLI->>DF: loadSemanticProjection(each domain/*.sea)
    DF-->>CLI: SemanticProjection { objects, source.digest }
    CLI->>S: openSqliteStore(.cognate/app.sqlite)
    S->>S: migrate() in one transaction
    CLI->>RT: createRuntime({ store, policy, actions, agents, components, projections, cognition })
    RT->>K: createCordisKernel + mount(components)
    K-->>RT: ComponentHandle[] (ACTIVE or failed)
    RT->>RT: ProjectionRunner.catchUp() / rebuild() / start()
    RT->>S: listRecords("runs") → re-queue unfinished runs
    RT->>RT: setInterval(kick, 10ms); kick()
    CLI->>H: Bun.serve({ /health, /cognate.v1.RuntimeService/*, /agui, / })
```

## Shutdown

`Runtime.close()` clears the interval, awaits the in-flight tick and all execution chains, stops
every `ProjectionRunner`, unregisters the resume handler, shuts the kernel down (which disposes
fibers and unwinds their effects), and closes the store **only if the runtime opened it** — a
store passed in by the caller is the caller's to close. `cognate dev`'s `stop()` additionally stops
both HTTP servers and closes the profile app.

## Source trail

- `packages/cli/src/index.ts` — `dev()`, the whole HTTP surface.
- `packages/cli/src/bin.ts` — argument parsing and the two commands.
- `packages/runtime-bun/src/runtime.ts` — `startRuntime`, `tick`, `kick`, `quiescent`, `close`.
- `packages/runtime-bun/src/invoker.ts` — `attach`, component mount, failure tolerance.
- `packages/store-sqlite/src/schema.ts` — `migrate`, `MIGRATIONS`.
- `packages/protocol-connect-bun/src/index.ts` — `serveRuntime`, `devTokenAuthenticator`.
- `tests/integration/cli-create.test.ts` — proves generate → install → test → `bun dev` → restart
  for both profiles.
- `tests/integration/crash.test.ts` — recovery behavior.

## Related

- [run-execution.md](run-execution.md) — what a tick actually executes.
- [continuation-and-resume.md](continuation-and-resume.md) — expiry and resume delivery.
- [reference/commands-and-configuration.md](../reference/commands-and-configuration.md) — flags,
  env vars, and the routes `cognate dev` serves.
