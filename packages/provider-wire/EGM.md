# provider-wire

## Overview

`@godspeedai/cognate-provider-wire` (version `0.8.0`) describes itself as the "Shared SSE and HTTP error boundary for fetch model adapters" and publishes one entry, `./src/index.ts` `[packages/provider-wire/package.json:exports]`. Its single declared dependency is `@godspeedai/cognate-capabilities`, which supplies the `ModelProviderError` class the module throws `[packages/provider-wire/package.json:dependencies]`. It is the shared layer under `@godspeedai/cognate-provider-openai-responses`, which declares it as a workspace dependency `[packages/provider-openai-responses/package.json:dependencies]`; `@godspeedai/cognate-provider-openai-compatible` does not, and implements its own fetch, error, and SSE handling `[packages/provider-openai-compatible/package.json:dependencies]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — timeout signals, HTTP status classification, JSON POST, and SSE frame parsing
- test/ — one suite, `wire.test.ts`; no `EGM.md` on disk, so it is not linked

## Global Invariants

- Only `src` ships (`files: ["src"]`), so the suite is not published `[packages/provider-wire/package.json:files]`
- All failures leaving the package are `ModelProviderError` values with a kind, not raw fetch or reader exceptions `[packages/provider-wire/src/index.ts:sendJson]`
- The fetch implementation is injected by the caller; the package never reaches for a global transport itself `[packages/provider-wire/src/index.ts:HttpFetch]`

## Global Side Effects

- Network I/O happens only when the caller invokes `sendJson` with its own `HttpFetch` `[packages/provider-wire/src/index.ts:sendJson]`
- Wall-clock time enters only through `AbortSignal.timeout(timeoutMs)` when a caller supplies a timeout `[packages/provider-wire/src/index.ts:requestSignal]`

## Verification

- Run: `cd packages/provider-wire && bun test`
