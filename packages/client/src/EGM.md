# client source — headless client

## Overview
Framework-neutral headless client over `RuntimeService` (package description; [package.json:description]). All exposed state is derived from durable events and rebuildable by replay; the module carries no React import and exposes a minimal `Readable` observable that React bindings adapt with `useSyncExternalStore` [src/index.ts:Readable]. The whole implementation is `src/index.ts` [package.json:exports].

## Interface
- `createClient(options)` — returns a `CognateClient` [src/index.ts:createClient]
- `CognateClient` — `status`, `startRun`, `cancelRun`, `updateState`, `run`, `threadSharedState`, `updateThreadSharedState`, `subscribe`, `projection`, `resolveContinuation`, `provideCapability`, `offerCapability`, `invoke`, `artifact`, `close` [src/index.ts:CognateClient]
- `Readable<T>`, `ConnectionStatus`, `RunState`, `ThreadSharedState`, `ClientOptions`, `FrontendHandler`, `RemoteCapabilityOfferInput` [src/index.ts:ClientOptions]
- Internal `Engine`, `RunStore`, `ThreadSharedStateStore`, `SimpleReadable` are not exported [src/index.ts:SimpleReadable]

## Invariants
- `RunState` is folded only from the run's durable events, and `position` tracks the last applied store position [src/index.ts:RunStore]
- `state.changed` payloads are applied as `{ patch }` or `{ snapshot }`; a bad patch surfaces as `StatePatchError` handling through `applyStateUpdate` [src/index.ts:RunState]
- Continuation lists are refreshed only on `run.waiting` / `run.resumed` / `run.wait.closed`, guarded by a generation counter so a stale read cannot overwrite a newer one [src/index.ts:refreshContinuations]
- A terminal status is never reverted by a later pending-status refresh [src/index.ts:refreshContinuations]
- Thread state subscribes before reading the snapshot, and events arriving during the read are folded only when newer than the snapshot version [src/index.ts:ThreadSharedStateStore]
- `subscribe` resumes from a cursor after disconnect with no gaps and no duplicates [src/index.ts:CognateClient]
- `startRun`, `cancelRun`, `updateState`, and thread updates mint an idempotency key per call when the caller supplies none [src/index.ts:createClient]
- Reconnect backoff defaults to 50 ms doubling to 2000 ms [src/index.ts:createClient]

## Side Effects
- Durable writes through the runtime service: start, cancel, state updates, continuation resolution [src/index.ts:createClient]
- Timers for reconnect/backoff sleeps cancelled by the caller's signal [src/index.ts:sleep]
- Random idempotency keys via `crypto.randomUUID()` [src/index.ts:createClient]

## Verification
- Run: `cd packages/client && bun test`
