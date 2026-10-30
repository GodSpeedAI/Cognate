# provider-local

## Overview

`package.json` declares `@godspeedai/cognate-provider-local` at version `0.8.0`: a deterministic offline `ModelProvider` for tests, demos, and fallback, scripted by rules and never a real model. The `exports` map has a single entry, `.`, resolving to `./src/index.ts`, and `files` publishes only `src`. This directory holds the manifest plus package metadata; the single implementation module lives in `src/`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — `localProvider`, the `LocalRule` script type, and the deterministic chunking of the stream
- test: `local.test.ts` — the provider's own suite (not a contract target)

## Global Invariants

- Runtime dependencies are `@godspeedai/cognate-capabilities`, `@godspeedai/cognate-events`, and `@godspeedai/cognate-kernel-api`, so the provider speaks only framework contracts `[packages/provider-local/package.json:dependencies]`
- The same request must produce the same response and the same stream chunking, which is what makes a fixed `chunkSize` part of the contract `[packages/provider-local/src/index.ts:localProvider]`
- Features are declared statically as `generate`, `stream`, `tool_use`, `structured_output` true and `multimodal_input` false, with a `context_limit` of 8192 `[packages/provider-local/src/index.ts:localProvider]`

## Global Side Effects

- None: no disk, network, clock, or process use; the provider resolves a rule over the last user message and returns `[packages/provider-local/src/index.ts:respondTo]`

## Verification

- Run: `cd packages/provider-local && bun test`
