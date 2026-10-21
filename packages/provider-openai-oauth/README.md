# @godspeedai/cognate-provider-openai-oauth

> **Preview — not validated against production.** The adapter passes a fake-issuer
> conformance suite, but no live ChatGPT sign-in has been recorded yet. Treat
> plan-backed inference as unsupported until that evidence exists.

Sign in with ChatGPT (SIWC) for open-source, locally hosted Cognate runs: an OAuth/OIDC
credential adapter and a governed subscription-backed Responses provider.

- Dynamic client registration (`dynamic_agent_client` → issued `oaiapp_...` id) with a stable
  per-host `ext_agent_host_id`.
- PKCE S256, fresh `state`/`nonce` per attempt, loopback callback on `127.0.0.1` (only the port
  varies), system-browser handoff without a shell.
- ID-token validation against OpenAI's JWKS (RS256/ES256 only), issuer/audience/expiry/nonce
  checks, `sub` as the account identity.
- Atomic, 0600 credential records per issued client id; refresh-token rotation replaces the
  whole token set under a single-flight lock.
- Revocation on sign-out; automation use is a separate, secret-free, explicit local consent
  record enforced by `assertSubscriptionUse` (see `@godspeedai/cognate-provider-auth`).
- Plan-backed inference goes through the Responses adapter with the SIWC preview constraints
  enforced: `store:false`, `stream:true`, no `temperature`/`max_output_tokens`/system-role input.

This package never reads credentials from other applications (Codex, OpenCode, …) and never
places tokens in URLs, logs, or durable events. A bearer token typed into a field is not an
OAuth sign-in; use `@godspeedai/cognate-provider-auth` sources for that case.

Conformance: `bun test packages/provider-openai-oauth/test`.

License: Apache-2.0.
