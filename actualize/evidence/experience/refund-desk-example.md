# examples/refund-desk verification (2026-10-15)

Scope: standalone example at `examples/refund-desk/` consuming published `@godspeedai/cognate-*@0.5.0`
packages (added `@godspeedai/cognate-domainforge@0.5.0`). No edits to `packages/`, `landing/`, root
`README.md`, `docs/`, `.agents/`, or root `package.json`. Nothing committed or pushed.

## Clean-copy verification (in `examples/refund-desk`, `node_modules` removed first)

| Command | Exit | Output (key lines) |
|---|---|---|
| `rm -rf node_modules .cognate && bun install` | 0 | 25 packages installed; `bun.lock` written |
| `bun run typecheck` | 0 | `tsc -p tsconfig.json` clean |
| `bun test` | 0 | `7 pass`, `0 fail`, `28 expect() calls` |
| `domainforge validate --format human domain/refund-desk.sea` | 0 | `Validation succeeded: 0 violations total` (CLI 0.19.0) |
| `bun run dev` (smoke) | 0 (stopped by SIGTERM) | `refund desk listening on http://127.0.0.1:3210`; `GET /orders` HTTP 200 |

Test names: domain model loads; small refund completes; large refund waits for approval; approval completes it;
denial refunds nothing; history records each step; (f) refunds survive a restart.

## HTTP flow (fresh store, `bun run dev`)

- small refund 1002 $30: run completed, `refund.auto_approved` path, receipt sent.
- large refund 1003 $75: run `waiting`, continuation `...wait.approve-refund` (poll until `waiting`; first read was `running`).
- approve: continuation `RESUMED`, run `completed`, output `refunded`.
- history: run.started, run.invocation, refund.proposed, refund.awaiting_approval, continuation.opened, run.waiting,
  continuation.resumed, run.resumed, refund.approved, run.invocation, refund.issued, run.invocation, run.completed.
- orders: 1001 0, 1002 3000, 1003 7500. receipts: 2.
- restart (server stopped, started on same store): orders restored 1001 0, 1002 3000, 1003 7500.
- restart probe: 1 cent on fully refunded 1003 -> `completed`, `{status: rejected, reason: exceeds_refundable, refundable: 0}`.
- `/receipts` after restart: 0 (in-memory by design).
- Unknown route: HTTP 404.

Requests were sent through the context sandbox shell (`ctx_execute`), which runs the README's curl commands.

## Mutation checks (each must fail its tests; source restored, diff identical)

| Mutation | Result |
|---|---|
| `APPROVAL_THRESHOLD_CENTS = 10000` | 5 fail (large refund waits, approval completes, denial, history, restart) |
| restore fold disabled (`if (true) continue;`) | 1 fail: restart test |
| denial ignored (`if (false)`) | 1 fail: denial refunds nothing |
| receipt invoke removed | 1 fail: small refund completes |

## Root checks (repo root, `examples/refund-desk` not in workspaces or tsconfig include)

| Command | Exit | Output |
|---|---|---|
| `bun run typecheck` | 0 | `tsc -p tsconfig.json` |
| `just docs` | 0 | `check-readmes: 45 published packages checked`, `OK` |
| `bun run check` | 0 | `Substrate check passed: 81 requirements (81 implemented, 0 blocked, 0 candidate)` |

## Friction found

- F-6 (fixed): orders' `refundedCents` and the ledger are rebuilt from `refund.issued` on `createRefundDesk`.
  Idempotent on `refundId`, so a run resumed at startup cannot double-count.
- F-3 (handled in test): test creates the SQLite parent directory before opening the store.
- F-15 (new): installed DomainForge CLI 0.19.0 rejects `Policy name per Constraint Obligation as:` (syntax error at
  `per`), even with the header on its own line. The plain `Policy name as:` form validates. The skill reference
  describes the `per` form.
- Known limit: a crash between `refunds.issue` and `refund.issued` is not restored (documented in README).
- Projection not used: projections are asynchronous; the refund check reads state synchronously in-process.

## Extension (Beat G)

`notify.receipt` implemented (fake in-memory outbox, invoked after `refund.issued`, listed in the permission policy,
`GET /receipts`) and covered by the "small refund completes" test. Implemented within the time box.
