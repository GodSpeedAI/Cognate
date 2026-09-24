# AGENTS.md — @cognate/capabilities

- Eligibility rules must stay pure and total: run every rule on every candidate, never short-circuit.
- The ranker only ever sees `eligible` candidates and can only narrow, never widen, the result.
- Keep `createSelector`/`recordSelection`/`recordOutcome`/`outcomeProjection`/`createOutcomeRanker`
  exported from `src/index.ts` with their current signatures.
