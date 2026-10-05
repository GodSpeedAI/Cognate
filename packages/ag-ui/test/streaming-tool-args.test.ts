import { expect, test } from "bun:test";
import { createRuntime } from "@cognate/runtime-bun";
import { createAgUiHandler, createProjector } from "../src/index.ts";
import { EventSchema } from "@ag-ui/core/schemas";

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

test("a streamed tool call keeps one identity through remote execution and result", () => {
  const continuation = { id: "continuation-1", runId: "r", type: "remote:lookup", status: "RESUMED" as const, condition: { kind: "frontend_capability" }, payload: { name: "Ada" }, version: 1, expiresAt: null };
  const projector = createProjector({ threadId: "t", runId: "r", continuation: () => continuation });
  const base = { streamId: "run:r", streamSequence: 1, position: 1, recordedAt: "2026-09-28T00:00:00Z", occurredAt: "2026-09-28T00:00:00Z", schemaVersion: 1, tenant: "tenant-a", correlationId: "t", causationId: null, runId: "r", scopeId: "root" };
  let position = 0;
  const push = (eventType: string, payload: unknown, metadata: unknown) => projector.push({ ...base, position: ++position, eventId: `event:${position}`, eventType, payload, metadata } as never);
  const events = [
    ...push("run.invocation.progress", { type: "tool_call_start", callId: "call-1", name: "lookup" }, { capability: "model.generate" }),
    ...push("run.invocation.progress", { type: "tool_call_args", callId: "call-1", delta: '{"na' }, { capability: "model.generate" }),
    ...push("run.invocation.progress", { type: "tool_call_args", callId: "call-1", delta: 'me":"Ada"}' }, { capability: "model.generate" }),
    ...push("run.invocation.progress", { type: "tool_call_end", callId: "call-1" }, { capability: "model.generate" }),
    ...push("run.waiting", { type: "remote:lookup" }, { continuationId: "continuation-1", stepId: "wait:remote:call-1" }),
    ...push("run.resumed", { input: { ok: true, value: { found: true } } }, { stepId: "wait:remote:call-1", continuationId: "continuation-1" }),
  ];
  expect(events.map((event) => event.type)).toEqual(["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"]);
  expect(events.every((event) => EventSchema.safeParse(event).success)).toBe(true);
  expect(events.map((event) => "toolCallId" in event ? event.toolCallId : undefined)).toEqual(Array(5).fill("call-1"));
  expect(events.at(-1)).toMatchObject({ type: "TOOL_CALL_RESULT", content: '{"found":true}' });
});
