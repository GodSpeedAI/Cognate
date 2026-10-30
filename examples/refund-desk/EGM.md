# refund-desk — human-in-the-loop refund approval app

## Overview
A standalone application, not a workspace package: it consumes published
`@godspeedai/cognate-*@0.8.0` packages rather than a source checkout. A support agent
looks up an order, and refunds at or below `APPROVAL_THRESHOLD_CENTS` complete
immediately while larger ones suspend on a durable human-approval continuation. All
progress is written to a durable event log, and business state is rebuilt from it on
startup.

## Interface
- `dev` — runs the HTTP front with `bun src/server.ts` `[examples/refund-desk/package.json:scripts.dev]`
- `test` — `bun test` `[examples/refund-desk/package.json:scripts.test]`
- `typecheck` — `tsc -p tsconfig.json` `[examples/refund-desk/package.json:scripts.typecheck]`
- `APPROVAL_THRESHOLD_CENTS` — `5000`, the auto-approve ceiling `[examples/refund-desk/src/refund-desk.ts:APPROVAL_THRESHOLD_CENTS]`
- `AGENT_ID` — `"agent.refund-desk"` `[examples/refund-desk/src/refund-desk.ts:AGENT_ID]`
- `createRefundDesk` — builds runtime, components, client, and replays history `[examples/refund-desk/src/refund-desk.ts:createRefundDesk]`
- `RefundDeskOptions` — the only option is `store`, a `RuntimeStoreConfig` `[examples/refund-desk/src/refund-desk.ts:RefundDeskOptions]`
- Subdirectories: [./src/EGM.md](./src/EGM.md) — the desk implementation and its HTTP front
- domain/ — `refund-desk.sea`, the semantic model whose bound ids become capabilities
- test/ — `refund-desk.test.ts`, the acceptance suite

## Invariants
- Refunds above the threshold must open a `refund-approval` continuation via `ctx.waitFor` and suspend; nothing is held in memory `[examples/refund-desk/src/refund-desk.ts:refundAgent]`.
- Only the two explicitly bound semantic ids become capabilities; any other id throws `unknown semantic id` `[examples/refund-desk/test/refund-desk.test.ts:bindCapabilities]`.
- Amounts must be positive integers within the refundable remainder, else the run emits `refund.rejected` with reason `exceeds_refundable` `[examples/refund-desk/src/refund-desk.ts:refundable]`.
- Capability issuance is idempotent per `refundId`, so a resumed run cannot double-credit an order `[examples/refund-desk/src/refund-desk.ts:issue]`.
- Business state is reconstructed by folding every `refund.issued` event before any new run starts `[examples/refund-desk/src/refund-desk.ts:for await]`.
- The caller identity is a hard-coded demo principal; authorization is permissive by design `[examples/refund-desk/src/refund-desk.ts:CALLER]`.

## Side Effects
- The SQLite store and its parent directory are created on startup `[examples/refund-desk/src/server.ts:mkdir]`.
- Binds `127.0.0.1` on `PORT` (default 3210) and prints the URL `[examples/refund-desk/src/server.ts:port]`.
- Reads `domain/refund-desk.sea` from disk at construction `[examples/refund-desk/src/refund-desk.ts:loadCommerceContracts]`.
- `close()` shuts down the client and then the runtime `[examples/refund-desk/src/refund-desk.ts:close]`.

## Verification
- Run: `cd examples/refund-desk && bun test`
- Run: `cd examples/refund-desk && bun run typecheck`
