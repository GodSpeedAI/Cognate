import { expect, test } from "bun:test";
import { createRuntime } from "@cognate/runtime-bun";
import { createAgUiHandler, threadCorrelationId } from "../src/index.ts";

test("AG-UI starts after a persisted thread state edit and projects later edits in the next run", async () => {
  const threadId = "todos";
  const caller = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "test" }) },
    actions: { authorize: () => ({ allow: true, reason: "test" }) },
    agents: [{ id: "agent.thread", version: "1.0.0", async run(_input, context) {
      return { observed: await context.sharedState("before-answer") };
    } }],
  });
  try {
    const handler = createAgUiHandler({ service: runtime.service, defaultAgent: "agent.thread", authenticate: () => caller });
    const post = async (runId: string) => {
      const response = await handler(new Request("http://localhost/agui", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, runId, messages: [{ id: `user:${runId}`, role: "user", content: "what changed?" }], tools: [], context: [], state: {}, forwardedProps: {} }),
      }));
      return (await response.text()).split("\n\n").map((chunk) => chunk.slice(6)).filter(Boolean).map((data) => JSON.parse(data) as { type: string; snapshot?: unknown; result?: { output?: unknown } });
    };

    await runtime.service.updateSharedState(caller, { threadId: threadCorrelationId(threadId), update: { snapshot: { todos: ["first"] } }, idempotencyKey: "seed" });
    const first = await post("first");
    expect(first[0]?.type).toBe("RUN_STARTED");
    expect(first.find((event) => event.type === "STATE_SNAPSHOT")?.snapshot).toEqual({ todos: ["first"] });
    expect(first.at(-1)?.result?.output).toEqual({ observed: { todos: ["first"] } });

    await runtime.service.updateSharedState(caller, { threadId: threadCorrelationId(threadId), update: { patch: [{ op: "add", path: "/todos/-", value: "second" }] }, idempotencyKey: "edit", expectedVersion: 1 });
    const second = await post("second");
    expect(second[0]?.type).toBe("RUN_STARTED");
    expect(second.find((event) => event.type === "STATE_SNAPSHOT")?.snapshot).toEqual({ todos: ["first", "second"] });
    expect(second.at(-1)?.result?.output).toEqual({ observed: { todos: ["first", "second"] } });
  } finally {
    await runtime.close();
  }
});
