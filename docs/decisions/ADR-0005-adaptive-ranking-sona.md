# ADR-0005: SONA does not satisfy the adaptive-ranking contract (Phase 0)

- Status: Accepted — SONA rejected as an adaptive-ranking backend for v0
- Date: 2026-09-24
- Related: software-design-spec-cognate §3.6, §17, §31.3, §37, §38
- Evidence: `.agents/evidence/phase0-sona.md`
- Fixture: `compatibility/phase0/sona/` (`sona.test.ts`, `API_NOTES.md`)

## Context

Spec §17 treats SONA as "a candidate adaptive-ranking implementation, not a
verified Framework dependency," and directs Phase 0 to pin its
package/API and prove three things before any profile may claim SONA
support: (1) it can rank only a supplied eligible candidate set, (2)
feedback replayed from a durable record list reproduces the same ranking,
(3) it falls back to deterministic ordering when unavailable. §17 also
provides an explicit escape valve: *"If SONA's API doesn't fit (e.g.
trajectory/LoRA learner, not a ranker), record precisely."*

The only published SONA package is `@ruvector/sona` (pinned exact at
`0.1.8`); no narrower or umbrella alternative exists for this specific
capability.

## Decision

**SONA (`@ruvector/sona@0.1.8`) is rejected as a backend for the
Framework's adaptive-ranking contract in v0.** No Cognate reference profile
may declare an `adaptive_ranking` capability flag (§14) backed by this
package as currently published.

## Rationale

Empirical testing under Bun 1.4.0 (fixture: `compatibility/phase0/sona/sona.test.ts`,
6/6 assertions passing as characterizations, not as proof of fitness)
found:

1. **`SonaEngine` has no candidate-ranking method.** Its full public
   surface is `addTrajectoryContext, addTrajectoryStep, applyBaseLora,
   applyMicroLora, beginTrajectory, endTrajectory, findPatterns, flush,
   forceLearn, getStats, isEnabled, setEnabled, setTrajectoryRoute, tick`.
   There is no `rank`, `rankCandidates`, `score`, `select`, or `choose`
   method, and no parameter anywhere in the API for supplying an eligible
   candidate set. `findPatterns()` — the only similarity-based lookup —
   returns the engine's own auto-assigned internal cluster ids, which
   structurally cannot correspond to a caller's candidate ids.
2. Behaviour (1) required by Phase 0 ("ranks ONLY a supplied candidate
   set") is therefore **not just unproven — it is inapplicable**: there is
   no ranking operation to constrain in the first place.
3. Behaviour (2) ("feedback replayed ... reproduces the same ranking") was
   reframed as a *learning*-replay characterization (does replaying an
   identical trajectory record into a fresh engine reproduce the same
   learned pattern?) since there is no ranking to replay. Result: yes,
   bit-identical centroids/quality across two independent engines given
   identical inputs — but this proves learning determinism, not ranking
   replay, and must not be cited as satisfying §17's actual requirement.
4. Behaviour (3) (deterministic fallback) is trivially satisfiable — but
   only because the "fallback" and the "primary path" end up being the
   same thing: a deterministic, non-SONA ranker. SONA cannot occupy the
   position §3.6 requires ("eligible candidates -> cognitive/adaptive
   ranking -> selection") because it has no ranking operation to sit in
   that slot.
5. SONA's actual purpose — confirmed by its own README and by direct
   testing — is continual-learning / LoRA weight adaptation
   (`applyMicroLora`, `applyBaseLora`) plus trajectory clustering
   ("ReasoningBank" pattern extraction via `findPatterns`). This is a
   genuinely different capability than "rank a supplied candidate set,"
   matching the spec's own anticipated escape hatch precisely.
6. The published README is unreliable as an integration reference: its
   Quick Start shows `beginTrajectory()` returning a `TrajectoryBuilder`
   object with a `.addStep()` method; the shipped binding instead returns
   a plain numeric trajectory id, and following the README's example
   throws `TypeError: ... .addStep is not a function` (reproduced in the
   fixture). Any future re-evaluation of SONA must verify behavior against
   the installed `.node`/`.d.ts`, not the README.

## Consequences

- No `adaptive_ranking` capability flag may be advertised by any Cognate
  profile in v0, whether backed by SONA or otherwise, until a package that
  actually implements the "rank only a supplied candidate set" contract is
  found and passes its own Phase 0 fixture.
- Any component that wants adaptive-style selection SHOULD, if desired,
  treat SONA's trajectory/pattern outputs (`findPatterns`, `getStats`) as
  one *advisory* signal feeding into a Framework-owned deterministic
  ranker — never as the ranker itself, and never positioned inside the
  §3.6 eligibility -> selection pipeline in a way that could "skip policy
  check."
- §17's required evidence trail (candidate set, deterministic filters,
  scores, selected candidate, observed outcome) remains a Framework-owned
  responsibility regardless of whether SONA is present.
- This decision does not preclude re-evaluating a future SONA release, or
  another `ruvector` sub-package, if the published API is later extended
  with an actual candidate-ranking method — but any such re-evaluation
  requires its own Phase 0 fixture per §37, not an assumption of continuity
  with this ADR's findings.

## Alternatives considered

- **Wrap `findPatterns()` as a pseudo-ranker** (map candidate ids to
  synthetic embeddings, look up nearest learned patterns, use pattern
  `avgQuality` as a candidate score): rejected. This would require
  inventing a candidate-id-to-embedding mapping and a scoring convention
  that SONA itself does not define or guarantee stability for, effectively
  building a new adaptive-ranking system on top of SONA's clustering
  internals rather than using a verified SONA capability. Revisit only as
  a deliberate, separately-specified Framework component if adaptive
  ranking becomes a hard requirement — not as an implicit SONA adapter.
- **Do nothing (defer the decision)**: rejected; §17 explicitly requires
  Phase 0 to pin and prove or disprove SONA's fit before any profile may
  claim support, and the spec anticipates exactly this outcome via its
  "record precisely" escape valve.
