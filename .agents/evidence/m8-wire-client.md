# M5/M8/M9 wire, client, React, MCP — observed gates

Environment: Bun 1.4.0, @bufbuild/protobuf 2.15.0, @connectrpc/connect(-web) 2.2.0, buf 1.73.0, protoc-gen-es 2.15.0, React 19.3.0, MCP SDK 1.30.1. Commands run by the orchestrator from the repository root after the implementing agents were interrupted by a usage limit (2026-09-24); the orchestrator completed and verified their work.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./tests/integration/second-process.test.ts` | 1 FAIL | Test defect (orchestrator's): child passed raw JSON where protobuf-es v2 generated `google.protobuf.Value` messages are required; fixed with `fromJson(ValueSchema, …)`. |
| 2026-09-24 | same ×3 after fix | 1 pass each | CG-WIR-002: a separate Bun process with the generated client starts a run, sees it wait, resolves its continuation, and follows its event stream to `run.completed`. |
| 2026-09-24 | `bun test ./packages/mcp ./packages/proto ./packages/protocol-connect ./packages/protocol-connect-bun` ×3 | 38 pass, 0 fail each run | CG-WIR-001 byte-identical regeneration equal to committed bindings, only unary/server-streaming methods; CG-WIR-003 the full service kit over Connect in JSON and binary (incl. restart); CG-WIR-004 auth 401, body size, JSON depth, malformed input, server deadline; CG-MCP-001 tools listed with JSON Schema, authorized invocation, denied → isError with code, and across processes over stdio (closes DEBT-013). |
| 2026-09-24 | `bun test ./packages/react` | 1 FAIL | Test defect (orchestrator's): `screen` from Testing Library binds to `document` at import time, before happy-dom registers; switched to render-bound queries. The implementing agent's `setup-dom.ts`/unregister edits were reviewed and kept (no assertion changes). |
| 2026-09-24 | `bun test ./packages/react ./packages/client` ×3 | 8 pass, 0 fail each run | CG-CLT-001 derived run state, frontend capabilities as continuations, reconnect without gaps/duplicates, no React dependency; CG-UI-001 hooks drive streamed text, approval, frontend capability, projection, artifact; useCapability unregisters on unmount. |
| 2026-09-24 | `bun test ./tests/architecture/dependencies.test.ts` (client and react now exist) | 6 pass | CG-UI-003: no React/Astryx edge from client, no Astryx edge from react; engine owners; acyclic. |
