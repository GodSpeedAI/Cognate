# Why everything is a projection

**What is confirmed vs. inferred.** The invariant and its enforcement are confirmed. The
motivations are reconstructed from the schema, the tests, and the spec; treat them as strong
inference.

## The invariant

> No layer stores a copy of application state that the event log cannot regenerate.

Concretely:

- a run's status, output, and waiting set are a **fold** over its stream
  (`packages/runtime-bun/src/fold.ts`), not a row;
- the `runs` record holds ids and routing facts only;
- the client, React, and AG-UI derive everything from the event stream
  (`packages/client/src/index.ts:1-3`);
- the cognitive index is a retrieval aid whose `sourceRef` points back at the authority
  (`packages/cognitive-api/src/types.ts`);
- an RVF snapshot records the store position it was taken at, so "complete" is a claim that can be
  checked rather than assumed.

## Why this is worth the cost

### 1. Erasure becomes implementable

This is the strongest practical reason, and the schema shows it. Payloads live in a **separate
table** from event envelopes (`packages/store-sqlite/src/schema.ts`, migration 1). `erasePayload`
deletes the payload row and records a tombstone; the envelope's `event_id`, `position`,
`causation_id`, `correlation_id`, and timing all survive.

If application state were stored, erasing a person's data would mean finding and scrubbing every
copy — a moving target. Because every view is a fold, deleting the payload deletes the content
everywhere at once, and the remaining envelope still proves *that* something happened and *what
caused it*. That is exactly the shape the spec asks for (§32): keep causality, drop content.

The known gap is honest about the limit: continuation records, idempotency result snapshots, and
`run.recall` results recorded into later runs still hold copies (DEBT-014). Those are copies the
fold does not own, and the debt register names them.

### 2. Rebuild is a feature, not a recovery script

`Runtime.rebuildCognition()` clears the index and replays the `runtime.cognition` projection from
position 0. `ProjectionRunner.rebuild()` does the same for any projection. Neither is a special
tool; both are the ordinary path, because there is no other path.

A projection that crashes commits the successful prefix and records the error **at the failing
event**, so a rebuild knows where to resume and a reader can see exactly where a projection
stopped being correct.

### 3. Multi-tenancy falls out of the fold

`readProjection` filters by the `<tenant>/` key prefix; `eventStream` filters by `event.tenant`;
`readRun` returns `not_found` for another tenant's run; `recall`'s resolver returns `denied` for a
run whose tenant does not match. None of these needed a separate authorization subsystem for
*reads*, because the read path never had authority in the first place.

### 4. Several surfaces are nearly free

Adding a surface means writing a new fold. The AG-UI projector, the client's `RunStore`, the
harness `session()` view, and the E2E verifier are four different folds over the same events, with
no shared "view model" to keep in sync. Acceptance criterion H (AG-UI can be removed) and the
independence of the E2E verifier from the UI both follow from this.

## What it costs

| Cost | Where it shows |
|---|---|
| reads are `O(history)` until a projection checkpoint exists | `ProjectionRunner` exists precisely to bound this |
| you cannot ask "what is the current order" without a projection | public projections exist for exactly this, keyed `<tenant>/<key>` |
| every consumer must reimplement a fold, and they can disagree | the risk is real; the mitigations are the *shared* `foldState`/`applyStateUpdate` in `runtime-api` and the conformance kits |
| a schema change to a view is a rebuild, not a migration | versioned checkpoints return `rebuild_required` |

The third row is the most interesting. `RunState` (client) and `RunView` (service) *are*
independent folds, and they could drift. The codebase's answer is to put the semantics that must
agree in one place: `applyStateUpdate`/`foldState` live in `runtime-api`, not in the client, and
the client's `AGENTS.md` states the rule that exposed state must always be derivable.

## The boundary the design refuses to cross

Projection applies to *state*, not to *identity*. The event log's `semanticRef` column pins a
DomainForge object to a source digest, so a `.sea` rename mints a new identity rather than
silently reinterpreting the old one (`CG-SEM-002`). And a durable fact is never a projection:
`UPDATE` and `DELETE` on the events table raise in SQLite, so even raw SQL cannot turn history into
a view.

## Tests that hold the line

| Property | Test |
|---|---|
| deterministic projections replay to equivalent state | `tests/properties/replay.property.test.ts` |
| deleting the cognitive index cannot change authorization outcomes | `tests/properties/kernel.property.test.ts`, `CG-COG-004` |
| erasure leaves a redacted gap, not reconstructed data | `tests/integration/erasure.test.ts` |
| a projection crash does not corrupt history | `tests/integration/rebuild.test.ts` |
| authoritative state is verified from the SQLite file, not the UI | `tests/e2e/verify.ts` |

## Source trail

- `packages/store-sqlite/src/schema.ts` — payload separation and the append-only triggers.
- `packages/runtime-bun/src/fold.ts`, `packages/runtime-api/src/state.ts` — the shared folds.
- `packages/client/src/index.ts` — a client that caches only what it can rebuild.
- `packages/cognitive-api/src/types.ts` — `sourceRef` as the route back to truth.
- `packages/cognitive-rvf/src/index.ts` — the checkpoint/partial discipline.
- `packages/artifacts/src/index.ts` — content-addressed bytes with a record; the one place content
  legitimately lives outside the event payload.
- `tests/properties/replay.property.test.ts`, `tests/integration/erasure.test.ts`.
- spec §3.5, §10, §11, §13.3, §32.

## Related

- [why-replay.md](why-replay.md) — the same principle inside the executor.
- [authority-and-learning.md](authority-and-learning.md) — the other half: what may *not* be
  derived.
- [../subsystems/durable-state.md](../subsystems/durable-state.md) — the mechanism.
