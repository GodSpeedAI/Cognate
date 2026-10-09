# @godspeedai/cognate-a2a

Publishes a Cognate runtime agent as an [A2A](https://a2a-protocol.org) agent: one `fetch` handler that serves the agent card and a JSON-RPC `SendMessage` endpoint backed by durable runs.

**When to use this package:** an external A2A client (another agent, a broker, a UI) should be able to discover and talk to your Cognate agent. For AG-UI front ends use [`@godspeedai/cognate-ag-ui`](https://www.npmjs.com/package/@godspeedai/cognate-ag-ui) instead; for plain HTTP/Connect clients use [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun).

The adapter targets `@a2a-js/sdk` 1.2.1 with the v1.0 proto-JSON wire format (the `TASK_STATE_*` / `ROLE_*` enum wire values). It implements the JSON-RPC transport directly against the SDK's own codecs, so every shape on the wire is exactly what the SDK's `Client` sends and expects.

## Installation

```sh
bun add @godspeedai/cognate-a2a
```

Requires [Bun](https://bun.sh) >= 1.4.0. Depends on `@a2a-js/sdk` and the `RuntimeService` types from [`@godspeedai/cognate-runtime-api`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-api); you will typically also want [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) to have a runtime to serve.

## Quick start

```ts
import { createA2AHandler } from "@godspeedai/cognate-a2a";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const runtime = await createRuntime({
  store: "./app.sqlite",
  agents: [/* your AgentDefinitions, including "agent.refund" */],
  policy,
  actions,
});

const handler = createA2AHandler({
  service: runtime.service,
  agent: "agent.refund", // the runtime agent id this card serves
  baseUrl: "https://agents.example.com", // written into the agent card
  card: {
    name: "Refund agent",
    description: "Approves refunds with a human in the loop",
    version: "1.0.0",
    skills: [{ id: "refund", name: "Refund", description: "Process a refund request" }],
  },
  authenticate: (headers) => myBearerAuth(headers), // Caller | undefined | Promise<Caller>
});

Bun.serve({ port: 8080, fetch: handler });
```

An A2A client then discovers `GET /.well-known/agent-card.json` (no auth required) and sends `POST /a2a` JSON-RPC `SendMessage` requests. Using the SDK's own client:

```ts
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";

const authenticatedFetch = (input, init) =>
  fetch(input, { ...init, headers: { ...init?.headers, authorization: "Bearer alice" } });
const client = await new ClientFactory({
  transports: [new JsonRpcTransportFactory({ fetchImpl: authenticatedFetch })],
}).createFromUrl("https://agents.example.com");

const first = await client.sendMessage({
  message: { messageId: "m1", contextId: "", taskId: "", role: 1, parts: [{ content: { $case: "text", value: "refund order 7" }, metadata: undefined, filename: "", mediaType: "" }], metadata: undefined, extensions: [], referenceTaskIds: [] },
});
// first.status.state === TASK_STATE_INPUT_REQUIRED — the run waits for a human decision

const second = await client.sendMessage({
  message: { messageId: "m2", contextId: "", taskId: first.id, role: 1, parts: [{ content: { $case: "text", value: "yes" }, metadata: undefined, filename: "", mediaType: "" }], metadata: undefined, extensions: [], referenceTaskIds: [] },
});
// second.status.state === TASK_STATE_COMPLETED, with the run output as a data artifact
```

## How tasks map to runs

- The A2A task id **is** the Cognate run id.
- A message without a `taskId` starts a new run (idempotent on the message id); its text becomes the run input as `{ text }`.
- A message with a `taskId` resolves that run's open continuation, passing the message text (idempotent on the message id).
- Run status maps to task state: `running` → `WORKING`, `waiting` → `INPUT_REQUIRED`, `completed` → `COMPLETED`, `failed` → `FAILED`, `cancelled` → `CANCELED`.
- A completed task returns the run output as a `data` artifact named `output`.
- Requests without valid credentials get HTTP 401.

## Limitations

- `SendMessage` is the only JSON-RPC method implemented; other methods answer with a "method not found" error. There is no streaming/notification surface.
- The handler waits up to five seconds for the run to settle before replying; a longer-running run replies with its current state (`WORKING`), and the client polls `SendMessage` with the task id to drive it forward.
- A run waiting on a continuation type with no faithful task representation still surfaces as `INPUT_REQUIRED`; the continuation payload is not rendered into the task message.

## Related packages

- [`@godspeedai/cognate-ag-ui`](https://www.npmjs.com/package/@godspeedai/cognate-ag-ui) — SSE endpoint for AG-UI front ends over the same service.
- [`@godspeedai/cognate-protocol-connect-bun`](https://www.npmjs.com/package/@godspeedai/cognate-protocol-connect-bun) — Connect transport for the runtime service.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the runtime serving your agents.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
