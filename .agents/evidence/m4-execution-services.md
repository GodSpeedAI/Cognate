# M4 execution services — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/capabilities ./packages/artifacts ./tests/properties/containment.property.test.ts` ×3 | 16 pass, 0 fail each run | CG-CAP-001 selection + explanation recorded; CG-CAP-002 containment (300 fast-check runs with adversarial rankers); CG-COG-006 outcome feedback durable before ranking, rebuildable; CG-ART-001 artifacts on memory and SQLite |
| 2026-09-24 | `bun test ./packages/events ./packages/continuations ./tests/integration/continuation-restart.test.ts` ×3 | 60 pass, 0 fail each run | CG-CMT-002 outbox dispatcher (backoff 100/200/250 capped, poison, operator requeue, redelivery after lease expiry); CG-CON-001 lifecycle incl. 10-round resume/cancel/expire races with one terminal event; CG-CMT-001 commitments (UNKNOWN never blindly retried for non-idempotent targets; crash-after-DISPATCHING treated as UNKNOWN; manual reconciliation; compensation as a new record); CG-CON-002 child-process open/resume, parent mounts a new handler and receives delivery |
