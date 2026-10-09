# @godspeedai/cognate-provider-openai-compatible

`ModelProvider` (spec §26) over any OpenAI-compatible `/chat/completions`
endpoint (llama.cpp, vLLM, Ollama's `/v1`, hosted APIs), using `fetch`
directly — no vendor SDK. `openAICompatible(options)` builds a provider with
id `openai-compatible:<id>`; `apiKey()` is called per request and never
stored, logged, or included in an error message or capability contract.

Messages, tools, and `responseFormat` are mapped to the wire shape (`tools`
as `{type:"function",function:{...}}`, tool call arguments JSON-stringified,
`responseFormat.schema` to `json_schema`, otherwise `json_object`).
`generate` parses one response; `stream` parses SSE `data:` lines (tolerant
of partial chunks) into text/tool_call deltas followed by a `done` delta
carrying the assembled `ModelResponse`.

HTTP and network failures map to typed `ModelProviderError` kinds
(`unauthorized`, `rate_limited`, `invalid_request`, `unavailable`,
`cancelled`, `malformed_response`). `modelComponent(provider)` wraps a
provider as a kernel `Component` publishing `model.generate`.
