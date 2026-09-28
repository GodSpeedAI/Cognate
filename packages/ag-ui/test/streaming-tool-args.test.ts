import { expect, test } from "bun:test";
import { createRuntime } from "@cognate/runtime-bun";
import { createAgUiHandler } from "../src/index.ts";

test("AG-UI exposes incomplete model tool arguments before the invocation completes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const contract = { id: "model.generate", version: "1.0.0" };
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "test" }) },
    actions: { authorize: () => ({ allow: true, reason: "test" }) },
    components: [{ id: "model", provides: [contract], activate(fiber) {
      fiber.provide(contract, async (_input, context) => {
        await context.progress?.({ type: "tool_call_start", callId: "call-1", name: "lookup" });
        await context.progress?.({ type: "tool_call_args", callId: "call-1", delta: '{"na' });
        await gate;
        await context.progress?.({ type: "tool_call_args", callId: "call-1", delta: 'me":"Ada"}' });
        await context.progress?.({ type: "tool_call_end", callId: "call-1" });
        return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "call-1", name: "lookup", arguments: { name: "Ada" } }], finishReason: "tool_calls", model: "test" };
      });
    } }],
    agents: [{ id: "agent.stream", version: "1.0.0", async run(_input, context) {
      return context.invoke("model.generate", { messages: [], stream: true });
    } }],
  });
  try {
    const handler = createAgUiHandler({
      service: runtime.service,
      defaultAgent: "agent.stream",
      authenticate: () => ({ tenant: "test", actor: { id: "alice", kind: "user" } }),
    });
    const response = await handler(new Request("http://localhost/agui", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "t", runId: "r", messages: [{ id: "u", role: "user", content: "find" }], tools: [], context: [], state: {}, forwardedProps: {} }),
    }));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let streamed = "";
    const untilPartial = async () => {
      while (!streamed.includes('"type":"TOOL_CALL_ARGS"')) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
      }
      return streamed;
    };
    const partial = await Promise.race([untilPartial(), Bun.sleep(500).then(() => "")]);
    expect(partial).toContain('"type":"TOOL_CALL_START"');
    expect(partial).toContain('"type":"TOOL_CALL_ARGS"');
    expect(partial).not.toContain('"type":"TOOL_CALL_END"');
    release();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      streamed += decoder.decode(value, { stream: true });
    }
    expect(streamed).toContain('"type":"TOOL_CALL_END"');
  } finally {
    release();
    await runtime.close();
  }
});
