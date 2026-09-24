# M3 durable state — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run from the repository root by the orchestrator (not only by the implementing agent).

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/events/test/envelope.test.ts` | 16 pass, 0 fail | CG-EVT-001 envelope validation and fingerprints |
| 2026-09-24 | `bun test ./packages/store-memory` ×3 | 23 pass, 0 fail each run | CG-EVT-005: store conformance kit (non-persistent sections) + copy isolation |

Limits: the memory store is a reference double; it has no durability section by design (`persistent: false`).
