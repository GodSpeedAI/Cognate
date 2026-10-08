// CG-MCP-001 (spec §6 optional protocols, §32; DEBT-013): runtime capabilities as MCP tools, authorized per caller.
import { afterAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRuntime } from "@godspeedai/runtime-bun";
import { createMcpServer } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-mcp-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function runtime() {
  return createRuntime({
    store: ":memory:",
    policy: { authorize: (r) => (r.actor.id === "mallory" ? { allow: false, policyId: "p", reason: "denied" } : { allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [],
    components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0" }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0" }, (i) => ({ total: (i as { amount: number }).amount * 2 })) }],
  });
}
const tools = [{ capability: "billing.quote", description: "Quote a refund total", inputSchema: { type: "object", properties: { amount: { type: "number" } }, required: ["amount"] } }];

async function connected(callerId: string) {
  const rt = await runtime();
  const server = createMcpServer({ service: rt.service, caller: { actor: { id: callerId, kind: "agent" }, tenant: "tenant-a" }, tools });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return { client, close: async () => { await client.close(); await server.close(); await rt.close(); } };
}

describe("MCP adapter", () => {
  test("lists runtime capabilities as tools with their schemas", async () => {
    const { client, close } = await connected("alice");
    const { tools: listed } = await client.listTools();
    expect(listed.map((t) => t.name)).toEqual(["billing_quote"]);
    expect(listed[0]!.inputSchema).toMatchObject({ type: "object", properties: { amount: { type: "number" } } });
    await close();
  });

  test("tool calls invoke the capability through runtime policy", async () => {
    const { client, close } = await connected("alice");
    const result = await client.callTool({ name: "billing_quote", arguments: { amount: 4 } });
    expect(result.isError ?? false).toBe(false);
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toEqual({ total: 8 });
    await close();
  });

  test("a denied caller gets an MCP tool error with the service code, not a result", async () => {
    const { client, close } = await connected("mallory");
    const result = await client.callTool({ name: "billing_quote", arguments: { amount: 4 } });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain("permission_denied");
    await close();
  });

  test("works across processes over stdio (closes DEBT-013 when green)", async () => {
    const script = join(dir, "server.ts");
    writeFileSync(
      script,
      `import { StdioServerTransport } from ${JSON.stringify(Bun.resolveSync("@modelcontextprotocol/sdk/server/stdio.js", resolve("packages/mcp")))};
       import { createRuntime } from ${JSON.stringify(resolve("packages/runtime-bun/src/index.ts"))};
       import { createMcpServer } from ${JSON.stringify(resolve("packages/mcp/src/index.ts"))};
       const rt = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents: [],
         components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0" }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0" }, (i) => ({ total: i.amount * 2 })) }] });
       const server = createMcpServer({ service: rt.service, caller: { actor: { id: "alice", kind: "agent" }, tenant: "tenant-a" }, tools: ${JSON.stringify(tools)} });
       await server.connect(new StdioServerTransport());`,
    );
    const client = new Client({ name: "stdio-test", version: "0" });
    await client.connect(new StdioClientTransport({ command: "bun", args: [script] }));
    const result = await client.callTool({ name: "billing_quote", arguments: { amount: 21 } });
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toEqual({ total: 42 });
    await client.close();
  }, 30_000);
});
