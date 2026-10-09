# @godspeedai/cognate-a2a

Publishes a runtime agent as an A2A agent (`@a2a-js/sdk` 1.2.1, protocol v1.0 proto-JSON wire format —
`TASK_STATE_*` / `ROLE_*` string enums, not the legacy v0.3 JSON-Schema shapes).

`createA2AHandler({ service, agent, card, authenticate, baseUrl })` returns a `fetch` handler serving:
- `GET /.well-known/agent-card.json` — the agent card (no auth required).
- `POST /a2a` — JSON-RPC `SendMessage`, implemented directly against the SDK's own codecs
  (`SendMessageRequest`/`SendMessageResponse`), since the SDK's `DefaultRequestHandler`/`AgentExecutor`
  framework targets Express, not a stateless `fetch` handler.

A2A task id = Cognate run id. A message without `taskId` calls `startRun` (idempotent on `messageId`); a
message with `taskId` resolves that run's open continuation with the message text (idempotent on `messageId`).
`options.authenticate` gates `/a2a`; missing/invalid credentials return HTTP 401.

State mapping (`RunStatus` → `TaskState`): `running`→`WORKING`, `waiting`→`INPUT_REQUIRED`,
`completed`→`COMPLETED` (output as a `data` artifact), `failed`→`FAILED`, `cancelled`→`CANCELED`.

Proof: `test/a2a.test.ts` (CG-A2A-001), driven by the SDK's real `ClientFactory`/`JsonRpcTransportFactory`.
