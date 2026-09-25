# Subsystem: capabilities, cognition, and external adapters

The systems that sit *beside* the kernel: the selection model, the cognitive layer, and the
adapters that bind framework contracts to engines and external services.

This page owns the *mechanism* — what the code does and where. The plane-level narrative, the
compatibility notes, and the "why" live in [../cognition.md](../cognition.md),
[../rvf.md](../rvf.md), [../semantics.md](../semantics.md), and [../evidence.md](../evidence.md);
link to those rather than expecting the whole story here.

## Purpose

Provide the replaceable pieces the kernel and runtime depend on — a provider-selection model with
a contained learning phase, a rebuildable retrieval layer, and one adapter per external engine or
service.

## Responsibilities

- Two-phase selection: deterministic eligibility, then contained adaptive ranking
  (`packages/capabilities`).
- The model-provider shape and contract helper both providers implement.
- The `CognitiveIndex` contract, the retrieval pipeline, the indexing projection, and the
  conformance kit (`packages/cognitive-api`), plus three implementations.
- The adapter packages: `kernel-cordis`, `domainforge`, `cognitive-ruvector`, `cognitive-rvf`,
  `realitytrace`, `protocol-connect(+bun)`, `ag-ui`, `mcp`, `a2a`.

## Non-responsibilities

- It does not authorize. A ranker narrows an already-eligible set; policy decides.
- It does not store truth. A cognitive entry is a route back to a source, never the record.
- It does not decide what an external protocol *means*. Adapters map a stable internal contract
  onto a protocol's shapes.
- It does not add kernel primitives. If an adapter needs one, the design is wrong.

## Position in the system

`capabilities` depends on `events`, `kernel-api`, and `projections`. `cognitive-api` has the same
three. The three cognitive implementations depend only on `cognitive-api` (plus `@ruvector/*`).
The wire adapters depend on `runtime-api` and `events` (and `proto` for Connect); `ag-ui` also
depends on `client`.

## Core abstractions

### Selection

- **`Candidate`** — `{ providerId, contract, … }`.
- **`EligibilityRule`** — `evaluate(candidate, request): { eligible, reason }`.
- **`Ranker`** — `rank(eligible, request): Promise<{ providerId, score }[]>`.
- **`SelectionDecision`** — the eligible set, the ordered result, and every `(provider, rule)`
  explanation, recorded as `capability.selected`.
- **`Outcome`** — recorded as `capability.outcome`; `outcomeProjection()` counts successes and
  totals per `(capability, provider)`; `createOutcomeRanker(store)` turns that into UCB1.
- **`ModelProvider`** — `generate`/`stream` returning `ModelResponse` or `ModelDelta`
  (`text | tool_call | done`), with `ModelFeatures` flags `generate`, `stream`, `tool_use`,
  `structured_output`, `multimodal_input`, `context_limit`. `modelContract(provider)` derives the
  `CapabilityContract`, so a model is a capability like any other.

### Cognition

- **`CognitiveEntry`** — id, `sourceType`, `sourceRef`, tenant/scope, optional `semanticRef`,
  `eventRef`, `traceRef`, `embedding`, non-sensitive `metadata`, `relationships`, `validFrom`/
  `validTo`, `indexerVersion`, `durable`.
- **`CognitiveIndex`** — `flags` (an honest set: `vector_search`, `graph_traversal`,
  `temporal_search`, `causal_search`, `adaptive_ranking`, `snapshot`, `branch`, `witness`),
  `dimension`, `upsert`, `remove`, `similar`, `get`, optional `related`, `count`, `clear`,
  `close`.
- **`Embedder`**, **`SourceResolver`** — the latter returning `ok | denied | missing`, which is how
  a restricted object never leaks its existence.
- **`createRecall`** — embed → `similar` (tenant/scope pre-filter) → provenance post-filter →
  authorized fetch. Degrades to `{ status: "degraded" }`, or throws `CognitionUnavailableError`
  when `required: true`.
- **`cognitiveIndexer`** — a `Projection` that embeds extracted documents and removes entries
  whose source event was erased.

## Internal operation

`createSelector(options).select(request)` runs every rule against every candidate, records every
`(provider, rule)` result, and only then hands the eligible set to the ranker. Entries that are
unknown, ineligible, duplicated, or non-finite are dropped; a missing or throwing ranker falls back
to `providerId` order. `recordSelection` and `recordOutcome` make both facts durable.

`createOutcomeRanker` implements `successRate + sqrt(2 ln N / n)`, untried providers first, ties in
provider-id order. The exploration term is why an early failure is retried. Feedback changes
ranking only after it is committed and projected (`CG-COG-006`).

The RuVector adapter deliberately over-fetches: RuVector's own `filter` option does not filter, so
`similar` grows `k` and filters by tenant/scope locally. Correctness over speed; another tenant's id
is never disclosed. RVF compensates for four upstream gaps (no integrity check on `open`, no
metadata, string ids in a sidecar, no byte export) with a Cognate-owned sha256 manifest verified
before any file is opened. Details in [cognition.md](../cognition.md) and [rvf.md](../rvf.md).

