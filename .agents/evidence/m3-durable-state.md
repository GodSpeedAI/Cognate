# M3 durable state — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run from the repository root by the orchestrator (not only by the implementing agent).

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/events/test/envelope.test.ts` | 16 pass, 0 fail | CG-EVT-001 envelope validation and fingerprints |
| 2026-09-24 | `bun test ./packages/store-memory` ×3 | 23 pass, 0 fail each run | CG-EVT-005: store conformance kit (non-persistent sections) + copy isolation |

Limits: the memory store is a reference double; it has no durability section by design (`persistent: false`).
| 2026-09-24 | `bun test ./packages/store-sqlite ./tests/integration/crash.test.ts ./packages/projections` ×3 | 40 pass, 0 fail each run | CG-EVT-002/003/004 (SQLite conformance incl. reopen durability, erasure file scrub), CG-EVT-006 (5 SIGKILL rounds on 500-event decisions: all-or-nothing, `integrity_check` ok; committed-then-killed decision replays as duplicate), CG-PRJ-001 on both stores |
| 2026-09-24 | `bun test ./tests/integration/rebuild.test.ts` | 1 pass | CG-PRJ-002: `DELETE FROM projection_state; DELETE FROM projection_checkpoints` on the SQLite file, reopen, rebuild → identical state |
| 2026-09-24 | `bun test ./tests/properties/replay.property.test.ts` (60 fast-check runs) | first run FAILED; fixed; now 1 pass | CG-PRJ-003. Counterexample `[[{s1,c,0},{s1,a,0}],1]` exposed unspecified `listProjection` order (memory: insertion; SQLite: key). Contract revised: listings ordered by key/id in code-point order; kit test added; memory store fixed. |
| 2026-09-24 | `bun test ./tests/architecture` | 9 pass | CG-ARC-001 dependency direction, owners, manifests, acyclicity |

Durability settings observed in `packages/store-sqlite/src/index.ts`: WAL, `synchronous=FULL`, `secure_delete=ON`, `BEGIN IMMEDIATE` per decision; erasure checkpoints the WAL (TRUNCATE).
