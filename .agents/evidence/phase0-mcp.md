# Phase 0 evidence — MCP — 2026-09-24

Environment: Bun 1.4.0, Linux (WSL2). Scope: `compatibility/phase0/mcp/`,
an isolated fixture with its own `package.json`/lockfile per the spec
(§38 optional interoperability; §6 "Optional protocols").

| Command | Exit | Observed result |
| --- | --- | --- |
| `bun install` (in `compatibility/phase0/mcp/`) | 0 | 93 packages installed: `@modelcontextprotocol/sdk@1.30.1`, `zod@3.25.76`, plus transitive deps (ajv, express-adjacent HTTP/transport helpers pulled in by the SDK). |
| `bun test mcp.test.ts` | 0 | 2 pass, 0 fail, 5 `expect()` calls. |

## Per-behaviour results

| Behaviour | Result | Notes |
| --- | --- | --- |
| Create an MCP server with one tool | PASS | `McpServer` + `registerTool("echo", { inputSchema: { text: z.string() } }, handler)`. |
| In-memory/linked transport | PASS | `InMemoryTransport.createLinkedPair()`; client and server both `connect()` (awaited together — see API_NOTES.md for why). |
| Client lists the tool | PASS | `client.listTools()` returns `{ tools: [{ name: "echo", description, inputSchema }] }`. |
| Client calls the tool | PASS | `client.callTool({ name: "echo", arguments: { text: "cognate" } })` returns `{ content: [{ type: "text", text: "COGNATE" }] }`. |
| Invalid tool input is rejected | PASS | A wrong-typed argument (`text: 42`) does not throw; it surfaces as `{ isError: true, content: [...] }` with an "Invalid arguments" message — recorded as an `observed:` behaviour in API_NOTES.md and asserted in the test, not skipped. |

No behaviour in scope failed. `API_NOTES.md` in the fixture directory
carries the verified subpath imports and the exact shapes involved.

## Limits / what this fixture does not prove

- Only the in-memory transport was exercised. Real stdio and HTTP
  transports (`server/streamableHttp.js`, `client/sse.js`) were not
  proven under Bun.
- Resources, prompts, and the `experimental/tasks` streaming tool-call
  path were not exercised — out of scope for "one tool, list and call
  it."
- The alternative JSON-schema/ajv validation path (`./validation`,
  `./validation/ajv`) that ships alongside zod support was not evaluated.

## Open questions

- Whether Cognate's eventual `packages/mcp` adapter needs a real
  stdio/HTTP transport fixture before claiming MCP server support beyond
  in-process composition.
