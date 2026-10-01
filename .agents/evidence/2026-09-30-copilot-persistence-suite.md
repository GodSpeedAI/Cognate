# CopilotKit reconstruction — persistence suite: restart / rebuild / cognitive non-authority — 2026-09-30

Environment: Bun 1.4.0 (Linux, WSL2). Scope: `validation/reconstructions/copilot/tests/persistence/`
(new: `support.ts`, `restart.test.ts`, `rebuild.test.ts`, `cognition.test.ts`, `README.md`) — plan R3
unit for prompt [Phase 12 — Protocol and State Evidence](../prompts/copilotkit-reconstruction-test.md)
and [Phase 14 — Cognitive Non-Authority Test](../prompts/copilotkit-reconstruction-test.md), supporting
settlement gates 16, 17, 29 and 30. All state lives under `mkdtempSync(tmpdir())`; no repo paths, no
real home, no ports (nothing listens), no reference stack (4012/13361/8123/3000 stayed down), no
`npx aimock`/`npx llmock`, no Playwright, nothing committed. Existing reconstruction sources and tests
were read-only inputs; `.agents/CURRENT_STATUS.*`, `requirements/ledger.yaml`, `justfile`,
`scripts/harness.ts`, `deepseek-harness/**`, `packages/**`, root `tests/**` were not touched.

## Gate command and observed outcome

`cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/persistence/`
(documented in `tests/persistence/README.md`). Per the re-run rule, both full-suite runs are reported:

| Run | Exit | Observed result |
| --- | --- | --- |
| 1 (cold start) | 0 | 5 pass, 0 fail, 166 `expect()` calls, 1.31 s across 3 files. |
| 2 (immediate re-run) | 0 | 5 pass, 0 fail, 166 `expect()` calls, 1.19 s across 3 files. |

Final observed output tail:

```text
tests/persistence/cognition.test.ts:
(pass) the as-built reconstruction runs identically across restart with no cognitive index ever wired [81.17ms]
(pass) deleting the RuVector index changes no behavior or authorization; cognition rebuilds from events [256.66ms]

tests/persistence/rebuild.test.ts:
(pass) deleting every derived row rebuilds byte-identical folds from the durable event stream alone [240.87ms]

tests/persistence/restart.test.ts:
(pass) reconstruction settlement survives a clean restart on the same home [367.67ms]
(pass) a process killed without close leaves durable settlement intact and resumable [145.60ms]

 5 pass
 0 fail
 166 expect() calls
Ran 5 tests across 3 files. [1202.00ms]
```

Regression: the reconstruction journey suite stayed green throughout diagnosis
(`cd validation/reconstructions/copilot/cognate && bun test test` → 11 pass, 0 fail, 196
`expect()` calls), so the suite asserts contracts the current tree actually exhibits.

## Diagnosis history (failures observed and fixed, per the re-run rule)

1. `fileURLToPath` imported from `node:path` (SyntaxError) — moved to `node:url`.
2. HITL/tool and remote-offer continuations stalled at `waiting`: at the service level the
   frontend-capability wait must be resumed with `{ ok: true, value }` (the shape
   `packages/client/src/index.ts` wraps handler results in), and the mounted remote offer's
   invocation is settled by the offering party the same way — fixed in both suites.
3. Reconstruction threads folded empty: `RuntimeService.startRun` takes `correlationId` inside
   the request; the third options argument is a `@cognate/client` wrapper concept — fixed.
4. `seedRefs` compared raw run ids against `run:<id>` source refs — fixed with prefix slicing.
5. Recall probe raced the live cognitive indexer — `runtime.idle()` after seeding.

## What each suite proves and with which mechanism

- **Restart survival** (`restart.test.ts`, mechanism: clean close → new runtime on the same
  home; plus SIGKILL-without-close via a killed child process): threads and full message history
  survive (exact durable-log prefix, `rich-thread` fold identical), all four public projections
  fold to serialization-identical rows, runs and continuations survive with their states
  (RESUMED / CANCELLED / OPEN), thread shared state survives with the same version, a revoked
  remote offer is never reauthorized on replay, the OPEN interrupt resolves from the reopened
  runtime, and durable event positions never regress (strictly increasing; new settlement appends
  strictly beyond pre-restart positions). The kill-without-close case proves `PRAGMA
  integrity_check = ok`, the committed wait survives, and the new process resumes the run to
  completion — recorded as SUPPORTED, so no crash-recovery limitation is documented.
- **Rebuild from events** (`rebuild.test.ts`, mechanism: operator-style `DELETE FROM
  projection_state; DELETE FROM projection_checkpoints;` while closed → new runtime folds from
  position 0): rebuilt raw TEXT rows and checkpoints are byte-for-byte identical to the
  pre-delete dump, the authoritative event log is untouched, runs and shared state are intact,
  and twin journeys replay identically on the rebuilt runtime.
- **Cognitive non-authority** (`cognition.test.ts`, mechanism: index deletion + restart +
  `rebuildCognition()`): the reconstruction wires no cognition (source-verified: no `cognition`
  option in `remaining-journeys.ts`, `journey.ts`, or `server.ts`), so the as-built case is
  proven explicitly with no index ever present; the general Phase 14 sequence is proven at the
  same `createRuntime` composition level with a real RuVector index (`persistent: false` per the
  adapter contract): delete index → restart → deterministic behavior identical, authorization
  decisions identical (denied principal gets the same `permission_denied` reason; capability
  allow/deny identical), threads/events intact → rebuild → retrieval returns the same `run:<id>`
  sources → mid-flight index destruction changes nothing but retrieval → rebuild restores it.

## Deviations from the unit spec

- The "chat turn" journey is driven via `RuntimeService.startRun` on the J-K agent (the same
  agent the AG-UI surface drives) instead of an SSE POST — service-level settlement evidence is
  the unit's target; no DOM is involved anywhere.
- The remote-offer invocation (J-J) is settled by the offering party through
  `resolveContinuation` at the service level, mirroring what the connected client engine does
  automatically in the J-J journey test; the run's output and the settled continuation are
  asserted identically.
