# a2a

## Overview

Publishes a runtime agent as an A2A protocol v1.0 agent over a stateless `fetch` handler instead of the SDK's Express-oriented server framework, implementing the JSON-RPC wire contract directly with the SDK's own proto-JSON codecs `[src/index.ts:createA2AHandler]`. The package entry point re-exports only `createA2AHandler` and the `A2AAdapterOptions` type, served from `./src/index.ts` [package.json:exports]. It depends on `@a2a-js/sdk` 1.2.1, `@godspeedai/cognate-events`, and `@godspeedai/cognate-runtime-api` [package.json:dependencies].

## Subdirectories & Boundaries

- src/: [src/EGM.md](./src/EGM.md) — the adapter module: agent card route plus `SendMessage` JSON-RPC dispatch over `RuntimeService` `[src/index.ts:createA2AHandler]`
- test/ — `a2a.test.ts` exercise of the handler (not a child contract)

## Global Invariants

- The agent card is served at `/.well-known/agent-card.json` and JSON-RPC at `/a2a`; every other path returns 404 [src/index.ts:AGENT_CARD_PATH]
- Only `SendMessage` is dispatched; any other method returns JSON-RPC error `-32601` with HTTP 404 [src/index.ts:createA2AHandler]
- An unauthenticated request returns JSON-RPC error `-32001` before the body is parsed [src/index.ts:createA2AHandler]
- A2A task id equals the Cognate run id, and an existing `message.taskId` resumes the run's first `OPEN` continuation [src/index.ts:createA2AHandler]
- A run status of `waiting` maps to `TASK_STATE_INPUT_REQUIRED`, so an open continuation surfaces as an input-required task [src/index.ts:mapRunStatus]
- A `waiting` run that still lists the continuation just resumed is not treated as settled [src/index.ts:waitForSettled]

## Global Side Effects

- Wall-clock waiting: polls `getRun` every 10 ms up to a 5 s bound per `SendMessage` call [src/index.ts:waitForSettled]
- Durable writes through the runtime: `startRun` or `resolveContinuation` with the message id as idempotency key [src/index.ts:createA2AHandler]

## Verification

- Run: `cd packages/a2a && bun test`
