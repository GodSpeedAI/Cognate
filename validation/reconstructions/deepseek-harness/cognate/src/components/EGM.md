# components — model provider mounting

## Overview

Two modules that turn a wire configuration into a live `model.generate` capability. `modelProvider`
wraps any `ModelProvider` as a component that forwards streamed text deltas through the run's
`progress` channel, and `providerRegistry` picks the concrete provider per protocol and hot-swaps it
inside the kernel with rollback. This is the seam that makes Settings → Models work without a restart
`[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`.

## Interface

- `streamingProviderComponent` — publishes `model.generate` and calls `provider.stream` when the provider supports streaming and the context exposes `progress` `[validation/reconstructions/deepseek-harness/cognate/src/components/modelProvider.ts:streamingProviderComponent]`
- `ModelWireProtocol` — `openai-compatible` | `openai-completions` | `openai-responses` | `anthropic-messages`; the first is kept only for persisted configurations `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ModelWireProtocol]`
- `ModelConfig` — `providerId`, `baseURL`, `protocol`, `model` `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ModelConfig]`
- `buildProvider` — constructs the provider for a protocol and reads its key from the secret store under `model-provider:<providerId>` `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:buildProvider]`
- `ProviderRegistry` — `current`, `swap(config, secrets)` `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`

## Invariants

- Without streaming support or a `progress` context the handler falls back to a single `generate` call `[validation/reconstructions/deepseek-harness/cognate/src/components/modelProvider.ts:streamingProviderComponent]`
- If no `done` delta arrives the handler synthesizes an assistant response from the accumulated text `[validation/reconstructions/deepseek-harness/cognate/src/components/modelProvider.ts:streamingProviderComponent]`
- An unknown protocol throws `model.configure: unsupported wire protocol` `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:buildProvider]`
- `swap` waits for `ACTIVE` with a 5 000 ms budget; on timeout it disposes the new handle and leaves the previous provider mounted, so a failed hot-swap never takes the app down `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`
- The previous provider is disposed only after the replacement is active and recorded as current `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`
- The Anthropic path sends the key as `x-api-key` via `apiKeySource`; the responses path uses `credentials` `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:buildProvider]`

## Side Effects

- Mounts and disposes kernel components, changing which `model.generate` implementation is live `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`
- Reads secrets from the 0600 store on every key resolution `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:buildProvider]`
- Emits `run.invocation.progress` text deltas through `ctx.progress` `[validation/reconstructions/deepseek-harness/cognate/src/components/modelProvider.ts:streamingProviderComponent]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/providerRegistry.test.ts ./test/J-CFG-model-provider.test.ts`
