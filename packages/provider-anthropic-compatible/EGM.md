# provider-anthropic-compatible

## Overview

`package.json` declares `@godspeedai/cognate-provider-anthropic-compatible` at version `0.8.0`, an Anthropic Messages API compatible `ModelProvider` with tools and SSE streaming. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; all code is in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `anthropicCompatible`, the Messages request/response mapping, and the SSE delta fold
- test: `anthropic.test.ts` — the provider's own suite (not a contract target)

## Global Invariants

- Runtime dependencies are `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-provider-auth`, and `@godspeedai/cognate-provider-wire`; the HTTP and credential plumbing lives in those packages rather than here `[packages/provider-anthropic-compatible/package.json:dependencies]`
- Credentials are obtained per request through `credentialHeaders` from `@godspeedai/cognate-provider-auth`, so the adapter never stores a token itself `[packages/provider-anthropic-compatible/src/index.ts:anthropicCompatible]`
- Model types come only from `@godspeedai/cognate-capabilities`, keeping the provider behind the `ModelProvider` port `[packages/provider-anthropic-compatible/src/index.ts:anthropicCompatible]`

## Global Side Effects

- None at package load; outbound `fetch` calls to `` `${baseURL}/messages` `` belong to the provider in `src/` `[packages/provider-anthropic-compatible/src/index.ts:anthropicCompatible]`

## Verification

- Run: `cd packages/provider-anthropic-compatible && bun test`
