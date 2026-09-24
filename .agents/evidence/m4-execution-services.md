# M4 execution services — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/capabilities ./packages/artifacts ./tests/properties/containment.property.test.ts` ×3 | 16 pass, 0 fail each run | CG-CAP-001 selection + explanation recorded; CG-CAP-002 containment (300 fast-check runs with adversarial rankers); CG-COG-006 outcome feedback durable before ranking, rebuildable; CG-ART-001 artifacts on memory and SQLite |
