# packages/cognitive-memory

## Overview

"In-process exact-cosine CognitiveIndex and a deterministic hashing embedder; the fallback implementation for core cognition" `[packages/cognitive-memory/package.json:description]`. It implements the `CognitiveIndex` / `Embedder` contracts from `@godspeedai/cognate-cognitive-api` over plain maps, with no native dependency `[packages/cognitive-memory/src/index.ts:1]`. The manifest declares a single export `.` and one workspace dependency `[packages/cognitive-memory/package.json:exports]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the index implementation and the hashing embedder

## Global Invariants

- Both `createMemoryIndex` and `hashingEmbedder` are exported from the single entrypoint, which is the only export path `[packages/cognitive-memory/package.json:exports]`
- The package depends only on the cognitive contract package, so no storage or kernel type can leak `[packages/cognitive-memory/package.json:dependencies]`
- Published contents are `src` only `[packages/cognitive-memory/package.json:files]`
- The conformance suite is the shared cognitive contract, executed by this package's own test file `[packages/cognitive-memory/test/conformance.test.ts:1]`

## Global Side Effects

- None. The index is an in-memory `Map`; embeddings are computed by pure feature hashing, and no file, socket, or timer is created `[packages/cognitive-memory/src/index.ts:createMemoryIndex]`

## Verification

- Run: `cd packages/cognitive-memory && bun test`
