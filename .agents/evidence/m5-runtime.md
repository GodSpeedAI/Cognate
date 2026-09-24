# M5 runtime — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/runtime-bun` (first delivery) | 29 pass, 2 fail | The implementer reported a conflict: the kit's support policy denied the test principal `run.start`, contradicting `KitSetup` (deny invocations and continuation actions only). Orchestrator fixed the support file (option a); default-deny `run.start` retained. |
| 2026-09-24 | new `packages/runtime-bun/test/projection-tenancy.test.ts` | 0 pass, 1 FAIL | Orchestrator review found `readProjection` was not tenant-filtered (cross-tenant leak, §32); test written first, then fixed by the implementer (tenant-prefixed partitions). |
| 2026-09-24 | `bun test ./packages/runtime-bun ./tests/integration/{cognitive-rebuild,causality,erasure,secrets}.test.ts` ×3 | 32 pass, 0 fail each run | Service kit in-process on SQLite file (incl. restart survival without repeating recorded steps) and in-memory SQLite; cognition recall across runs, tenant-isolated, rebuilt on start; CG-COG-004 identical authorization/deterministic outcomes before deletion, after deletion, after rebuild; CG-OBS-001 causal chain; CG-SEC-001 erasure across run views and cognition (remaining copies: DEBT-014); CG-SEC-002 no credential bytes in the SQLite files or index. |

Known limits: DEBT-011 (single writer), DEBT-014 (erasure copies), DEBT-015 (polling loop, serial execution). Steps in flight at a crash re-run on restart (at-least-once); external effects belong in CommitmentService.
