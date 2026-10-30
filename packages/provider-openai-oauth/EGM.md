# provider-openai-oauth

## Overview

`package.json` declares `@godspeedai/cognate-provider-openai-oauth` at version `0.8.0`: a Sign in with ChatGPT (SIWC) OAuth/OIDC credential adapter covering dynamic client registration, PKCE sign-in, validated tokens, rotating refresh, and governed subscription inference. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the protocol, JWT, store, session, and provider modules live in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — wire constants, ID-token validation, the credential store, the sign-in lifecycle, and the subscription provider
- test: `oauth.test.ts` — the adapter's own suite (not a contract target)

## Global Invariants

- Runtime dependencies are `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`, and `@godspeedai/cognate-provider-openai-responses`, so plan-backed inference reuses the shared Responses adapter rather than a second HTTP client `[packages/provider-openai-oauth/package.json:dependencies]`
- Production issuer endpoints are defaults only; every entry point accepts overrides so conformance tests run against a deterministic fake issuer `[packages/provider-openai-oauth/src/protocol.ts:discoverEndpoints]`
- The plan-usage scope `chatgpt.tokens.use.direct` is the boundary between "signed in" and "authorized for plan-backed inference" `[packages/provider-openai-oauth/src/protocol.ts:PLAN_USE_SCOPE]`
- Automation use is gated locally before any token is used, independent of token validity `[packages/provider-openai-oauth/src/provider.ts:subscriptionResponsesProvider]`

## Global Side Effects

- Writes owner-only account records under an app-local accounts directory on disk `[packages/provider-openai-oauth/src/store.ts:writeAccountRecord]`
- Opens a loopback HTTP listener for the callback and launches the system browser during sign-in `[packages/provider-openai-oauth/src/session.ts:signIn]`
- Issues outbound HTTP to the issuer's discovery, authorization, token, and revocation endpoints `[packages/provider-openai-oauth/src/protocol.ts:discoverEndpoints]`

## Verification

- Run: `cd packages/provider-openai-oauth && bun test`
