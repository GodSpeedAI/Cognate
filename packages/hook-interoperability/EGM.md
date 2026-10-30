# hook-interoperability

## Overview

A Cognate-owned hook interoperability IR with no dependencies of its own `[package.json:dependencies]`. The entry point re-exports the hook types plus `mapNativeEvent`, `parseDeclarativeHooks`, `resolveEffectiveHooks`, `matchHook`, and `dispatchHooks` from `./src/index.ts` `[package.json:exports]`. Discovery is inert: the package provides no shell or HTTP executor, and a caller-owned `HookExecutor` is the only execution boundary `[src/index.ts:HookExecutor]`. Native semantics are preserved per harness so a similar-sounding event is never presented as parity `[src/index.ts:mapNativeEvent]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — hook IR types, native event maps, declarative parsing, effective-resolution, matcher, and governed dispatch `[src/index.ts:dispatchHooks]`
- test/ — `hooks.test.ts` (not a child contract)
- No child `EGM.md` exists under this package.

## Global Invariants

- `HookFidelity` is exactly `exact`, `approximate`, `unmapped`; unknown harness events return `{ fidelity: "unmapped" }` `[src/index.ts:mapNativeEvent]`
- Hook ids are a 24-character SHA-256 hex slice of origin, matcher, and native descriptor `[src/index.ts:hashNative]`
- A hook's `trust` is `unknown` unless the caller explicitly supplied a trust decision `[src/index.ts:parseDeclarativeHooks]`
- Discovery without a declarative hooks object reports `partial` with an explicit unresolved note `[src/index.ts:parseDeclarativeHooks]`
- Effective-hook merging is a union deduplicated by hook id, with the first (highest-precedence) occurrence winning `[src/index.ts:resolveEffectiveHooks]`
- An empty merged result is never reported as `complete` `[src/index.ts:resolveEffectiveHooks]`
- The matcher is a conservative subset: `*` or empty matches all, otherwise pipe-separated tool names limited to 32 patterns of safe characters; unsupported syntax matches nothing rather than widening `[src/index.ts:matchHook]`
- Dispatch receipts use a closed decision set including `not_applicable`, `unmapped`, `disabled`, `untrusted`, `unauthorized`, `no_executor`, `allow`, `deny`, `modify`, `failed` `[src/index.ts:HookReceipt]`
- A non-`exact` fidelity hook is recorded as `unmapped` and never executed `[src/index.ts:dispatchHooks]`
- Only `trusted` hooks run, and only with an explicit authorization plus executor `[src/index.ts:dispatchHooks]`
- A failed hook on `tool.before` or `permission.request` yields `deny` with reason `approved safety hook failed` — a pre-tool guard never fails open `[src/index.ts:dispatchHooks]`
- A `deny` effect stops dispatch immediately `[src/index.ts:dispatchHooks]`

## Global Side Effects

- `node:crypto` SHA-256 hashing for hook ids `[src/index.ts:hashNative]`
- No process, network, or filesystem effect: execution happens only inside the caller's `HookExecutor` `[src/index.ts:HookExecutor]`

## Verification

- Run: `cd packages/hook-interoperability && bun test`
