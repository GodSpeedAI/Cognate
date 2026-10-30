# provider-openai-oauth / src — subscription-backed ChatGPT provider

## Overview

Signs in to a ChatGPT plan over SIWC, stores per-account credentials on disk, and exposes a `ModelProvider` that wraps the shared Responses adapter so every plan-backed request honors the preview constraints `[provider.ts:subscriptionResponsesProvider]`. The module re-exports everything from `protocol.ts`, `jwt.ts`, `store.ts`, `session.ts`, and `provider.ts` `[index.ts:1]`. Session lifecycle covers loopback callback sign-in, ID-token validation, single-flight refresh, revocation, and a per-request `CredentialSource` lease `[session.ts:1]`.

## Interface

- `subscriptionResponsesProvider` — provider with `generate` served through the stream `[provider.ts:subscriptionResponsesProvider]`
- `subscriptionRequest` — strips system-role items into `instructions` and drops temperature/maxTokens `[provider.ts:subscriptionRequest]`
- `signIn` / `refreshAccount` / `signOut` — session lifecycle over the loopback flow `[session.ts:signIn]`
- `subscriptionCredentialSource` / `subscriptionGrant` / `ensureAutomationGrant` — credential and consent plumbing `[session.ts:subscriptionCredentialSource]`
- `SiwcOptions` — accounts dir, app name, discovery URL, fetcher, browser opener, loopback port, clock `[session.ts:SiwcOptions]`
- `validateIdToken` / `JwksClient` / `IdTokenError` — RS256/ES256-only ID-token validation `[jwt.ts:validateIdToken]`
- `writeAccountRecord` / `readAccountRecord` / `accountsDirectory` — atomic owner-only credential persistence `[store.ts:writeAccountRecord]`
- `AccountRecord` / `AutomationConsent` — credential record and secret-free consent record `[store.ts:AccountRecord]`
- `buildAuthorizationUrl` / `parseCallback` / `exchangeAuthorizationCode` / `refreshTokens` / `revokeToken` — protocol calls `[protocol.ts:buildAuthorizationUrl]`

## Invariants

- Every plan-backed request is transformed by `subscriptionRequest`; `generate` is served through `stream` so `stream:true` always holds `[provider.ts:subscriptionResponsesProvider]`
- A subscription stream that ends without a final `done` delta throws `ModelProviderError("malformed_response")` `[provider.ts:subscriptionResponsesProvider]`
- `assertSubscriptionUse` runs before credential acquisition, so automation requires recorded consent independent of token validity `[provider.ts:subscriptionResponsesProvider]`
- Usage mode defaults to `interactive` `[provider.ts:subscriptionResponsesProvider]`
- Only RS256 and ES256 are accepted, so `alg` confusion and `none` tokens cannot pass `[jwt.ts:1]`
- An unfamiliar `kid` forces exactly one JWKS refresh, never a loop; keys are cached for 300 000 ms `[jwt.ts:JwksClient]`
- Account records are written temp-then-rename with mode `0o600`, so readers never see a torn record `[store.ts:writeAccountRecord]`
- A client id must match `^[A-Za-z0-9_-]{8,128}$` before it is used in a path, preventing traversal `[store.ts:accountPath]`
- Automation consent is stored separately in a secret-free record `[store.ts:AutomationConsent]`
- The account directory layout is `<home>/.config/<appName>/openai` `[store.ts:accountsDirectory]`

## Side Effects

- Filesystem writes of credential JSON with `0o600` permissions and a temp+`rename` sequence `[store.ts:writeAccountRecord]`
- Outbound HTTP to the issuer's discovery, authorization, token, JWKS, and revocation endpoints `[protocol.ts:OPENAI_ISSUER]`
- A loopback HTTP listener for the OAuth callback and optional system-browser launch `[session.ts:SiwcOptions]`
- Child process spawning for the browser opener path `[session.ts:1]`

## Verification

- Run: `cd packages/provider-openai-oauth && bun test`
