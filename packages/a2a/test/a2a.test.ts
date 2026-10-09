// CG-A2A-001 (spec §6 optional protocols): a pinned A2A client discovers the agent and completes a task backed by a run.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
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
    // 1.2.1 has no `A2AClient.fromCardUrl`; the real discovery/transport surface is
    // `ClientFactory` (with a `JsonRpcTransportFactory`) → `createFromUrl` → `Client.sendMessage`.
    const { ClientFactory, JsonRpcTransportFactory } = await import("@a2a-js/sdk/client");
    const { TaskState } = await import("@a2a-js/sdk");

    const card = await (await fetch(`${base}/.well-known/agent-card.json`)).json();
    expect(card).toMatchObject({ name: "Refund agent", skills: [{ id: "refund" }] });

    // Authentication is passed via the SDK's supported mechanism: a custom `fetchImpl` on the transport factory.
    const authenticatedFetch = ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: "Bearer alice" } })) as unknown as typeof fetch;
    const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl: authenticatedFetch })] });
    const client = await factory.createFromUrl(base);

    const first = await client.sendMessage({ message: { messageId: "m1", contextId: "", taskId: "", role: 1, parts: [{ content: { $case: "text", value: "refund order 7" }, metadata: undefined, filename: "", mediaType: "" }], metadata: undefined, extensions: [], referenceTaskIds: [] }, tenant: "", configuration: undefined, metadata: undefined });
    expect("status" in first).toBe(true);
    const firstTask = first as Extract<typeof first, { status: unknown }>;
    expect(firstTask.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);

    const second = await client.sendMessage({ message: { messageId: "m2", contextId: "", taskId: firstTask.id, role: 1, parts: [{ content: { $case: "text", value: "yes" }, metadata: undefined, filename: "", mediaType: "" }], metadata: undefined, extensions: [], referenceTaskIds: [] }, tenant: "", configuration: undefined, metadata: undefined });
    const secondTask = second as Extract<typeof second, { status: unknown }>;
    expect(secondTask.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(JSON.stringify(secondTask.artifacts)).toContain("approved");
  });

  test("unauthenticated JSON-RPC calls are rejected", async () => {
    const response = await fetch(`${base}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: { messageId: "x", role: "ROLE_USER", parts: [{ text: "hi" }] } } }),
    });
    expect(response.status).toBe(401);
  });
});
