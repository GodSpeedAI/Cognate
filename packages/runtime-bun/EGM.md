# runtime-bun — Bun reference runtime

## Overview

`@godspeedai/cognate-runtime-bun` is the reference Bun runtime: it composes kernel, durable store, runs, continuations, commitments, artifacts, and cognition behind `RuntimeService` `[package.json:description]`. The package publishes one entry point, `./src/index.ts` `[package.json:exports]`, whose `createRuntime` delegates to `startRuntime` `[src/index.ts:createRuntime]`. `startRuntime` conjoins a shared `Core` into an in-process service object by calling `createService(core, publicProjections)` and returns it as `Runtime.service` `[src/runtime.ts:startRuntime]`. That object is the implementation of the `RuntimeService` port: `service.ts` imports `RuntimeService`, `ServiceError`, and `ServiceErrorCode` from `@godspeedai/cognate-runtime-api` and returns an object literal typed as `RuntimeService` `[src/service.ts:createService]`. The package's dependency list contains no wire-transport package, so the boundary here is in-process; the published contract is the `runtime-api` port, not a transport `[package.json:dependencies]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — runtime composition, service port implementation, governance, folded run views
- test/: Bun test suite (`async-admission`, `concurrency`, `governance-*`, `sea-forge-*`, `service`, `service-postgres`, `shutdown-recovery`) plus `support.ts`; no EGM.md present
- The exported surface is `index.ts` only; `Core` is declared as the shared internals of one runtime instance and is explicitly not exported from the package `[src/core.ts:Core]`

## Global Invariants

- `RuntimeOptions` requires `store`, `policy`, `actions`, and `agents`; `governance` defaults to `{ mode: "off" }` and `ActionPolicy` is documented default-deny `[src/index.ts:RuntimeOptions]`
- Every service operation authorizes through the governor before acting, and a denial becomes `ServiceError("permission_denied", reason)` `[src/service.ts:createService]`
- Missing and cross-tenant records are indistinguishable: `readRun` and `continuationFor` raise `ServiceError("not_found")` when the tenant does not match `[src/service.ts:readRun]`
- `run.start` commits under an idempotency scope of tenant, actor, and action, with the request seed included in the fingerprint `[src/service.ts:createService]`
- The `Runtime` handle is the lifecycle boundary: `service`, `kernel`, `store`, `inspect`, `rebuildCognition`, `erase`, `pollApprovals`, `idle`, `close` `[src/index.ts:Runtime]`
- A cognition index marked non-persistent forces rebuild on start so a checkpoint never claims entries the index lost `[src/index.ts:CognitionOptions]`

## Global Side Effects

- Durable storage is chosen by `RuntimeStoreConfig`: SQLite path, injected `DurableStore`, `sqlite`, `postgres`, or a pg0-managed `postgresPg0` instance `[src/index.ts:RuntimeStoreConfig]`
- Background work is driven by a safety-net loop with `tickMs` (default 250 ms), and per-run execution admission is bounded by `execution.maxConcurrentRuns` with `resourceKeys` required above capacity one `[src/index.ts:RuntimeOptions]`
- `erase(eventId, reason, actor)` removes an event payload under retention and privacy policy, and derived views and the cognitive index drop it `[src/index.ts:Runtime]`
- Outbox intents supplied by `outboxFor` are committed atomically with each run event `[src/index.ts:RuntimeOptions]`

## Verification

- Run: `cd packages/runtime-bun && bun test`
