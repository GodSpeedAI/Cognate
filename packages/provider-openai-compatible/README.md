# @godspeedai/cognate-provider-openai-compatible

A Cognate model provider for any OpenAI-compatible chat completions endpoint — llama.cpp,
vLLM, Ollama's `/v1`, LM Studio, or hosted APIs — over plain `fetch`. No vendor SDK.

**When to use this package:** your app needs a real model and the server speaks the
OpenAI `/chat/completions` wire format. For deterministic scripted answers in tests, use
[`@godspeedai/cognate-provider-local`](https://www.npmjs.com/package/@godspeedai/cognate-provider-local)
instead.

## Installation

```sh
bun add @godspeedai/cognate-provider-openai-compatible
```

Requires [Bun](https://bun.sh) >= 1.4.0 (it uses the platform `fetch`, `AbortSignal`, and web
streams). The SDK ships Bun-native TypeScript source, so add `@types/bun` and `@types/node`
as dev dependencies when typechecking your project.

## Quick start

```ts
import { openAICompatible } from "@godspeedai/cognate-provider-openai-compatible";

const provider = openAICompatible({
  id: "gpt-4o-mini", // provider id becomes `openai-compatible:gpt-4o-mini`
  baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: () => process.env.OPENAI_API_KEY ?? "", // read per request, never stored
  timeoutMs: 60_000,
});

const response = await provider.generate({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.message.content);
console.log(response.usage); // { inputTokens, outputTokens } when the server reports usage

// Streaming: text deltas and tool-call deltas, then a final `done` delta
// carrying the assembled full response.
for await (const delta of provider.stream({ messages: [{ role: "user", content: "Hello!" }] })) {
  if (delta.type === "text") process.stdout.write(delta.text);
}
```

Point `baseURL` at any compatible server, for example `http://localhost:11434/v1` for Ollama
or your llama.cpp/vLLM route. The provider posts to `<baseURL>/chat/completions`.

## What is mapped

- **Messages and tools** become the OpenAI wire shape: tools as
  `{ type: "function", function: { name, description, parameters } }`, assistant tool calls
  with JSON-stringified arguments, `responseFormat.schema` as `json_schema` (or `json_object`
  without a schema), plus `max_tokens` and `temperature`.
- **Streaming** parses SSE `data:` lines (tolerant of chunk boundaries), accumulates tool
  calls whose id, name, and arguments arrive split across chunks, and yields ordered deltas
  followed by `tool_call` entries and a `done` delta with the assembled response.
- **Errors** become typed `ModelProviderError` kinds: `unauthorized` (401/403),
  `rate_limited` (429), `invalid_request` (other 4xx), `unavailable` (5xx, network errors,
  timeouts), `cancelled` (caller abort), and `malformed_response` (unparseable bodies).

The `apiKey` function is called per request and its value is never stored, logged, or included
in an error message or in the capability contract the provider publishes.

## Kernel component

`modelComponent(provider)` wraps a provider as a kernel `Component` publishing the
`model.generate` capability, so a runtime can select and invoke it like any other capability:

```ts
import { modelComponent } from "@godspeedai/cognate-provider-openai-compatible";

const component = modelComponent(provider);
// pass it in the runtime's `components` list
```

## Limitations

- Chat completions only: no embeddings, files, audio, or assistant-state APIs.
- Feature flags default to `stream`/`tool_use`/`structured_output` `true`,
  `multimodal_input` `false`, `context_limit` `8192`. Override `features` to match what your
  server actually supports, or eligibility checks will trust flags the server may not honor.
- Structured output depends on the server honoring `response_format`; the provider delivers
  whatever the server returns.
- Tool call arguments must be valid JSON on the wire; a server that streams malformed
  arguments surfaces `malformed_response`.

## Related packages

- [`@godspeedai/cognate-capabilities`](https://www.npmjs.com/package/@godspeedai/cognate-capabilities) —
  the `ModelProvider` contract, `ModelProviderError`, and selection engine.
- [`@godspeedai/cognate-provider-local`](https://www.npmjs.com/package/@godspeedai/cognate-provider-local) —
  deterministic scripted provider for tests and offline use.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime; pass a provider (or its component) to give agents a model.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
