# A2A adapter source

## Overview
The whole A2A adapter is this one module: a stateless `fetch` handler that serves an agent card and a `SendMessage` JSON-RPC endpoint over `RuntimeService`. The SDK's Express-oriented server framework is deliberately not used; wire shapes come from the SDK's own proto-JSON codecs (`SendMessageRequest`, `SendMessageResponse`, `TaskState`, `Role`). The package entry is `./src/index.ts` [package.json:exports].

## Interface
- `createA2AHandler(options)` — returns `(request: Request) => Promise<Response>` serving card plus RPC [src/index.ts:createA2AHandler]
- `A2AAdapterOptions` — `service`, `agent`, `card`, `authenticate`, `baseUrl` [src/index.ts:A2AAdapterOptions]
- `mapRunStatus(status)` — maps `RunStatus` onto SDK `TaskState`; module-local [src/index.ts:mapRunStatus]
- `waitForSettled(...)` — bounded polling helper returning the last `RunView`; module-local [src/index.ts:waitForSettled]

## Invariants
- The agent card is served only at `/.well-known/agent-card.json`; RPC lives only at `/a2a` and every other path answers 404 [src/index.ts:AGENT_CARD_PATH]
- An unauthenticated RPC request returns JSON-RPC `-32001` with HTTP 401 before the body is read [src/index.ts:createA2AHandler]
- Only `SendMessage` is dispatched; any other method returns `-32601` with HTTP 404, and an unparsable body returns `-32700` [src/index.ts:createA2AHandler]
- A2A task id equals the Cognate run id; a present `message.taskId` resumes the run's first `OPEN` continuation instead of starting a run [src/index.ts:createA2AHandler]
- `waiting` maps to `TASK_STATE_INPUT_REQUIRED`, so an open continuation surfaces as an input-required task [src/index.ts:mapRunStatus]
- A `waiting` view that still lists the continuation just resumed does not count as settled [src/index.ts:waitForSettled]

## Side Effects
- Durable writes through the runtime: `startRun` or `resolveContinuation`, keyed by the A2A message id [src/index.ts:createA2AHandler]
- Wall-clock waiting: 10 ms poll interval against a 5000 ms bound per `SendMessage` [src/index.ts:WAIT_TIMEOUT_MS]

## Verification
- Run: `cd packages/a2a && bun test`
