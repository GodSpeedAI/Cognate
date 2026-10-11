# @godspeedai/cognate-provider-openai-responses

Direct Responses API wire adapter for `ModelProvider`. It sends `store:false`, supports tool calls and structured JSON, and requires a `response.completed` event before streamed output is settled. Credentials are acquired per request.

Plan-backed access additionally needs a separately validated Sign in with ChatGPT (SIWC) credential source, account-bound consent and a `subscription` mode gate. An API key or bearer token does **not** by itself demonstrate SIWC authorization. Never copy other tools' cached OAuth tokens or client IDs. Official protocol: https://developers.openai.com/siwc/token-sharing-open-source.

Conformance: `bun test packages/provider-openai-responses/test`.

License: Apache-2.0.
