# Plan — cybernetic navigation proof (one revisable route)

Spec: [../specs/cybernetic-navigation-proof.md](../specs/cybernetic-navigation-proof.md). Branch `cognate/harness`.
All new code is local to the harness under `src/cognitive/` (pure modules first), promoted to core
only on the evidence rule in the spec.

## T0 — Green baseline (done)
Finished the in-flight Remote Workspaces migration (tools via `filesystem.*`/`process.exec`, local
world registered, `workspace.root`/`executionWorldId`); harness typecheck clean, 39/39 journeys pass
with `@copilotkit/aimock`. Left uncommitted for the operator per decision.

## T1 — Pure semantics (deterministic unit tests, no UI)
`canonical.ts` (canonical JSON + SHA-256), `world.ts` (manifest, hash, lineage fold over events),
`criterion.ts` (criterionHash, coverage), `mediation.ts` (host, tiers, next/beneath/origin/trace),
`sentinel.ts` (+ UserToyMod test mediator), `surface.ts` (closed grammar validator),
`affordance.ts`, `case.ts` (CaseProjection, settlement), `experiment.ts` (rounds, search eligibility),
`method.ts` (recommendation, authority boundary).

## T2 — Durable wiring
Event types `world.*`, `criterion.frozen`, `experiment.round`, `method.*`, `sentinel.finding`;
projection `cognitive` rebuilt from events; capabilities `world.freeze`, `world.settle`,
`surface.compose`; Reality projection from events only. Fork seam over `@cognate/execution`
(memory/local provider; CubeSandbox recorded as absent -> DEBT).

## T3 — Journeys
Fixture journey (cleanup/rebuild) and bounded-search + method-review journeys against aimock.

## T4 — Console
CognitiveFrame in the conditional right region; browser acceptance.

## T4b — Shared attention (U2)
Pure `cognitive/focus.ts` (FocusContext, semantic refs, neighbourhood derivation, per-kind tool
exposure, authority-preserving `invoke`) with unit tests; Console adapter registers WebMCP tools
from the focused Surface and renders agent-requested Surfaces; E2E "why did this fail?" journey.

## T5 — Docs, debt, verification, commit
Docs (README/BINDINGS/DEVIATIONS), core-promotion candidates, `just verify`, `just gates`, commit
only this tranche's hunks.

Deviations are appended below as they occur.

## Deviations
- 2026-10-03: T0 added because the target harness did not typecheck (uncommitted remote-workspaces work).
