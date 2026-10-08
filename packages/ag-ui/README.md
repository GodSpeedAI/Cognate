# @godspeedai/ag-ui

AG-UI 1.0.0 interoperability adapter (spec §24, §31.8, §32; ADR-0008). An
optional boundary, not the internal event model: native Cognate execution
and UI work unchanged if this package is removed (spec §40.H).

- `createProjector` folds a run's durable event stream into schema-valid
  AG-UI events (bracketed text messages, tool calls, state snapshots/deltas,
  continuation CUSTOM events, RUN_FINISHED/RUN_ERROR).
- `createAgUiHandler` is an HTTP endpoint: POST `RunAgentInput` → SSE stream.
  Actions (start, resolve a continuation, cancel) go through
  `RuntimeService` with the transport-authenticated caller. A valid
  `forwardedProps.cognate.cursor` resumes with `STATE_SNAPSHOT` + newer
  events; an unknown/expired cursor triggers a full resync
  (`RUN_STARTED`, `MESSAGES_SNAPSHOT`, `STATE_SNAPSHOT`, …). Disconnecting
  never cancels the durable run.

## Compatibility matrix (`matrix`, `ignoredFrameworkEvents`)

All 31 AG-UI 1.0.0 `EventType` values are covered, one row each:

- **Supported (outbound):** `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`,
  `TEXT_MESSAGE_*` (not `_CHUNK`), `TOOL_CALL_*` (not `_CHUNK`),
  `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`, `CUSTOM`.
- **Unsupported (none):** the `_CHUNK` shorthands, `ACTIVITY_*`, `RAW`,
  `STEP_*`, `REASONING_*`, `SUBAGENT_*` — Cognate has no matching concept
  yet; each row's `note` says why.
- `TOOL_CALL_ARGS` carries the recorded invocation input (`run.invocation`
  payload `input`; `{}` after that payload is erased).

`ignoredFrameworkEvents` lists Cognate event types deliberately not
projected: `run.step.completed`, `run.resumed`, `run.wait.closed`,
`run.recall` (replay/determinism bookkeeping). Artifacts are projected as
`CUSTOM` `cognate.artifact` events (AG-UI 1.0.0 has no artifact event).

## Continuation mapping

A `frontend_capability` continuation (or `type: "frontend:<capability>"`,
runtime-api's convention) becomes `TOOL_CALL_START/ARGS/END` with
`toolCallId` = the continuation id. A `human_approval` continuation becomes
`CUSTOM "cognate.continuation"`. Any other kind (e.g. `oauth_callback`) has
no faithful AG-UI representation and becomes
`CUSTOM "cognate.unsupported_interaction"`, and the run's `RUN_FINISHED`
reports `status: "waiting_unsupported"` instead of `"waiting"`.
