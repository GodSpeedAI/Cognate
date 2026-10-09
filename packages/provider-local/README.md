# @godspeedai/cognate-provider-local

A deterministic, rule-scripted model provider for Cognate applications. It answers from rules
you write — no network, no model weights, no randomness: the same request always produces the
same response and the same stream chunks.

**When to use this package:** tests and fixtures that need a `ModelProvider` without any
external dependency, offline demos, and local development before you point an app at a real
endpoint. It is never a real model — do not use it where genuine model behavior matters.
For real endpoints, use
[`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible).

## Installation

```sh
bun add @godspeedai/cognate-provider-local
```

Requires [Bun](https://bun.sh) >= 1.4.0. The SDK ships Bun-native TypeScript source, so add
`@types/bun` and `@types/node` as dev dependencies when typechecking your project.

## Quick start

```ts
import { localProvider } from "@godspeedai/cognate-provider-local";

const provider = localProvider({
  id: "demo", // provider id becomes `local:demo`
  rules: [
    {
      when: "refund", // matches a case-insensitive substring of the last user message
      respond: () => ({
        message: { role: "assistant", content: "Your refund is approved." },
        toolCalls: [],
        finishReason: "stop",
      }),
    },
    {
      // no `when`: matches everything the earlier rules did not
      respond: () => ({
        message: { role: "assistant", content: "Say 'refund' to exercise the flow." },
        toolCalls: [],
        finishReason: "stop",
      }),
    },
  ],
});

const response = await provider.generate({
  messages: [{ role: "user", content: "Can I get a refund?" }],
});
console.log(response.message.content); // "Your refund is approved."
console.log(response.model);           // "local-rules"

// Streaming yields the same content in text deltas (default 16 chars), then `done`
// with the exact response `generate` would return.
for await (const delta of provider.stream({ messages: [{ role: "user", content: "refund please" }] })) {
  if (delta.type === "text") process.stdout.write(delta.text);
}
```

Rules match in order: the first rule whose `when` (omitted means always) is a case-insensitive
substring of the last user message produces the response. A rule's `respond` receives the full
request and may return tool calls, so scripted tool-use flows work too. With no matching rule,
the provider returns a fixed "no scripted answer" reply.

## Provider surface

- `id`: `local:<id ?? "default">`; `model`: the constant `"local-rules"`.
- Declared features: `stream`, `tool_use`, and `structured_output` are `true`;
  `multimodal_input` is `false`; `context_limit` is `8192`. These flags are fixed regardless
  of what your rules actually do — set expectations in your own eligibility rules when it
  matters.
- `chunkSize` (default `16`) controls streamed text-delta length.

## Limitations

- Matching is substring-only: no embeddings, no ranking, no memory of earlier messages.
- It declares tool-use and structured-output support even though only your rules decide what
  actually comes back; nothing validates that scripted responses match those flags.
- Never use it in production paths that need real model judgment — it is deterministic by
  design.

## Related packages

- [`@godspeedai/cognate-capabilities`](https://www.npmjs.com/package/@godspeedai/cognate-capabilities) —
  the `ModelProvider` contract and selection engine this provider implements.
- [`@godspeedai/cognate-provider-openai-compatible`](https://www.npmjs.com/package/@godspeedai/cognate-provider-openai-compatible) —
  the provider for real OpenAI-compatible HTTP endpoints.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime; pass a provider to give agents a model.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
