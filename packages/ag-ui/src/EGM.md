# ag-ui / src — AG-UI 1.0.0 interoperability adapter

## Overview

Projects durable Cognate events into schema-valid AG-UI events in one direction only: AG-UI never becomes the internal event model `[index.ts:matrix]`. Inbound AG-UI actions pass through `RuntimeService` with the caller the transport authenticated, never with an identity taken from the wire body `[index.ts:createAgUiHandler]`. A single Express-free handler answers `POST` of a `RunAgentInput` with an SSE stream, including cursor reconnect and full resync `[index.ts:createAgUiHandler]`.

## Interface

- `matrix` — one `MatrixRow` per AG-UI 1.0.0 `EventType`, each with `direction`, `supported`, and a `note` naming the framework source `[index.ts:matrix]`
- `ignoredFrameworkEvents` — framework event types deliberately not projected `[index.ts:ignoredFrameworkEvents]`
- `createProjector` — stateful per-run fold exposing `push`, `snapshot`, and `stateOnly` `[index.ts:createProjector]`
- `threadCorrelationId` — maps a thread to `agui-thread:<threadId>` `[index.ts:threadCorrelationId]`
- `createAgUiHandler` — the request handler built from `EndpointOptions` `[index.ts:createAgUiHandler]`
- `EndpointOptions` — `service`, `authenticate`, and `defaultAgent` `[index.ts:EndpointOptions]`
- `AgUiEvent` — a plain event object whose `rawEvent.cognate` carries `{ eventId, position, runId }` `[index.ts:AgUiEvent]`

## Invariants

- Text deltas are bracketed by `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END`, and an open message is closed before any non-delta projection `[index.ts:createProjector]`
- Agent, cancel, resolve, and cursor are read only from `forwardedProps.cognate`, never from message content `[index.ts:cognateProps]`
- A missing authenticated caller returns 401 before any service call, and a body failing `RunAgentInputSchema` returns 400 with issues `[index.ts:createAgUiHandler]`
- A cursor is honoured only when `0 <= cursor <= maxPosition`; otherwise the stream resyncs from `RUN_STARTED` `[index.ts:createAgUiHandler]`
- Only continuations of kind `human_approval` or `frontend_capability` project to client tool calls `[index.ts:SUPPORTED_CONTINUATION_KINDS]`
- A run is started with idempotency key `agui:<threadId>:<runId>`, so a retried POST cannot start a second run `[index.ts:createAgUiHandler]`
- Inbound tool results accept either a full continuation id or a bare remote id, and an unknown id still fails closed through the service lookup `[index.ts:createAgUiHandler]`

## Side Effects

- SSE encoding through `@ag-ui/encoder`'s `EventEncoder`, one `ReadableStream` per response `[index.ts:sseResponse]`
- Live following of `service.events(..., { follow: true })` until the request signal aborts `[index.ts:createAgUiHandler]`
- Cancelling the HTTP body aborts only this projection, never the durable run `[index.ts:liveSseResponse]`
- Inbound user messages start a run, and inbound cancel/resolve call `cancelRun` / `resolveContinuation` with derived idempotency keys `[index.ts:createAgUiHandler]`

## Verification

- Run: `cd packages/ag-ui && bun test`
