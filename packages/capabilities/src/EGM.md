# capabilities source

## Overview
Two-phase capability selection: deterministic eligibility filters run first, then a contained adaptive ranker orders only the eligible set (package description; [package.json:description]). Alongside selection it publishes the plain model-provider contract and a judgment-provider adapter, so no LLM SDK is required by the kernel or this package [src/model.ts:1].

## Interface
- `createSelector(options)` — returns `select(request)` producing a full `SelectionDecision` [src/selector.ts:createSelector]
- `compatibilityRule` — built-in eligibility rule over `isCompatible(requirement, contract)` [src/selector.ts:compatibilityRule]
- `recordSelection(store, decision, context)` and `recordOutcome(store, selectionId, outcome, context)` — durable explanations [src/selector.ts:recordSelection]
- `outcomeProjection()` and `createOutcomeRanker(store)` — the UCB1 ranker over recorded outcomes [src/selector.ts:createOutcomeRanker]
- `SelectorOptions`, `RecordContext` [src/selector.ts:SelectorOptions]
- `Candidate`, `SelectionRequest`, `EligibilityRule`, `Ranker`, `SelectionDecision`, `Outcome` [src/types.ts:SelectionDecision]
- `ModelProvider`, `ModelRequest`, `ModelResponse`, `ModelDelta`, `ModelMessage`, `ToolDefinition`, `ToolCall`, `ModelFeatures`, `ModelRole`, `ModelProviderError`, `modelContract(provider)` [src/model.ts:ModelProvider]
- `JudgmentProvider`, `JudgmentRequest`, `JudgmentResponse`, `JudgmentQuestion`, `JudgmentAnswer`, `judgmentContract`, `judgmentComponent` [src/judgment.ts:judgmentComponent]

## Invariants
- Every rule runs against every candidate and one veto excludes it; the ranker only ever sees the eligible set [src/selector.ts:createSelector]
- Unknown, duplicate, or non-finite ranker output is ignored, and a ranker throw falls back to lexicographic provider id with a recorded `fallback` reason [src/selector.ts:createSelector]
- The selected provider is always eligible; `selected` stays `null` when no candidate is eligible and the ranker is never called [src/selector.ts:createSelector]
- Eligibility rules must be pure; `context` is for rankers and is never used for eligibility [src/types.ts:EligibilityRule]
- Selection explanations are appended as `capability.selected` on `selection-<selectionId>` with the full decision payload [src/selector.ts:recordSelection]
- An outcome must be durable before it can influence ranking; `capability.outcome` lands on the same selection stream [src/selector.ts:recordOutcome]
- `modelContract` strips `generate` from the published attributes and never includes credentials [src/model.ts:modelContract]
- The outcome projection counts successes and totals per capability/provider; `createOutcomeRanker` scores untried providers `Number.MAX_VALUE` [src/selector.ts:outcomeProjection, src/selector.ts:createOutcomeRanker]

## Side Effects
- Durable commits through `DurableStore` with `new Date().toISOString()` timestamps [src/selector.ts:recordSelection]
- Projection reads for ranker statistics [src/selector.ts:createOutcomeRanker]
- Random selection ids unless `ids` is supplied [src/selector.ts:createSelector]

## Verification
- Run: `cd packages/capabilities && bun test`
