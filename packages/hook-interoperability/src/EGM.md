# hook-interoperability source

## Overview
A Cognate-owned hook interoperability IR: discovery is inert and the package never spawns a shell or fetches a hook URL (package description; [package.json:description]). Native harness semantics are retained as a `phase` plus a `fidelity` marker so a superficially similar event is never confused with parity [src/index.ts:1]. The package has no dependencies and a single module [package.json:dependencies].

## Interface
- `HarnessId`, `HookPhase`, `HookScope`, `HookFidelity`, `HookHandler` [src/index.ts:HookPhase]
- `HookOrigin`, `HookDefinition`, `HookInventory` [src/index.ts:HookDefinition]
- `mapNativeEvent(harness, event)` — native event name to phase and fidelity [src/index.ts:mapNativeEvent]
- `parseDeclarativeHooks(value, options)` and `isRecord` [src/index.ts:parseDeclarativeHooks]
- `resolveEffectiveHooks(layers)` — merge layered inventories [src/index.ts:resolveEffectiveHooks]
- `matchHook(hook, invocation)`, `HookEffect`, `HookInvocation` [src/index.ts:matchHook]
- `HookAuthorization`, `HookExecutor`, `HookReceipt`, `HookDispatchResult`, `dispatchHooks(...)` [src/index.ts:dispatchHooks]

## Invariants
- A hook only fires when its mapped `fidelity` is `exact`; `approximate` and unmapped phases are receipted as `unmapped` [src/index.ts:dispatchHooks]
- Dispatch receipts a non-matching matcher, a disabled hook, an untrusted hook, a missing authorization, and a missing executor individually instead of skipping silently [src/index.ts:dispatchHooks]
- `matchHook` accepts `*`, or `|`-separated tool names over `[A-Za-z0-9_.:\-]+`, at most 32 patterns, and refuses anything richer rather than widening activation [src/index.ts:matchHook]
- A failed pre-tool guard cannot be treated as allowing the tool: `tool.before` and `permission.request` failures return `deny` [src/index.ts:dispatchHooks]
- A `deny` effect ends dispatch immediately; a `modify` effect replaces the input carried to later hooks [src/index.ts:dispatchHooks]
- The package deliberately provides no shell or HTTP executor; callers supply `HookExecutor` [src/index.ts:HookExecutor]

## Side Effects
- None beyond caller-supplied `HookAuthorization` and `HookExecutor` calls; no process, network, or filesystem access in this module [src/index.ts:1]

## Verification
- Run: `cd packages/hook-interoperability && bun test`
