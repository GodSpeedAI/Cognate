# @godspeedai/cognate-capabilities

Deterministic-first capability selection and the model provider contract for Cognate
applications. Given a requirement and a set of candidate providers, it decides — explainably
and durably — which provider to use, and it defines the plain-TypeScript `ModelProvider`
interface that model integrations implement.

**When to use this package:** you choose between multiple providers for the same capability
(for example several models) and need eligibility rules that always apply, ranking that can
never override policy, and a recorded explanation of every decision. Implementors of model
providers also need it for the `ModelProvider`, `ModelRequest`/`ModelResponse`, and
`ModelProviderError` types.

## Installation

```sh
bun add @godspeedai/cognate-capabilities
```

Requires [Bun](https://bun.sh) >= 1.4.0. Recording selections needs any
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events)
store. The SDK ships Bun-native TypeScript source, so add `@types/bun` and `@types/node` as
dev dependencies when typechecking your project.

## Quick start

```ts
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import {
  compatibilityRule,
  createSelector,
  recordSelection,
} from "@godspeedai/cognate-capabilities";

const store = createMemoryStore();

const selector = createSelector({
  rules: [
    compatibilityRule, // contract id, major version, and attributes must satisfy the requirement
    {
      id: "policy.no-cloud",
      evaluate: (candidate) =>
        candidate.contract.attributes?.hosting === "cloud"
          ? { eligible: false, reason: "tenant forbids cloud models" }
          : { eligible: true, reason: "hosting allowed" },
    },
  ],
  // ranker: optional; without one, eligible providers are picked in provider-id order
});

const decision = await selector.select({
  requirement: { capability: "model.generate", version: "1.0", attributes: { structured_output: true } },
  candidates: [
    { providerId: "cloud-a", contract: { id: "model.generate", version: "1.2.0", attributes: { structured_output: true, hosting: "cloud" } } },
    { providerId: "local-b", contract: { id: "model.generate", version: "1.0.0", attributes: { structured_output: true } } },
  ],
  principal: { id: "alice", kind: "user" },
  tenant: "tenant-a",
});

decision.eligible;  // ["local-b"] — cloud-a failed the policy rule
decision.selected;  // "local-b"
decision.filters;   // every (provider, rule) result with its reason

// Make the decision a durable fact with its full explanation:
await recordSelection(store, decision, { tenant: "tenant-a", scopeId: "root", correlationId: "corr-1", runId: "run-1" });
```

## How selection works

1. **Eligibility first.** Every `EligibilityRule` evaluates every candidate. Rules must be
   pure and deterministic; a candidate is eligible only if all rules pass.
2. **Ranking second — and contained.** The optional `Ranker` sees only the eligible set and
   can narrow it, never widen it. Ranker entries that are unknown, ineligible, duplicated, or
   non-finite are dropped. A missing or throwing ranker falls back to deterministic
   provider-id order, recorded in `decision.fallback`. With no eligible candidate, `selected`
   is `null` and the ranker is never called.
3. **Durable feedback.** `recordSelection` appends a `capability.selected` event with the
   full explanation; `recordOutcome` appends a `capability.outcome` for a recorded selection.
   Run `outcomeProjection()` in your projection runner to derive per-capability success
   counts, then pass `createOutcomeRanker(store)` as the selector's ranker: it scores
   providers by an upper-confidence-bound rule over recorded outcomes, tries untried
   providers first, and is deterministic — replaying the same outcomes yields the same
   ranking. Feedback only influences ranking after it is committed and projected.

## The model provider contract

The package also defines the model integration contract every provider implements:

- `ModelProvider` — `id`, `model`, declared `features` (streaming, tool use, structured
  output, multimodal input, context limit), `generate(request)` and `stream(request)`.
- `ModelRequest` / `ModelResponse` / `ModelDelta` — messages, tools, `responseFormat`, and
  the streamed delta shapes (`text`, `tool_call_start`, `tool_call_args`, `tool_call_end`,
  `tool_call`, `done`).
- `ModelProviderError` — typed failure kinds: `unauthorized`, `rate_limited`,
  `invalid_request`, `unavailable`, `cancelled`, `malformed_response`.
- `modelContract(provider)` — the `CapabilityContract` a provider publishes (capability id
  `model.generate`, features as attributes, never credentials).

Ready-made providers:
[`@godspeedai/cognate-provider-local`](https://www.npmjs.com/package/@godspeedai/cognate-provider-local)
(deterministic, offline) and
[`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible)
(any OpenAI-compatible HTTP endpoint).

## Limitations

- Rules and rankers are yours to write; this package guarantees containment and honest
  bookkeeping, not ranking quality.
- The built-in outcome ranker is a deterministic bandit heuristic over your own recorded
  outcomes — not a trained model — and scores are only comparable within one capability.
- `recordSelection`/`recordOutcome` write to the store you give them; without a durable
  store, feedback is lost on restart.

## Related packages

- [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api) —
  `Requirement`, `CapabilityContract`, and the compatibility check used by `compatibilityRule`.
- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) —
  the store contract for recording selections and outcomes.
- [`@godspeedai/cognate-projections`](https://www.npmjs.com/package/@godspeedai/cognate-projections) —
  the projection runner that applies `outcomeProjection()`.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime, which wires selection and providers together.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
