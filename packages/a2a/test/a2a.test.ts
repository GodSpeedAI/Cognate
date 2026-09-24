// CG-A2A-001 (spec §6 optional protocols): a pinned A2A client discovers the agent and completes a task backed by a run.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AgentDefinition } from "@cognate/runtime-api";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import { createA2AHandler } from "../src/index.ts";

const agent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const text = String((input as { text?: string }).text ?? "");
    const approval = (await ctx.waitFor("approve", { type: "refund-approval", condition: { kind: "human_approval" }, payload: { request: text } })) as { text?: string };
    return { decision: approval.text === "yes" ? "approved" : "rejected", request: text };
  },
};

let runtime: Runtime;
let server: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(async () => {
  runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: ({ caller }) => (caller.actor.id === "mallory" ? { allow: false, reason: "no" } : { allow: true, reason: "ok" }) }, agents: [agent] });
  server = Bun.serve({ port: 0, fetch: (req) => handler(req) });
  base = server.url.origin;
  const handler = createA2AHandler({
    service: runtime.service,
    agent: "agent.refund",
    baseUrl: base,
    card: { name: "Refund agent", description: "Approves refunds with a human in the loop", version: "1.0.0", skills: [{ id: "refund", name: "Refund", description: "Process a refund request" }] },
    authenticate: (h) => {
      const m = /^Bearer (\w+)$/.exec(h.get("authorization") ?? "");
      return m ? { actor: { id: m[1]!, kind: "agent" }, tenant: "tenant-a" } : undefined;
    },
  });
});
afterAll(async () => {
  server.stop(true);
  await runtime.close();
});

describe("A2A adapter", () => {
  test("serves an agent card and completes an input-required task using the SDK client", async () => {
    const { A2AClient } = await import("@a2a-js/sdk/client");
    const card = await (await fetch(`${base}/.well-known/agent-card.json`)).json();
    expect(card).toMatchObject({ name: "Refund agent", skills: [{ id: "refund" }] });
    const client = await A2AClient.fromCardUrl(`${base}/.well-known/agent-card.json`, { fetchImpl: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: "Bearer alice" } }) });
    const first = (await client.sendMessage({ message: { kind: "message", messageId: "m1", role: "user", parts: [{ kind: "text", text: "refund order 7" }] } })) as { result: { kind: string; id: string; status: { state: string } } };
    expect(first.result.kind).toBe("task");
    expect(first.result.status.state).toBe("input-required");
    const second = (await client.sendMessage({ message: { kind: "message", messageId: "m2", role: "user", taskId: first.result.id, parts: [{ kind: "text", text: "yes" }] } })) as { result: { status: { state: string }; artifacts?: { parts: { kind: string; data?: unknown; text?: string }[] }[] } };
    expect(second.result.status.state).toBe("completed");
    expect(JSON.stringify(second.result.artifacts)).toContain("approved");
  });

  test("unauthenticated JSON-RPC calls are rejected", async () => {
    const response = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { kind: "message", messageId: "x", role: "user", parts: [{ kind: "text", text: "hi" }] } } }) });
    expect(response.status).toBe(401);
  });
});
