# runtime-api / src — transport-independent runtime contract

## Overview

Defines the transport-independent `RuntimeService` port, the agent authoring surface `RunContext`, the shared-state patch model, the frontend-capability helper, and the runtime service conformance kit `[types.ts:RuntimeService]`. The root entry point re-exports `./types.ts`, `ServiceError`, `InvocationFailedError`, `ContinuationClosedError`, `invokeFrontend`, `FrontendCapabilityError`, `FRONTEND_CAPABILITY`, the state functions and `StatePatchError`, plus the `JsonPatchOp`/`StateUpdate` types `[index.ts:1]`. A second export map publishes `./conformance` at `./src/conformance.ts` `[packages/runtime-api/package.json:exports]`.

## Interface

- `RuntimeService` — the service port; `ServiceError` carries one of nine codes mapped by each transport `[types.ts:ServiceError]`
- `RunContext` — replay-safe agent surface: `step`, `emit`, `invoke`, `artifact`, `waitFor`, `recall`, `state`, `sharedState`, `updateSharedState`, `remoteOffers`, `invokeRemoteOffer` `[types.ts:RunContext]`
- `RunView` / `ContinuationView` / `ProjectionRead` — public read shapes `[types.ts:RunView]`
- `RunStatus` — exactly `running`, `waiting`, `completed`, `failed`, `cancelled` `[types.ts:RunStatus]`
- `Caller` / `RemoteCapabilityOffer` — caller identity and live remote advertisement `[types.ts:Caller]`
- `applyStateUpdate` / `applyJsonPatch` / `foldState` / `StatePatchError` — the shared-state fold `[state.ts:StatePatchError]`
- `invokeFrontend` / `FRONTEND_CAPABILITY` — frontend capability as a durable continuation `[frontend.ts:invokeFrontend]`
- `runtimeServiceConformance` / `kitAgents` — conformance entry point and its fixture agents `[conformance.ts:runtimeServiceConformance]`

## Invariants

- Caller identity comes from the transport's authenticator and never from the request body `[types.ts:Caller]`
- `RunContext` methods are durable and replay-safe: re-entry returns the recorded result under a deterministic step id `[types.ts:RunContext]`
- `recall` returns `{ status: "degraded" }` when cognition is unavailable or unconfigured rather than throwing `[types.ts:RunContext]`
- Cancellation or expiry of a continuation fails the run with `ContinuationClosedError` `[types.ts:ContinuationClosedError]`
- State is the fold of `state.changed` events in store position order, each carrying `{ snapshot }` or an RFC 6902 `{ patch }` `[state.ts:1]`
- A patch operation that cannot apply raises `StatePatchError`, including a failed `test` `[state.ts:StatePatchError]`
- Array `-` is only valid as an append index, and indices must match `^(0|[1-9]\d*)$` `[state.ts:arrayIndex]`
- A projection read's checkpoint is never ahead of its rows `[types.ts:ProjectionRead]`
- `invokeFrontend` resolves through a continuation typed `frontend:<capability>` with condition kind `frontend_capability` `[frontend.ts:invokeFrontend]`
- A frontend result that is absent or not `ok: true` raises `FrontendCapabilityError` `[frontend.ts:invokeFrontend]`

## Side Effects

- No I/O of its own; all durable effects go through the injected `RuntimeService` and store implementations `[types.ts:RuntimeService]`
- The conformance kit registers `afterEach` hooks and asserts against the caller-supplied factory `[conformance.ts:1]`

## Verification

- Run: `cd packages/runtime-bun && bun test`
