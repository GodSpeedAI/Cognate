# mcp — runtime capabilities as MCP tools

## Overview
A component provides the `billing.quote` capability, and `createMcpServer` exposes
that capability to an MCP client as a tool. The client lists and calls the tool over
an in-memory transport, so the call travels through the same runtime policy as any
other capability invocation.

## Interface
- `createMcpServer` — builds the server from `{ service, caller, tools }` where `caller` is `{ actor: { id: "alice", kind: "agent" }, tenant: "tenant-a" }` `[examples/mcp/index.ts:createMcpServer]`
- `tools` — array entries of `{ capability, description, inputSchema }` mapping the MCP tool name to a capability id `[examples/mcp/index.ts:tools]`
- `runtime` `components` — inline component declaring `provides: [{ id: "billing.quote", version: "1.0.0" }]` and providing it in `activate` `[examples/mcp/index.ts:createRuntime]`
- `InMemoryTransport.createLinkedPair` — the linked server/client transport pair `[examples/mcp/index.ts:InMemoryTransport]`
- `Client` — the SDK client with `connect`, `listTools`, `callTool`, and `close` `[examples/mcp/index.ts:Client]`
- `Bun.resolveSync` — resolves the `@modelcontextprotocol/sdk` client and in-memory paths relative to `packages/mcp` `[examples/mcp/index.ts:clientPath]`

## Invariants
- The listed tool names must equal exactly `"billing_quote"`, so tool naming derives from the capability id `[examples/mcp/index.ts:listed]`.
- Policy denies actor `mallory` and allows everyone else, so tool exposure is per-caller rather than global `[examples/mcp/index.ts:policy]`.
- `billing_quote` called with `{ amount: 21 }` must return a non-error result whose parsed `total` is `42` `[examples/mcp/index.ts:ok.content]`.
- The runtime registers `agents: []`; the only invocation path is the MCP tool call `[examples/mcp/index.ts:createRuntime]`.

## Side Effects
- No network: the transport pair is in-memory `[examples/mcp/index.ts:InMemoryTransport]`.
- `finally` closes the client, the server, then the runtime in that order `[examples/mcp/index.ts:finally]`.

## Verification
- Run: `bun run example:mcp`
