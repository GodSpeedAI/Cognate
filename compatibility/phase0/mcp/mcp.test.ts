import { expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

test("MCP server with one tool: in-memory client can list and call it under Bun", async () => {
  const server = new McpServer({ name: "cognate-phase0", version: "0.0.0" });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echoes the given text back, upper-cased.",
      inputSchema: { text: z.string() },
    },
    async ({ text }) => ({
      content: [{ type: "text", text: text.toUpperCase() }],
    }),
  );

  const client = new Client({ name: "cognate-phase0-client", version: "0.0.0" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const tools = await client.listTools();
  expect(tools.tools.map((t) => t.name)).toEqual(["echo"]);
  expect(tools.tools[0]?.description).toBe("Echoes the given text back, upper-cased.");

  const result = await client.callTool({ name: "echo", arguments: { text: "cognate" } });
  expect(result.content).toEqual([{ type: "text", text: "COGNATE" }]);

  await client.close();
  await server.close();
});

test("MCP tool call rejects invalid input against its declared schema", async () => {
  const server = new McpServer({ name: "cognate-phase0", version: "0.0.0" });
  server.registerTool(
    "echo",
    { description: "echo", inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: "text", text }] }),
  );
  const client = new Client({ name: "cognate-phase0-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  // wrong type for `text` (a number instead of a string): the SDK validates
  // against the declared zod shape server-side and returns a tool error
  // result rather than rejecting the JSON-RPC call itself.
  // observed: MCP error -32602 ("Input validation error") surfaces inside
  // { isError: true, content: [...] }, not as a rejected promise.
  const invalid = await client.callTool({ name: "echo", arguments: { text: 42 } });
  expect(invalid.isError).toBe(true);
  expect(String((invalid.content as any[])[0]?.text)).toContain("Invalid arguments");

  await client.close();
  await server.close();
});
