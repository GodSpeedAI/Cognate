# ag-ui

## Overview

Blueprint directory for `@godspeedai/cognate-ag-ui`, the AG-UI 1.0.0 interoperability adapter `[packages/ag-ui/package.json:description]`. Outbound, durable Cognate events become schema-valid AG-UI events; inbound, AG-UI actions pass through the runtime service carrying the transport's authenticated caller rather than the wire body's identity, and AG-UI never becomes the internal event model `[packages/ag-ui/src/index.ts:createProjector]`. The only public entrypoint is `./src/index.ts` `[packages/ag-ui/package.json:exports]`.

## Subdirectories & Boundaries

- src/: [./src/EGM.md](./src/EGM.md) — the adapter module `index.ts`
- test/ — behavior tests for this package; not a source boundary
- No child `EGM.md` exists under this package.

## Global Invariants

- The compatibility matrix carries one row per AG-UI 1.0.0 `EventType` (all 31), each marked `outbound`, `inbound`, or `none` with its framework source or the reason it is unsupported `[packages/ag-ui/src/index.ts:matrix]`
- Five framework events are ignored rather than reinterpreted: `run.step.completed`, `run.resumed`, `run.wait.closed`, `run.recall`, `run.remote_offers` `[packages/ag-ui/src/index.ts:ignoredFrameworkEvents]`
- A wait projects as supported only when every open continuation's kind is `human_approval` or the frontend-capability kind; otherwise the run finishes as `waiting_unsupported` `[packages/ag-ui/src/index.ts:SUPPORTED_CONTINUATION_KINDS]`
- Unparseable JSON yields HTTP 400, a failed `RunAgentInputSchema` parse yields HTTP 400 with issues, and a missing authenticated caller yields HTTP 401 `[packages/ag-ui/src/index.ts:createAgUiHandler]`
- An unusable cursor (`forwardedProps.cognate.cursor` outside `0..maxPosition`) forces a full resync instead of replaying from an unknown position `[packages/ag-ui/src/index.ts:createAgUiHandler]`
- Thread-to-run routing uses the runtime's run index by correlation id `agui-thread:<threadId>`, never a scan of the event log `[packages/ag-ui/src/index.ts:resolveRunId]`
- Cancelling the HTTP body aborts only the projection; the durable run is untouched `[packages/ag-ui/src/index.ts:liveSseResponse]`

## Global Side Effects

- Long-lived SSE HTTP responses streaming AG-UI events `[packages/ag-ui/src/index.ts:createAgUiHandler]`
- Runtime service reads and subscriptions: `startRun`, `cancelRun`, `resolveContinuation`, `listRuns`, `listContinuations`, `events` `[packages/ag-ui/src/index.ts:createAgUiHandler]`
- Deterministic idempotency keys per thread/run/continuation so a repeated action dedupes `[packages/ag-ui/src/index.ts:createAgUiHandler]`

## Verification

- Run: `cd packages/ag-ui && bun test`
