# provider-typesafe / src — System One judgment and ranking adapters

## Overview

A `JudgmentProvider` over the `/v1/systemone` endpoint plus two `Ranker` bridges that let a judgment order the selector's eligible set `[index.ts:typeSafeProvider]`. The judgment adapter validates the request before dispatch and validates every answer against the question it answers `[index.ts:validatedAnswers]`. The module exports `typeSafeProvider`, `typeSafeRanker`, `typeSafeDirectRanker`, and `TypeSafeRankerOptions` `[index.ts:44]`.

## Interface

- `typeSafeProvider` — builds the judgment provider `[index.ts:typeSafeProvider]`
- `typeSafeRanker` — ranker that judges in groups then the shortlist `[ranker.ts:typeSafeRanker]`
- `typeSafeDirectRanker` — ranker variant over the eligible set `[ranker.ts:typeSafeDirectRanker]`
- `TypeSafeRankerOptions` — `describe`, `groupSize` (2-8), `shortlistSize` `[ranker.ts:TypeSafeRankerOptions]`
- `validate` — internal request validation `[index.ts:validate]`
- `validatedAnswers` — internal per-question answer validation `[index.ts:validatedAnswers]`

## Invariants

- A request must carry 1-32 questions; each id must match `^[A-Za-z0-9_.-]{1,100}$` with non-empty instructions `[index.ts:validate]`
- A `choice` question needs at least two criteria; a `score` question needs 2-10 levels `[index.ts:validate]`
- A returned choice must be a key of the question's criteria, and a returned score must be an integer-range number within `0..levels-1` `[index.ts:validatedAnswers]`
- A missing or type-mismatched answer for any requested id throws `judgment: missing or mismatched answer for <id>` `[index.ts:validatedAnswers]`
- An upstream non-OK status throws `judgment: upstream HTTP <status>`; unparseable JSON throws `judgment: malformed JSON response` `[index.ts:typeSafeProvider]`
- A malformed decision response payload is rejected unless `answers` is a record and `model` is a string `[index.ts:typeSafeProvider]`
- The adapter sees only the eligible set and its output is validated, so a judgment can order but never reintroduce an eliminated candidate or fail open `[ranker.ts:1]`

## Side Effects

- Outbound HTTP POST to `${baseURL}/v1/systemone`, with trailing slash and `/v1` stripped from the base `[index.ts:typeSafeProvider]`
- Optional `idempotency-key` header set from `request.operationKey` `[index.ts:typeSafeProvider]`
- Timeout via `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])` when `timeoutMs` is set `[index.ts:typeSafeProvider]`
- Credential headers through the injected `CredentialSource` `[index.ts:typeSafeProvider]`

## Verification

- Run: `cd packages/provider-typesafe && bun test`
