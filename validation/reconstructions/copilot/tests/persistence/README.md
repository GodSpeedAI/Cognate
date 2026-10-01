# CopilotKit reconstruction — persistence suites (prompt Phases 12 + 14)

Durable-state evidence for the reconstruction: settlement evidence survives restart and is
rebuildable from the event stream alone; cognition is never an authority. The suites drive the
reconstruction's own runtime composition (`cognate/src/remaining-journeys.ts`,
`cognate/src/journey.ts`, `cognate/src/shared-state.ts`) at the `RuntimeService` level — the same
settlement surface the journey tests assert against — on `mkdtempSync` temp homes only. No
reference stack, no ports, no Playwright, no DOM.

## Gate command

```sh
cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/persistence/
```

Green standalone from cold start (observed: 5 pass, 0 fail, 166 `expect()` calls, ~1.3 s).
A missing fixture is an unmet gate, never a passing skip.

## Suites

- **`restart.test.ts` — restart survival.** Representative journeys (a chat turn via the J-K
  agent, a rich thread with a mounted remote offer, agent- and caller-side shared-state writes,
  controlled rendering, declarative A2UI with a resolved interaction, a HITL tool decision, and
  runtime interrupts resolved by cancel/resume/left-open) run on one runtime; a NEW runtime is
  opened on the SAME home and the suite proves: the full event log is an exact prefix (positions
  intact, never regressing), all four public projections fold to serialization-identical rows,
  runs/continuations/thread shared state survive with identical states, the revoked offer needs
  no reauthorization, the OPEN interrupt is resumable from the reopened runtime, and new
  settlement appends strictly beyond pre-restart positions. A second test SIGKILLs a child
  process that holds a durably waiting interrupt (no close), then proves the store passes
  `PRAGMA integrity_check`, the wait and its continuation survive, and the new process resumes
  the run to completion — the storage layer's WAL + `synchronous = FULL` crash semantics
  (also proven by root `tests/integration/crash.test.ts`) applied to the reconstruction.
- **`rebuild.test.ts` — rebuild from events.** After the same representative journeys, every
  derived row (`projection_state` and `projection_checkpoints`, the only derived tables the
  runtime's SQLite store owns) is deleted wholesale with raw SQL while the runtime is closed,
  exactly as root `tests/integration/rebuild.test.ts` models operator loss. A new runtime folds
  the durable event stream from position 0; the rebuilt raw TEXT rows and checkpoints compare
  byte-for-byte to the pre-delete dump, the authoritative event log is untouched, and twin
  journeys replay identically.
- **`cognition.test.ts` — cognitive non-authority (Phase 14).** The reconstruction as built
  wires NO cognition: neither `createRemainingJourneysApp`, `createJourneyAApp`, nor
  `server.ts` passes a `cognition` option to `createRuntime`, so no RuVector index exists to
  delete and recall is a degraded no-op. The first test proves that as-built case explicitly
  (identical deterministic behavior, identical authorization decisions, tenant isolation, and
  intact threads/events across restart with no cognitive index ever present). The second test
  proves the general Phase 14 sequence at the level the reconstruction actually uses — the same
  `createRuntime` composition with the reconstruction's own agents and projections plus a real
  RuVector index (`createRuVectorIndex`, `persistent: false` as the adapter contract requires):
  delete the RuVector index → restart → deterministic behavior correct, authorization decisions
  identical (same denial reason for a denied principal, same capability allow/deny), threads and
  events intact → cognition rebuilt from the durable event stream → retrieval returns the same
  sources → mid-flight index destruction leaves behavior/authorization/evidence unchanged with
  retrieval gone → `rebuildCognition()` restores retrieval.

## Scope and limitations

- Derived state for this reconstruction = the two projection tables (no cognitive index is wired
  as built; the cognitive projection checkpoint, `runtime.cognition`, is exercised in the
  cognition suite's general case). Runs, continuations, shared state, and the event streams are
  durable, not derived, and are asserted to survive the deletion untouched.
- Kill-without-close IS supported by the storage layer (WAL + `synchronous = FULL`) and is
  proven by the second `restart.test.ts` test; no limitation is recorded.
- The suites never use port 4010 or any port, never boot the reference stack, and never write
  outside `mkdtempSync` temp directories.
