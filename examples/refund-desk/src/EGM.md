# src — refund desk implementation and HTTP front

## Overview
Two files. `refund-desk.ts` holds the runtime wiring: the semantic-model load, the
`commerce` and `notifications` components, the refund agent, and the desk API used by
tests and the server. `server.ts` is a thin `Bun.serve` front over that API with no
business logic of its own.

## Interface
- `createRefundDesk(options)` — returns `{ orders, ledger, receipts, propose, status, decide, history, close }` `[examples/refund-desk/src/refund-desk.ts:createRefundDesk]`
- `propose(orderId, amountCents)` — starts a run with a random `idempotencyKey` and returns its `runId` `[examples/refund-desk/src/refund-desk.ts:propose]`
- `status(runId)` — the client's current run view, including open continuations `[examples/refund-desk/src/refund-desk.ts:status]`
- `decide(continuationId, approved, by)` — resolves the continuation with `"resume"` `[examples/refund-desk/src/refund-desk.ts:decide]`
- `history(runId)` — the durable event log for one run, in stream order `[examples/refund-desk/src/refund-desk.ts:history]`
- `loadCommerceContracts` — loads the `.sea` model and binds `orders.lookup` / `refunds.issue` `[examples/refund-desk/src/refund-desk.ts:loadCommerceContracts]`
- `commerceComponent` — provides the two bound capabilities over an in-memory order map `[examples/refund-desk/src/refund-desk.ts:commerceComponent]`
- `notificationsComponent` — a fake outbox that provides `notify.receipt` `[examples/refund-desk/src/refund-desk.ts:notificationsComponent]`
- `refundAgent` — the `AgentDefinition` implementing lookup, validation, approval, issue, and receipt `[examples/refund-desk/src/refund-desk.ts:refundAgent]`
- Routes: `GET /orders`, `GET /receipts`, `POST /refunds`, `GET /runs/:id`, `GET /runs/:id/history`, `POST /approvals/:id` `[examples/refund-desk/src/server.ts:fetch]`

## Invariants
- The permission policy lists exactly `orders.lookup`, `refunds.issue`, and `notify.receipt`; anything else is denied by default `[examples/refund-desk/src/refund-desk.ts:allowCapabilities]`.
- A denied approval emits `refund.denied` and returns without ever invoking `refunds.issue` `[examples/refund-desk/src/refund-desk.ts:refundAgent]`.
- A receipt is only sent after `refund.issued`, so a denied run produces no receipt `[examples/refund-desk/src/refund-desk.ts:refundAgent]`.
- `POST /refunds` returns `202` with a `runId` because the run starts asynchronously `[examples/refund-desk/src/server.ts:/refunds]`.
- Unknown paths return `{ error: "not_found" }` with `404`, and any handler throw is serialized as `400` `[examples/refund-desk/src/server.ts:not_found]`.

## Side Effects
- Creates the store's parent directory before constructing the desk `[examples/refund-desk/src/server.ts:mkdir]`.
- Binds `127.0.0.1` on `PORT` (default 3210) `[examples/refund-desk/src/server.ts:Bun.serve]`.
- `createRefundDesk` reads `../domain/refund-desk.sea` from disk `[examples/refund-desk/src/refund-desk.ts:readFile]`.
- Streams the durable log at startup with `follow: false` and folds prior refunds `[examples/refund-desk/src/refund-desk.ts:events]`.

## Verification
- Run: `cd examples/refund-desk && bun test`
- Run: `cd examples/refund-desk && bun run typecheck`
