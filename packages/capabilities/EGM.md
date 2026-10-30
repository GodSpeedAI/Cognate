# capabilities

## Overview

Two-phase capability selection: every `EligibilityRule` filters the candidate set first, then an optional `Ranker` orders only the eligible subset `[src/selector.ts:createSelector]`. Selection and outcome explanations are recorded as durable events, and the learned ranking is a rebuildable projection over those events rather than mutable state `[src/selector.ts:outcomeProjection]`. The entry point re-exports `./types.ts` as types plus selector, model, and judgment symbols `[src/index.ts:1]`. It depends on `@godspeedai/cognate-events`, `@godspeedai/cognate-kernel-api`, and `@godspeedai/cognate-projections` `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — selection, model-provider contract, judgment contract, and eligibility rules `[src/index.ts:1]`
- test/ — `selection.test.ts`, `feedback.test.ts`, `adaptive-ranker.test.ts` (not child contracts)
- No child `EGM.md` exists under this package.

## Global Invariants

- Unknown, duplicate, or non-finite ranker entries are discarded, so the selected provider is always eligible `[src/selector.ts:createSelector]`
- A ranker failure or absence falls back to lexicographic `providerId` order and records the reason in `fallback` `[src/selector.ts:createSelector]`
- Untried providers score `Number.MAX_VALUE` precisely so the finite-score filter accepts them `[src/selector.ts:createOutcomeRanker]`
- The outcome ranker reads only projection state (`readProjection`), so replaying the same outcomes yields the same ranking `[src/selector.ts:createOutcomeRanker]`
- `recordSelection` appends `capability.selected` with the full decision to stream `selection-<selectionId>` `[src/selector.ts:recordSelection]`
- A model contract is `model.generate` 1.0.0 whose attributes are the stripped features plus provider id and model `[src/model.ts:modelContract]`
- Model provider failures are typed by `ModelProviderError.kind` over a closed set of six kinds `[src/model.ts:ModelProviderError]`

## Global Side Effects

- Durable appends of `capability.selected` and `capability.outcome` through the injected `DurableStore` `[src/selector.ts:recordOutcome]`
- Clock reads (`new Date().toISOString()`) when stamping recorded events `[src/selector.ts:recordSelection]`
- `randomUUID` for selection ids unless `options.ids` overrides it `[src/selector.ts:createSelector]`

## Verification

- Run: `cd packages/capabilities && bun test`
