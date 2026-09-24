# @ruvector/sona API notes (Phase 0)

Package: `@ruvector/sona@0.1.8` (exact pin). Native NAPI-RS binding;
platform binary resolved via optionalDependencies
(`@ruvector/sona-linux-x64-gnu@0.1.8`, consistent version on this host,
unlike `@ruvector/core`'s skewed platform pins).

Verified under Bun 1.4.0, linux x64. `require()`-based CJS loader; imports
fine from Bun ESM via `await import("@ruvector/sona")`.

## HEADLINE FINDING

**SONA is not a ranker.** `SonaEngine`'s public API (verified against the
installed `.node` binary and `index.d.ts`, not just the README) has no
`rank`, `rankCandidates`, `score`, `select`, or `choose` method of any kind.
It is a continual-learning / LoRA-adaptation engine:

- Micro-LoRA (rank 1-2) instant adaptation
- Base-LoRA (rank 8+) background adaptation
- EWC++ catastrophic-forgetting regularization
- Trajectory recording + k-means-style pattern clustering ("ReasoningBank")

Per spec §17's own escape valve — *"If SONA's API doesn't fit (e.g.
trajectory/LoRA learner, not a ranker), record precisely"* — this fixture
records: **SONA 0.1.8 cannot satisfy the Framework's adaptive-ranking
contract (§3.6, §17: "eligible candidates -> cognitive/adaptive ranking ->
selection"). It has no method that accepts a caller-supplied candidate set
and returns a subset/permutation of it.**

## Import

```ts
import { SonaEngine } from "@ruvector/sona";
```

## Constructor

```ts
new SonaEngine(hiddenDim: number)
// or:
SonaEngine.withConfig({
  hiddenDim: number,            // required
  embeddingDim?: number,        // default: hiddenDim
  microLoraRank?: number,       // default: 1
  baseLoraRank?: number,        // default: 8
  microLoraLr?: number,         // default: 0.001
  baseLoraLr?: number,          // default: 0.0001
  ewcLambda?: number,           // default: 1000.0
  patternClusters?: number,     // default: 50
  trajectoryCapacity?: number,  // default: 10000
  backgroundIntervalMs?: number,// default: 3600000
  qualityThreshold?: number,    // default: 0.5
  enableSimd?: boolean,         // default: true
}): SonaEngine
```

## Methods (verified)

- `beginTrajectory(queryEmbedding: number[]): number` — returns a
  **numeric trajectory id**. **README deviation**: the README shows
  `const builder = engine.beginTrajectory(...); builder.addStep(...)`, i.e.
  a `TrajectoryBuilder` object. The shipped binding does NOT return a
  builder; calling `.addStep()` on the numeric return value throws
  `TypeError: ... .addStep is not a function`. The real call shape is:
  ```ts
  const tid = engine.beginTrajectory(embedding);
  engine.addTrajectoryStep(tid, activations, attentionWeights, reward);
  engine.setTrajectoryRoute(tid, "some-route-label");   // free-text string
  engine.addTrajectoryContext(tid, "some-context-id");  // free-text string
  engine.endTrajectory(tid, quality);                   // quality in [0,1]
  ```
- `applyMicroLora(input: number[]): number[]` — verified; with a freshly
  constructed engine (no learning yet) this is an identity/near-identity
  transform.
- `applyBaseLora(layerIdx: number, input: number[]): number[]` — not
  exercised.
- `tick(): string | null` — not exercised (time-gated background cycle).
- `forceLearn(): string` — verified; returns a human-readable status string
  like `"Forced learning: 1 trajectories -> 1 patterns, status: completed"`.
- `flush(): void` — not exercised.
- `findPatterns(queryEmbedding: number[], k: number): LearnedPattern[]` —
  verified. Returns patterns from the engine's **own internal cluster
  registry**, keyed by auto-assigned string ids (`"0"`, `"1"`, ...). These
  ids have no relationship to any externally supplied candidate/document/
  provider id — there is no parameter anywhere in the API for supplying a
  candidate set to be ranked or filtered.
- `getStats(): string` — verified; JSON string,
  e.g. `{"trajectories_recorded":1,"trajectories_buffered":1,"trajectories_dropped":0,"buffer_success_rate":1.0,"patterns_stored":0,"patterns_learned":0,"ewc_tasks":0,"instant_enabled":true,"background_enabled":true}`.
- `setEnabled(enabled: boolean): void`, `isEnabled(): boolean` — not
  exercised beyond a smoke check.

## Determinism

Replaying an identical durable trajectory record (embedding, activations,
attention weights, reward, quality) into two independently constructed
`SonaEngine` instances produced **bit-identical** learned pattern centroids,
cluster size, and average quality (timestamps `createdAt`/`lastAccessed`
naturally differ). This is a characterization of learning determinism, not
of ranking-replay, since no ranking exists to replay.

## Feedback persistence

SONA holds all trajectory/pattern state in-process memory; there is no
built-in persistence/reload API (no `save`/`load`/`storagePath` observed on
`SonaEngine`). Per spec §17 ("Outcome feedback used for adaptive ranking
SHALL be recorded as a durable fact before it changes future selection"),
an application wrapping SONA would need to persist trajectory
records itself (e.g. in the authoritative SQLite event store) and replay
them into a fresh `SonaEngine` on restart — this fixture's replay test
demonstrates that pattern is at least *reproducible*, but the Framework
cannot rely on SONA itself for durability.

## Fallback

No documented WASM fallback was evaluated (README claims "WASM and Node.js
support" but no separate WASM package name was found under `@ruvector/sona-*`
platform packages — all seven optionalDependencies are native `.node`
platform binaries: linux x64/musl/arm64, darwin x64/arm64,
win32 x64-msvc/arm64-msvc). The Phase 0 fixture demonstrates the
application-level fallback shape required regardless of SONA's fit: since
SONA cannot rank a supplied candidate set even when loaded successfully,
the Framework's actual "fallback" is to never treat SONA as the selector —
always keep a deterministic candidate ranker as the real selection
mechanism, with SONA (if present) used only as an advisory/observability
signal outside the eligibility -> selection path (§3.6).

## Conclusion for the Framework

Per §17's own conditional language ("Until those fixtures pass, no profile
claims SONA support"): **this Phase 0 fixture does not pass** behaviour (1)
(rank a supplied candidate set) because no such capability exists in
`@ruvector/sona@0.1.8`. No Cognate profile should declare `adaptive_ranking`
capability backed by this package as currently published. If adaptive
ranking is still desired, it must be built as an application-level
component that (a) uses SONA's trajectory/pattern outputs as one input
signal among others, and (b) performs the actual candidate-set-preserving
rank/select step in Framework-owned deterministic code.
