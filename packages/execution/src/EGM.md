# execution / src — execution-world contracts and providers

## Overview

Defines the framework-owned execution-world ports — `FileSystemPort`, `ProcessPort`, `ExecutionWorldProvider` — with no transport or library types crossing the boundary `[types.ts:FileSystemPort]`. Registered providers are looked up by `worldId` and never fall back to another world `[registry.ts:createExecutionWorldRegistry]`. The package ships four providers (local, memory, bubblewrap, script-backed filesystem) and the `filesystem.*` / `process.*` capability component that delegates to a resolved world `[capabilities.ts:executionWorldsComponent]`.

## Interface

- `FileSystemPort` / `ProcessPort` / `ExecutionWorldProvider` / `WorldDescriptor` / `WorldKind` — the port contracts `[types.ts:ExecutionWorldProvider]`
- `PathEscapeError` / `WorldUnavailableError` — containment and fail-closed errors `[types.ts:PathEscapeError]`
- `createExecutionWorldRegistry` — `register`, `unregister`, `has`, `get`, `list`, `dispose` `[registry.ts:createExecutionWorldRegistry]`
- `executionWorldsComponent` — publishes `filesystem.resolve|stat|readText|writeText|list|version` and `process.exec` `[capabilities.ts:executionWorldsComponent]`
- `localExecutionWorld` / `resolveLocal` — the local machine as a world `[local.ts:localExecutionWorld]`
- `memoryExecutionWorld` / `resolveMemory` — deterministic in-process virtual world `[memory.ts:memoryExecutionWorld]`
- `bubblewrapExecutionWorld` — Linux namespace containment, opt-in `[bubblewrap.ts:bubblewrapExecutionWorld]`
- `commandFileSystem` / `nanoseconds` — a filesystem port built from running one POSIX script `[command.ts:commandFileSystem]`
- `resolvePosix` / `shellQuote` / `execScript` / `supervisedExecScript` / `createRootGuard` — POSIX helpers `[posix.ts:createRootGuard]`
- `executionWorldConformance` — the executable provider contract every provider calls from its own tests `[conformance.ts:executionWorldConformance]`

## Invariants

- `get` on an unregistered world throws `WorldUnavailableError`; there is no fallback to another world `[registry.ts:createExecutionWorldRegistry]`
- Registering a duplicate `worldId` throws `[registry.ts:createExecutionWorldRegistry]`
- `list()` emits secret-free descriptors sorted deterministically by `worldId` `[registry.ts:createExecutionWorldRegistry]`
- `resolve` is the containment boundary and must throw `PathEscapeError` for anything outside `root` `[types.ts:FileSystemPort]`
- `bubblewrapExecutionWorld` refuses non-Linux hosts, unverified binary provenance, and any `runtimeRoots` outside the explicit public executable/library set `[bubblewrap.ts:bubblewrapExecutionWorld]`
- `createRootGuard.assertContained` adds the symlink check the lexical rule cannot do, probing the nearest existing parent for a file about to be created `[posix.ts:createRootGuard]`
- `exec` with an empty `argv` or an invalid environment name throws `[posix.ts:execScript]`

## Side Effects

- Local filesystem reads, writes, stats, and directory listings `[local.ts:localExecutionWorld]`
- Child processes spawned on the local machine, and namespace-confined processes under bubblewrap `[local.ts:localExecutionWorld]`
- Wall-clock timestamps encoded into `version` tokens such as `mtimeNs:size:ino` `[local.ts:versionOf]`

## Verification

- Run: `cd packages/execution && bun test`
