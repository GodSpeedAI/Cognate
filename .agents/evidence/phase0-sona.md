# Phase 0 SONA compatibility evidence — 2026-09-24

Environment observed: Bun 1.4.0, linux x86_64. Fixture lives at
`compatibility/phase0/sona/` (its own `package.json`, own `bun install`,
own lockfile — not part of the root dependency graph).

Package under test: `@ruvector/sona@0.1.8` (only published SONA package;
no umbrella/narrower alternative exists — the `ruvector@0.3.3` umbrella
package's description lists `sona`/`lora`/`ewc` as keywords, but the
dedicated `@ruvector/sona` scoped package is the narrower, purpose-built
option and is what this fixture pins). Platform binary resolved via
optionalDependencies: `@ruvector/sona-linux-x64-gnu@0.1.8` (version-consistent
with the parent package, unlike `@ruvector/core`'s platform pins).

Test file: `compatibility/phase0/sona/sona.test.ts`. Run with `bun test`
from that directory. Result at time of writing: **6 pass, 0 fail**
(`bun test v1.4.0`).

| Behaviour (spec item) | Result | Observed detail |
| --- | --- | --- |
| Load under Bun | PASS | `@ruvector/sona` native NAPI binding loads under Bun 1.4.0 via `await import(...)`; no fallback needed on this host. |
| (1) "ranks ONLY a supplied candidate set (never returns an outside id)" | **DISPROVEN** | `SonaEngine` has no `rank`, `rankCandidates`, `score`, `select`, or `choose` method — confirmed both by prototype introspection (full method list: `addTrajectoryContext, addTrajectoryStep, applyBaseLora, applyMicroLora, beginTrajectory, endTrajectory, findPatterns, flush, forceLearn, getStats, isEnabled, setEnabled, setTrajectoryRoute, tick`) and by directly probing for `.rank`/`.rankCandidates`/`.score` (all `undefined`). `findPatterns()` — the only similarity-based lookup — returns auto-assigned internal cluster ids (`"0"`, `"1"`, ...) that structurally cannot match a caller-supplied candidate id, because the API has no parameter for supplying a candidate set at all. |
| (2) "feedback replayed from a durable record list reproduces the same ranking" | **Reframed and characterized** (no ranking exists to replay) | Since there is no ranking to replay, this fixture instead tests the closest verifiable analogue: replaying an identical durable trajectory record (embedding, activations, attention weights, reward, quality) into two independently constructed `SonaEngine` instances. Result: bit-identical learned pattern centroid, cluster size, and average quality (only wall-clock timestamps differed). Learning is deterministic given identical inputs; but this is *learning replay*, not *ranking replay* — no profile may cite this as proof of "feedback replay reproduces the same ranking." |
| (3) deterministic fallback when unavailable | PASS (application-level pattern demonstrated) | A forced import-failure branch falls back to a fixed, stable-sort ranking by a declared `priority` field. Because SONA cannot rank a supplied candidate set even when it *does* load successfully, the fixture demonstrates that the only correct architecture is: never let SONA sit on the eligibility -> selection path (§3.6); the deterministic ranker is the real selector regardless of SONA's availability. |

## Additional finding: README's documented API does not match the shipped binding

The README's Quick Start shows:
```ts
const builder = engine.beginTrajectory(queryEmbedding);
builder.addStep(activations, attentionWeights, 0.8);
```
implying `beginTrajectory` returns a `TrajectoryBuilder` object. The
installed `index.d.ts` and the actual native binding disagree: 
`beginTrajectory(queryEmbedding): number` returns a **numeric trajectory
id**, and the real call shape is
`engine.addTrajectoryStep(trajectoryId, activations, attentionWeights, reward)`.
Calling `.addStep()` on the numeric id, as the README instructs, throws
`TypeError: ... .addStep is not a function` (reproduced in the fixture).

## Conclusion

Per spec §17 (*"Phase 0 SHALL pin its package/API and prove that it can
rank only a supplied eligible candidate set, persist feedback as durable
input, and fall back to deterministic ordering when unavailable. Until
those fixtures pass, no profile claims SONA support"*): **behaviour (1)
does not pass** — `@ruvector/sona@0.1.8` has no candidate-ranking surface
of any kind. It is a trajectory/LoRA continual-learning engine
("ReasoningBank" pattern clustering), not a ranker. No Cognate reference
profile should declare `adaptive_ranking` capability backed by this
package as currently published. See ADR-0005 for the resulting decision.

Full method-by-method notes: `compatibility/phase0/sona/API_NOTES.md`.