## State

| Where | What | Mutability |
|---|---|---|
| `capability.selected` / `capability.outcome` events | the learning record | append-only; the feedback input |
| projection `capability.outcomes` | per-`(capability, provider)` counters | checkpointed, rebuildable |
| cognitive index (memory / RuVector / RVF) | embeddings and metadata | derived; `clear()` then rebuild |
| RVF `.rvf` + `.entries.json` + `.manifest.json` | portable snapshot | files; integrity manifest is Cognate-owned |
| `rvf_snapshots` records | lineage, checkpoint, digest | CAS-versioned |

## Lifecycle

Selection is per-invocation and stateless. The indexer's projection is started by
`runtime-bun`; a non-`persistent` index is cleared and rebuilt at startup so its checkpoint never
claims entries it lost. An RVF snapshot either reaches the store head, records an explicit partial
checkpoint, or fails — it never labels a mixed-time image complete. An import is `attached`,
`detached` (with a reason), or `rejected`; only `attached` may affect authorization or provider
selection.

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| recall returns `degraded` | index or embedder failure, or no cognition configured | non-fatal; `CognitionUnavailableError` only when `required: true` |
| a result is silently missing | a denied or missing source dropped in the recall pipeline | expected; check the resolver's tenant check |
| ranking ignores new outcomes | the feedback projection is behind | it must be committed and projected first |
| RVF `open` serves stale data | DEBT-006: 0.3.4 does not verify on open | the adapter's manifest check rejects it before opening |
| RVF import refuses | foreign lineage, checkpoint beyond head, digest mismatch, over a resource limit, disallowed tenant | `rejected` with a reason; nothing is opened |
| `FsyncFailed` | upstream RVF under concurrent I/O | DEBT-018 |
| a provider's `metadata` did not round-trip | RuVector stores metadata as a JSON string | DEBT-007 |
| MCP tool call returns `isError` | a `ServiceError` from the authorized path | fix the capability or the policy |
| A2A first `SendMessage` returns `TASK_STATE_INPUT_REQUIRED` | the agent opened a continuation | expected; send the follow-up with the same `taskId` |
| a resume race in A2A | the run was `waiting` on a just-resolved continuation | handled; the adapter re-reads |

## Extension points

- **A new capability provider** — implement the contract, publish it from `activate`. The
  canonical example.
- **A new model provider** — implement `ModelProvider`; `modelContract` gives you the contract and
  `providerComponent`-style wrapping gives you the component.
- **A new `CognitiveIndex`** — pass `cognitive-api/conformance` unchanged.
- **A new selector strategy** — supply an `EligibilityRule` set and/or a `Ranker`. Neither can
  widen the other's result.
- **A new protocol adapter** — implement against `RuntimeService` and the generated schema; see
  [how-to/add-a-protocol-adapter.md](../how-to/add-a-protocol-adapter.md).

Not extension points: the `CognitiveEntry` shape, `sourceRef` semantics, the RVF manifest format,
or the AG-UI compatibility matrix (a matrix row is a statement about a protocol, not a knob).

## Source trail

- `packages/capabilities/src/types.ts`, `selector.ts`, `model.ts`.
- `packages/capabilities/test/{selection,feedback,adaptive-ranker}.test.ts`.
- `tests/properties/containment.property.test.ts` — adaptive containment.
- `packages/cognitive-api/src/{types,recall,indexer,conformance}.ts`.
- `packages/cognitive-memory/`, `packages/cognitive-ruvector/`, `packages/cognitive-rvf/`.
- `packages/cognitive-rvf/src/index.ts` — `RvfManifest`, `SnapshotOptions`, `ImportOptions`.
- `packages/runtime-bun/src/cognition.ts` — the projection and the authorized resolver.
- `packages/provider-local/src/index.ts`, `packages/provider-openai-compatible/src/index.ts`.
- `packages/ag-ui/src/index.ts` — the 31-row matrix.
- `packages/mcp/src/index.ts`, `packages/a2a/src/index.ts`.
- [../cognition.md](../cognition.md), [../rvf.md](../rvf.md), [../protocols.md](../protocols.md),
  [../evidence.md](../evidence.md) — the canonical pages for these adapters.
- [decisions/ADR-0004](../decisions/ADR-0004-cognition-ruvector.md),
  [ADR-0005](../decisions/ADR-0005-adaptive-ranking-sona.md),
  [ADR-0006](../decisions/ADR-0006-portable-cognition-rvf.md),
  [ADR-0007](../decisions/ADR-0007-observations-realitytrace.md),
  [ADR-0008](../decisions/ADR-0008-ag-ui.md),
  [ADR-0010](../decisions/ADR-0010-mcp.md).

## Related

- [../explanation/authority-and-learning.md](../explanation/authority-and-learning.md) — why
  ranking sits where it does.
- [../extensions.md](../extensions.md) — the extension surface in one page.
- [../architecture.md](../architecture.md) — the adapter ownership rules.
