# provider-openai-oauth

Implements the SIWC (Sign in with ChatGPT) flow per the official documentation as of 2026-10;
`src/protocol.ts` constants mirror `developers.openai.com/siwc`. Test with the fake issuer in
`test/oauth.test.ts` — it is the normative conformance fixture for this package.

Boundaries: credentials are leased per request; automation requires the separate consent record
(`store.ts`), enforced before any payable request (`provider.ts`). Never log tokens, never put
tokens in URLs (the authorize URL carries `id_token_hint` and must not be logged). Discovery is
injectable; production endpoints are defaults, not assumptions.
