# provider-auth / src — credential leases and the subscription gate

## Overview

The single module `src/index.ts` defines the credential boundary every provider adapter leases from: a `CredentialSource` that yields a short-lived `CredentialLease` of HTTP headers, two factories that build sources from secret accessors, a helper that resolves a source into plain headers, and a local policy gate for plan-backed subscription use. Nothing in the module performs I/O; every effect is either the caller's accessor function or the caller's own HTTP client.

## Interface

- `CredentialLease` — read-only `headers` plus optional `expiresAt`, `identityRef`, `grantedScopes` `[packages/provider-auth/src/index.ts:CredentialLease]`
- `CredentialSource` — `acquire(signal?: AbortSignal): Promise<CredentialLease>` `[packages/provider-auth/src/index.ts:CredentialSource]`
- `UsageMode` — the union `"interactive" | "authorized_automation"` `[packages/provider-auth/src/index.ts:UsageMode]`
- `SubscriptionGrant` — `identityRef`, `scopes`, and host-recorded `automationApproved` `[packages/provider-auth/src/index.ts:SubscriptionGrant]`
- `assertSubscriptionUse(grant, mode)` — throws unless the grant carries the scope `chatgpt.tokens.use.direct`, and throws for `authorized_automation` without approval `[packages/provider-auth/src/index.ts:assertSubscriptionUse]`
- `apiKeySource(apiKey, header?)` — source whose `acquire` awaits the accessor; `header` defaults to `"authorization"` `[packages/provider-auth/src/index.ts:apiKeySource]`
- `bearerSource(accessToken)` — `apiKeySource` with the default authorization header `[packages/provider-auth/src/index.ts:bearerSource]`
- `credentialHeaders(source?, signal?)` — resolves a source into a copy of its headers, or `{}` when no source is given `[packages/provider-auth/src/index.ts:credentialHeaders]`

## Invariants

- The `authorization` header value is prefixed `Bearer `; any other header name carries the secret verbatim `[packages/provider-auth/src/index.ts:apiKeySource]`
- An empty secret fails closed with `Error("Credential unavailable")` instead of sending a blank header `[packages/provider-auth/src/index.ts:apiKeySource]`
- `automationApproved` is consent recorded by the host, never derived from token presence `[packages/provider-auth/src/index.ts:SubscriptionGrant]`
- The scope check runs before the automation check, so a missing scope is reported as unauthorized plan use `[packages/provider-auth/src/index.ts:assertSubscriptionUse]`
- `credentialHeaders` spreads the lease headers into a new object, so callers cannot mutate the lease `[packages/provider-auth/src/index.ts:credentialHeaders]`

## Side Effects

- Awaits the caller-supplied accessor on every `acquire()`; no token cache or refresh scheduling exists here `[packages/provider-auth/src/index.ts:apiKeySource]`
- Forwards the supplied `AbortSignal` into `CredentialSource.acquire` but implements no cancellation of its own `[packages/provider-auth/src/index.ts:credentialHeaders]`

## Verification

- Run: `cd packages/provider-auth && bun test`
