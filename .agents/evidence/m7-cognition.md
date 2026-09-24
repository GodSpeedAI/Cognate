# M7 cognition — observed gates

Environment: Bun 1.4.0, Linux x64 (WSL2). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/cognitive-api/test/indexer.test.ts` (new restart test) | 3 pass, 1 FAIL before fix | Found by orchestrator review: the event→entry map lived in a closure, so erasure after a restart left erased entries indexed (§32). |
| 2026-09-24 | `bun test ./packages/cognitive-api ./packages/cognitive-memory` ×3 after fix | 20 pass, 0 fail each run | CG-COG-001 memory index conformance + embedder + graph traversal; CG-COG-002 recall filters tenant/scope, authorizes each dereference, leaks no restricted title/count/provenance, content only from the resolver; CG-COG-005 degraded result or typed error when required; indexer rebuild parity and erasure (including after restart; mapping now durable projection state). |

Limit: the hashing embedder is lexical, not semantic; semantic embedding comes from a model provider capability.
