# Refund desk (Cognate example)

A support agent proposes a refund for an order. Refunds of **$50 or less** complete automatically.
Refunds **over $50** suspend on a durable human-approval continuation until a person approves or denies them.
Every step is written to Cognate's durable event log. Refunds survive a restart.

This is the answer to the landing page's first request: a small app that a coding agent can build
with Cognate and show working. It is standalone. It consumes the published `@godspeedai/cognate-*@0.5.0`
npm packages, not a Cognate source checkout.

## Prerequisites

- Bun 1.4.0 or later (`bun --version`)
- No API key and no network service. The store is a local SQLite file.

## Commands

```bash
bun install
bun run typecheck   # tsc -p tsconfig.json
bun test            # 7 tests
bun run dev         # HTTP server on http://127.0.0.1:3210 (store: .cognate/refund-desk.sqlite)
domainforge validate --format human domain/refund-desk.sea   # optional: needs the DomainForge CLI on PATH
```

`domainforge` is the DomainForge CLI (`cargo install domainforge-core --features cli --locked`). It is
not an npm dependency. The test "domain model loads" checks the same file through the npm adapter, so the
test suite does not need the CLI.

Expected test output (`bun test`, Bun 1.4.0):

```
domain model loads
small refund completes
large refund waits for approval
approval completes it
denial refunds nothing
history records each step
(f) refunds survive a restart

 7 pass
 0 fail
```

## Try the HTTP flow

Start the server with `bun run dev`, then in another terminal:

```bash
# Small refund: completes at once
curl -s -X POST localhost:3210/refunds -H 'content-type: application/json' -d '{"orderId":1002,"amountCents":3000}'
# -> {"runId": "<small>"}

# Large refund: returns a runId. Poll until status is "waiting" (the run starts asynchronously).
curl -s -X POST localhost:3210/refunds -H 'content-type: application/json' -d '{"orderId":1003,"amountCents":7500}'
curl -s localhost:3210/runs/<large>                       # status "waiting", pendingApprovals[0].id
curl -s -X POST localhost:3210/approvals/<continuationId> -H 'content-type: application/json' -d '{"approved":true,"by":"manager-1"}'
curl -s localhost:3210/runs/<large>                       # status "completed", output.status "refunded"
curl -s localhost:3210/runs/<large>/history               # durable event log for the run
curl -s localhost:3210/orders                             # refundedCents updated
curl -s localhost:3210/receipts                           # receipts sent after refund.issued
```

Seed orders: 1001 ($120), 1002 ($30), 1003 ($75). Amounts are integer cents. `GET /orders` lists them.

Verified: the sequence above was run against a fresh store (small refund completed, large run waited,
approval completed it, history showed `refund.awaiting_approval`, `continuation.opened`, `run.waiting`,
`continuation.resumed`, `refund.approved`, `refund.issued`, `run.completed`). After stopping and restarting
`bun run dev`, `GET /orders` still showed the refunded amounts, and a $0.01 refund on the fully refunded
order 1003 returned `{status: "rejected", reason: "exceeds_refundable", refundable: 0}`.

## How it maps to Cognate

- **Capabilities.** The agent touches orders and money only through `orders.lookup` and `refunds.issue`
  (`ctx.invoke`). A `commerce` component provides them. The contracts come from `domain/refund-desk.sea`
  with `bindCapabilities`: only the bound semantic ids (`refunds::Order`, `refunds::Refund`) become
  capabilities. Unbound model objects do nothing.
- **Permission policy.** `allowCapabilities("refund-desk", [...])` lists the capabilities this agent may
  invoke. Anything else is denied by default. The `notify.receipt` capability is listed too.
- **Human-approval continuation.** Over $50 the agent calls `ctx.waitFor`, which opens a durable
  `refund-approval` continuation and suspends the run. A decision resumes it. Nothing is held in memory,
  so the wait survives a restart.
- **Event log.** Each step is an event (`refund.proposed`, `refund.awaiting_approval`, `refund.approved` or
  `refund.denied`, `refund.issued`, `run.completed`). `GET /runs/<id>/history` returns them in order.

## Domain model

`domain/refund-desk.sea` describes the entities (Customer, Order, Refund), roles (Support agent, Approver,
Customer), the refund flow (`Money` from Order to Customer), and the $50 approval rule as a policy. Two
notes:

- The policy documents the rule. The runtime enforces it in code (`APPROVAL_THRESHOLD_CENTS`).
- The installed DomainForge 0.19.0 CLI rejects the `Policy name per Kind Modality as:` header that the
  skill reference shows. The plain `Policy name as:` form validates.

## Restart behaviour

Business state is restored on startup. `createRefundDesk` replays every `refund.issued` event from the
store, so `refundedCents` and the ledger match the durable log. The refund check then sees earlier refunds.
A projection would be the other option. It was not used, because projections are asynchronous and the
refund check reads state in the same process right after a commit.

## Make it yours: extend it

The receipt is an extension. It is implemented in this app and covered by a test. A coding agent with
the Cognate skill can make the same change from this request:

> Add a `notify.receipt` capability that emails the customer a receipt after `refund.issued`. Bind it to
> the model, add it to the permission policy, test it, and show me the evidence.

What it changed: `notificationsComponent` (a fake in-memory outbox), a `notify.receipt` invoke after
`refund.issued` in the agent, the policy list, `GET /receipts`, and the test "small refund completes" checks
that a receipt is recorded. Receipts are not restored on restart.

## Layout

- `domain/refund-desk.sea`: the domain model (validated by the test and the CLI)
- `src/refund-desk.ts`: runtime, `commerce` and `notifications` components, refund agent, desk API
- `src/server.ts`: minimal `Bun.serve` front
- `test/refund-desk.test.ts`: acceptance checks

## Limits

- The demo caller identity and action policy are hard-coded. A real app must authenticate callers.
- The seed orders and the email outbox are in-memory fakes. Refunds are durable. Orders are not: their
  `refundedCents` is rebuilt from `refund.issued`. A real app keeps orders in its own database.
- A crash between the `refunds.issue` capability call and the `refund.issued` event is not restored. The
  refund ledger is rebuilt only from `refund.issued`.
