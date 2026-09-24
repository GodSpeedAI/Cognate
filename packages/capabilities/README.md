# @cognate/capabilities

Two-phase capability selection (spec §3.6, §8.2, §17, §30): every `EligibilityRule` filters
every candidate first, and every (provider, rule) result is recorded. Only the eligible set is
exposed to an adaptive `Ranker`, which can narrow but never widen it — an unknown, ineligible,
duplicated, or non-finite ranker entry is dropped, and a missing or throwing ranker falls back to
deterministic `providerId` order.

`recordSelection` / `recordOutcome` make selections and their outcomes durable facts on stream
`selection-<id>`. `outcomeProjection()` derives a Laplace-smoothed success rate per
`(capability, provider)`, and `createOutcomeRanker(store)` turns that into a `Ranker` so feedback
only changes ranking after it is committed and projected (spec §15).
