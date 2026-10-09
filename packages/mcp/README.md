# @godspeedai/cognate-mcp

Exposes runtime capabilities as MCP tools (`@modelcontextprotocol/sdk` 1.30.1).

`createMcpServer({ service, caller, tools })` — one tool per binding (name defaults to the capability id with `.` → `_`), advertising the binding's JSON Schema. Calls go through `RuntimeService.invoke` as the connection's authenticated caller, so kernel policy applies; ServiceErrors return `isError: true` with `<code>: <message>`.

Proof: `test/mcp.test.ts` (CG-MCP-001) over the in-memory transport and across processes over stdio.
