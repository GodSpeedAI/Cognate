# MCP SDK Phase 0 notes

Environment: Bun 1.4.0, `@modelcontextprotocol/sdk@1.30.1`, `zod@3.25.76`.

Commands run from `compatibility/phase0/mcp/`:

```
bun install            # exit 0, 93 packages installed
bun test mcp.test.ts   # exit 0, 2 pass / 0 fail, 5 expect() calls
```

## Verified imports (subpath exports, not the package root)

`@modelcontextprotocol/sdk`'s `package.json` exports map has no useful
root (`"."`) export for what this fixture needs; everything is under
subpaths:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
```

`InMemoryTransport` is not under `./server` or `./client` — it lives at
the package's top level (`dist/esm/inMemory.js`), resolved through the
package's `"./*"` wildcard export.

## Server: one tool, registered via `registerTool`

```ts
const server = new McpServer({ name: "cognate-phase0", version: "0.0.0" });

server.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Echoes the given text back, upper-cased.",
    inputSchema: { text: z.string() }, // a raw shape of zod validators, not z.object(...)
  },
  async ({ text }) => ({
    content: [{ type: "text", text: text.toUpperCase() }],
  }),
);
```

`inputSchema` takes a **raw shape** (`{ text: z.string() }`), not a
`z.object({...})` instance — passing a `ZodObject` directly is a type
error against `ZodRawShapeCompat`. `registerTool` is the current API;
the older `server.tool(name, cb)` overloads exist but are marked
`@deprecated` in 1.30.1's type definitions.

## Client: in-memory linked transport

```ts
const client = new Client({ name: "cognate-phase0-client", version: "0.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

const tools = await client.listTools();       // { tools: [{ name: "echo", description, inputSchema }] }
const result = await client.callTool({ name: "echo", arguments: { text: "cognate" } });
// result.content === [{ type: "text", text: "COGNATE" }]
```

Both `client.connect` and `server.connect` must be awaited together (they
perform the MCP initialize handshake over the linked pair); connecting
one side alone hangs waiting for the other, so the fixture uses
`Promise.all`.

## Invalid input — observed error shape

A tool call whose arguments fail the declared zod shape does **not**
reject the `callTool` promise. The SDK validates server-side and returns
a normal (successful, at the JSON-RPC level) result with `isError: true`:

```json
{
  "isError": true,
  "content": [
    { "type": "text", "text": "MCP error -32602: Input validation error: Invalid arguments for tool echo: Expected string, received number at text" }
  ]
}
```

This matters for adapter code: checking `result.isError` is required —
`try/catch` around `callTool` alone will not observe a schema-validation
failure.

## Open questions

- Not exercised here: resources, prompts, `experimental/tasks` (streaming
  tool calls), and real stdio/HTTP transports (`server/streamableHttp.js`,
  `client/sse.js`). The in-memory transport proves the tool-call contract
  but not wire-level framing.
- `@modelcontextprotocol/sdk` pulls in `ajv` and a JSON-schema validation
  path (`./validation`, `./validation/ajv`) as alternatives to zod; not
  evaluated, since the spec's Phase 0 goal here is only "list and call a
  tool," which zod already covers.
