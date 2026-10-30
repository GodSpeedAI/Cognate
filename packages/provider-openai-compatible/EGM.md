# provider-openai-compatible

## Overview

`@godspeedai/cognate-provider-openai-compatible` (version `0.8.0`) is described as a "ModelProvider for OpenAI-compatible chat completion endpoints (llama.cpp, vLLM, Ollama's /v1, hosted APIs) over fetch; no SDK" and exports only `./src/index.ts` `[packages/provider-openai-compatible/package.json:exports]`. Its dependencies are `@godspeedai/cognate-capabilities` (model contract and provider types), `@godspeedai/cognate-events` (the `Json` type), and `@godspeedai/cognate-kernel-api` (the `Component` type); it does not depend on `@godspeedai/cognate-provider-wire` or on `@godspeedai/cognate-provider-auth` `[packages/provider-openai-compatible/package.json:dependencies]`. Accordingly the package implements its own request body, header, timeout, error, and SSE logic, and takes credentials as a plain `apiKey` accessor rather than a lease `[packages/provider-openai-compatible/src/index.ts:OpenAICompatibleOptions]`. `@godspeedai/cognate-provider-local` appears only as a dev dependency, used by the test suite `[packages/provider-openai-compatible/package.json:devDependencies]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `openAICompatible` provider, Chat Completions mapping, SSE accumulation, and `modelComponent`
- test/ — one suite, `provider.test.ts`; no `EGM.md` on disk, so it is not linked

## Global Invariants

- Only `src` is published (`files: ["src"]`), so the suite and the dev-only local provider dependency are not distributed `[packages/provider-openai-compatible/package.json:files]`
- The package is SDK-free by declaration: every request goes through an injected `fetch` `[packages/provider-openai-compatible/package.json:description]`
- The provider id is namespaced `openai-compatible:<id>`, and the kernel component id is `model:<provider.id>` `[packages/provider-openai-compatible/src/index.ts:modelComponent]`
- Cross-package types are imported as types only from `events` and `kernel-api`, so the runtime coupling is to `capabilities` `[packages/provider-openai-compatible/src/index.ts:import]`

## Global Side Effects

- Network: one POST to `<baseURL>/chat/completions` per generate or stream call, through the injected or global `fetch` `[packages/provider-openai-compatible/src/index.ts:openAICompatible]`
- Secret access: the `apiKey` accessor is awaited per request to build an `authorization: Bearer` header `[packages/provider-openai-compatible/src/index.ts:buildHeaders]`
- Clock: a timeout signal is created from `timeoutMs` when supplied `[packages/provider-openai-compatible/src/index.ts:createSignals]`

## Verification

- Run: `cd packages/provider-openai-compatible && bun test`
