// Example: mcp — runtime capabilities exposed as MCP tools, authorized per caller.
// Docs: docs/protocols.md (ADR-0010; spec §6, §32: MCP tools are ordinary capabilities behind runtime policy).
import { resolve } from "node:path";
import { createMcpServer } from "@godspeedai/mcp";
import { createRuntime } from "@godspeedai/runtime-bun";

// @modelcontextprotocol/sdk isn't hoisted to the repo root; resolve it relative to packages/mcp, the same
// pattern the package's own stdio test uses for scripts outside the workspace root.
const clientPath = Bun.resolveSync("@modelcontextprotocol/sdk/client/index.js", resolve("packages/mcp"));
const inMemoryPath = Bun.resolveSync("@modelcontextprotocol/sdk/inMemory.js", resolve("packages/mcp"));
const { Client } = (await import(clientPath)) as { Client: new (info: { name: string; version: string }) => { connect: (t: unknown) => Promise<void>; listTools: () => Promise<{ tools: { name: string }[] }>; callTool: (r: { name: string; arguments: unknown }) => Promise<{ isError?: boolean; content: { text: string }[] }>; close: () => Promise<void> } };
const { InMemoryTransport } = (await import(inMemoryPath)) as { InMemoryTransport: { createLinkedPair(): [unknown, unknown] } };

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: (r) => (r.actor.id === "mallory" ? { allow: false, policyId: "p", reason: "denied" } : { allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [],
    components: [{ id: "billing", provides: [{ id: "billing.quote", version: "1.0.0" }], activate: (f) => f.provide({ id: "billing.quote", version: "1.0.0" }, (i) => ({ total: (i as { amount: number }).amount * 2 })) }],
  });
  const tools = [{ capability: "billing.quote", description: "Quote a refund total", inputSchema: { type: "object", properties: { amount: { type: "number" } }, required: ["amount"] } }];
  const server = createMcpServer({ service: runtime.service, caller: { actor: { id: "alice", kind: "agent" }, tenant: "tenant-a" }, tools });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "example", version: "0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools: listed } = await client.listTools();
    if (listed.map((t) => t.name).join(",") !== "billing_quote") throw new Error(`expected billing_quote tool, got: ${JSON.stringify(listed)}`);

    const ok = await client.callTool({ name: "billing_quote", arguments: { amount: 21 } });
    if (ok.isError) throw new Error(`unexpected error result: ${JSON.stringify(ok)}`);
    const total = JSON.parse(ok.content[0]!.text) as { total: number };
    if (total.total !== 42) throw new Error(`expected the doubled amount, got: ${JSON.stringify(total)}`);

    console.log(`ok: MCP client listed [${listed.map((t) => t.name).join(", ")}] and invoked billing_quote through runtime policy -> total ${total.total}`);
  } finally {
    await client.close();
    await server.close();
    await runtime.close();
  }
}

await main();
