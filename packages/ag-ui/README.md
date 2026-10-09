# @godspeedai/cognate-ag-ui

AG-UI 1.0 interoperability adapter: projects a Cognate run's durable event stream as schema-valid AG-UI events over SSE, and maps inbound AG-UI actions (messages, tool results, approvals, cancellation) onto the runtime's `RuntimeService` with the transport-authenticated caller.

**When to use this package:** an [AG-UI](https://docs.ag-ui.com) client (or any SSE consumer speaking the AG-UI event grammar) should drive your Cognate agent. It is an optional boundary — native Cognate execution and UIs work unchanged without it, and Cognate's internal events are never rewritten as AG-UI aliases. For A2A agents see [`@godspeedai/cognate-a2a`](https://www.npmjs.com/package/@godspeedai/cognate-a2a).

## Installation

```sh
bun add @godspeedai/cognate-ag-ui
```

Requires [Bun](https://bun.sh) >= 1.4.0. Depends on `@ag-ui/core`, `@ag-ui/encoder`, and the service types from [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api); pair it with [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) for the runtime itself.

## Quick start

```ts
import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const runtime = await createRuntime({
  store: "./app.sqlite",
  agents: [/* your AgentDefinitions */],
  policy,
  actions,
});

const handler = createAgUiHandler({
  service: runtime.service,
  defaultAgent: "agent.copilot", // agent started for new user messages
  authenticate: (headers) => myBearerAuth(headers), // Caller | undefined
});

Bun.serve({ port: 3000, fetch: handler });
```

A client POSTs an AG-UI `RunAgentInput` and reads the SSE stream:

```ts
const response = await fetch("http://127.0.0.1:3000/", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer alice", accept: "text/event-stream" },
  body: JSON.stringify({
    threadId: "t-1",
    runId: "r-1",
    messages: [{ id: "m1", role: "user", content: "I was double charged" }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  }),
});
// response.body streams AG-UI events: RUN_STARTED, TEXT_MESSAGE_*, STATE_*, RUN_FINISHED, ...
```

Unauthenticated requests get HTTP 401; a `ServiceError` from an inbound action arrives as a `RUN_ERROR` event carrying the service error code.

## Inbound actions

The handler reads intent from the last user/tool message and from `forwardedProps.cognate`:

| Input | Action taken |
| --- | --- |
| last message with `role: "user"` | starts a run of `forwardedProps.cognate.agent` (or `defaultAgent`); message text and `context` become the run input; a non-empty `state` seeds shared state |
| last message with `role: "tool"` | resolves the frontend-capability or remote-offer continuation addressed by `toolCallId` with the parsed `content` |
| `forwardedProps.cognate.resolve` | resolves a continuation (`continuationId`, `action` `"resume"`/`"cancel"`, `input`, optional `expectedVersion`) |
| `forwardedProps.cognate.cancel` | cancels the thread's current run |
| `forwardedProps.cognate.cursor` | resumes the SSE stream from a durable event position |

All runs started for one AG-UI thread share a correlation id, so resolve/cancel/reconnect route to the thread's most recent run even after a server restart. An unknown or expired cursor triggers a full resync (`RUN_STARTED`, `MESSAGES_SNAPSHOT`, `STATE_SNAPSHOT`, then newer events). Disconnecting the HTTP stream never cancels the durable run.

## Continuation mapping

- A frontend-capability continuation (`type: "frontend:<capability>"`) projects as `TOOL_CALL_START`/`ARGS`/`END` with `toolCallId` set to the continuation id; the client's `role: "tool"` message resolves it.
- A `human_approval` continuation projects as a `CUSTOM` event named `cognate.continuation`, self-sufficient for a generic client to resolve via `forwardedProps.cognate.resolve`.
- Continuation kinds with no faithful AG-UI representation project as `CUSTOM` `cognate.unsupported_interaction`, and the run's `RUN_FINISHED` reports `status: "waiting_unsupported"` instead of `"waiting"`.
- Artifacts (AG-UI 1.0 has no artifact event) project as `CUSTOM` `cognate.artifact`.

## Event coverage

`matrix` documents all 31 AG-UI 1.0 `EventType` values, one row each: which are produced outbound (`RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `STATE_SNAPSHOT`/`STATE_DELTA`, `MESSAGES_SNAPSHOT`, `CUSTOM`) and which Cognate cannot produce yet (the `_CHUNK` shorthands, `ACTIVITY_*`, `RAW`, `STEP_*`, `REASONING_*`, `SUBAGENT_*`), each with the reason. `ignoredFrameworkEvents` lists the Cognate event types deliberately not projected.

For direct use, `createProjector({ threadId, runId })` folds ordered durable events into AG-UI events (`push`, plus `snapshot()`/`stateOnly()` for reconnects), and `threadCorrelationId(threadId)` gives the correlation id grouping a thread's runs.

## Limitations

- One adapter, one direction of truth: durable Cognate events are the source; AG-UI output is a projection. Nothing an AG-UI client sends writes history except through `RuntimeService` actions.
- Model text streaming arrives via `TEXT_MESSAGE_*`; there is no reasoning/thinking channel, subagent nesting, or raw event passthrough.
- `TOOL_CALL_ARGS` for a completed invocation carries the recorded invocation input; after that payload is erased it becomes `{}`.

## Related packages

- [`@godspeedai/cognate-react`](https://www.npmjs.com/package/@godspeedai/cognate-react) and [`@godspeedai/cognate-ui-astryx`](https://www.npmjs.com/package/@godspeedai/cognate-ui-astryx) — headless React bindings and reference UI over the same client contracts.
- [`@godspeedai/cognate-a2a`](https://www.npmjs.com/package/@godspeedai/cognate-a2a) — the A2A protocol adapter.
- [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot) — a composed interactive chat application built on this endpoint.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
