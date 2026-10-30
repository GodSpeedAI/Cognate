# provider-typesafe

## Overview

`package.json` declares `@godspeedai/cognate-provider-typesafe` at version `0.8.0`: a native TypeSafe/System One typed decision provider, explicitly not a chat completion shim. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the judgment provider and its two rankers live in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `typeSafeProvider` over `/v1/systemone` plus `typeSafeRanker` and `typeSafeDirectRanker`
- test: `judgment.test.ts` and `ranker.test.ts` — the adapter's own suites (not contract targets)

## Global Invariants

- Runtime dependencies are `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-events`, and `@godspeedai/cognate-provider-auth`, so the adapter implements the `JudgmentProvider` port with framework types only `[packages/provider-typesafe/package.json:dependencies]`
- The base URL is normalized to a single `/v1/systemone` endpoint, whether the caller supplies an origin or a `/v1` URL `[packages/provider-typesafe/src/index.ts:typeSafeProvider]`
- Requests and answers are validated before and after the call: question identity `1-100` characters, 1–32 questions, choice needs at least two options, score needs 2–10 levels `[packages/provider-typesafe/src/index.ts:validate]`
- A malformed, missing, or mismatched answer throws instead of being coerced, and an idempotency key is forwarded when the request carries an `operationKey` `[packages/provider-typesafe/src/index.ts:validatedAnswers, packages/provider-typesafe/src/index.ts:typeSafeProvider]`
- A ranker may only order the eligible set: malformed or abstaining judgments produce no vote, never a vote for an unknown id `[packages/provider-typesafe/src/ranker.ts:typeSafeRanker, packages/provider-typesafe/src/ranker.ts:typeSafeDirectRanker]`

## Global Side Effects

- None at package load; a single outbound HTTP `POST` per `evaluate` to the System One endpoint, with an optional timeout signal `[packages/provider-typesafe/src/index.ts:typeSafeProvider]`

## Verification

- Run: `cd packages/provider-typesafe && bun test`
