# @godspeedai/cognate-provider-anthropic-compatible

Native Messages API adapter: system prompt, tools with `input_schema`, tool results, `x-api-key`/custom bearer credentials, streamed content and explicit message_stop settlement. No covert OpenAI request translation; unsupported JSON-schema output is rejected rather than advertised as supported.

Configure `baseURL` including version prefix, e.g. `https://api.anthropic.com/v1`. Streamed event emission ends only on `message_stop`. Conformance: `bun test packages/provider-anthropic-compatible/test`.

License: Apache-2.0.
