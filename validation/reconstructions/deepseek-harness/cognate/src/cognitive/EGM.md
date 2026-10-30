# cognitive — pure cognitive-navigation modules

## Overview

The reasoning core of the cognitive-navigation proof: canonical hashing, criteria and observations,
world manifests and promotion, affordance resolution, mediation, focus, surfaces, experiment rounds,
and method acceptance. Every module is pure or explicitly ephemeral — nothing keeps its own store,
because the Case, Reality, and lineage are folds of the event log `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/case.ts:deriveCase]`.

## Interface

- `canonicalize`, `hashOf`, `sha256`, `shortHash` — versioned canonical JSON and SHA-256 identity `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/canonical.ts:hashOf]`
- `freezeCriterion`, `criterionIntact`, `reviseCriterion`, `observe`, `Observation` — criterion freezing and observation `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/criterion.ts:observe]`
- `worldManifest`, `worldHash`, `foldLineage`, `checkPromotion`, `diffManifests` — world lineage and settlement `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/world.ts:checkPromotion]`
- `deriveCase`, `reality`, `realityOfCheck`, `CaseProjection`, `CASE_EVENTS` — the derived Case and Reality `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/case.ts:deriveCase]`
- `resolveAffordances`, `capabilityNeighborhood`, `AffordanceField`, `PossibleOperation` — what is reachable now versus blocked `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/affordance.ts:resolveAffordances]`
- `sentinel`, `userToyMod`, `InvariantId` — the governance mediator comparing against the trusted subchain `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/sentinel.ts:sentinel]`
- `createMediationHost`, `MediatorSpec`, `TIER_RANK`, `Next` — the tier-ordered mediation chain `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/mediation.ts:TIER_RANK]`
- `liveVerify`, `LiveVerifyOptions` — debounced observer that speaks only on verdict change `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/liveverify.ts:liveVerify]`
- `createFocusStore`, `parseRef`, `surfaceFor`, `REF_KINDS` — ephemeral shared attention `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/focus.ts:createFocusStore]`
- `validateSurface`, `surfaceVisible`, `SurfaceError` — the closed surface grammar `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/surface.ts:validateSurface]`
- `judgeRound`, `foldSearch`, `searchEligibility`, `SearchState` — experiment judging and search folding `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/experiment.ts:judgeRound]`
- `acceptMethod`, `observerMayWrite` — human-only method promotion and the observer write guard `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/method.ts:acceptMethod]`
- `classifyDestructive`, `riskPreflight`, `composePreflight` — irreversible-operation preflight `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/preflight.ts:riskPreflight]`

## Invariants

- `canonicalize` sorts object keys, drops `undefined`, and throws on non-finite numbers or unsupported types, so equal content always serializes to equal bytes `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/canonical.ts:canonicalize]`
- A check result counts only when its `criterionHash` matches the frozen criterion; `settlementEstablished` additionally requires zero unobserved checks `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/criterion.ts:observe]`
- Criterion revision throws unless the authority kind is `user` `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/criterion.ts:reviseCriterion]`
- Promotion is refused for unknown or non-candidate worlds, rejected candidates, a stale parent, non-human authority, zero evidence, or unreachable settlement `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/world.ts:checkPromotion]`
- A candidate never replaces an existing world record with the same hash `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/world.ts:foldLineage]`
- The sentinel denies a non-human `continuation.resume` with `approved: true`, an undeclared mediator capability, a write to protected evidence, and an irreversible invoke without a preflight id; it restores a trusted `approvalRequired` or evidence read altered by lower-trust mediation, and does not guess when no shadow core exists `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/sentinel.ts:sentinel]`
- `liveVerify` stays silent on an unchanged verdict and on a first healthy observation; only failure or repair is surfaced `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/liveverify.ts:liveVerify]`
- Focus is in-memory only and rejects a value that is not a semantic ref; focus never confers authority `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/focus.ts:createFocusStore]`
- `observerMayWrite` refuses `AGENTS.md`, `.agents/specs/`, and any path matching `criterion` or `active-method` `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/method.ts:observerMayWrite]`

## Side Effects

- `sha256` hashes through `node:crypto`; no other module here writes anything `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/canonical.ts:sha256]`
- `liveVerify` schedules timers and registers a disposer for them `[validation/reconstructions/deepseek-harness/cognate/src/cognitive/liveverify.ts:liveVerify]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/cognitive-semantics.test.ts ./test/cognitive-focus.test.ts ./test/J-COG-attention.test.ts`
