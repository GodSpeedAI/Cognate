import { test, expect } from "bun:test";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { createAgUiHandler } from "../src/index.ts";

test("AG-UI sends committed text while the run is still executing", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "test" }) },
    actions: { authorize: () => ({ allow: true, reason: "test" }) },
    agents: [{ id: "agent.live", version: "1.0.0", async run(_input, ctx) {
      await ctx.emit("message.delta", { text: "visible now" });
      await gate;
      return { done: true };
    } }],
  });
  try {
    const handle = createAgUiHandler({
      service: runtime.service,
      defaultAgent: "agent.live",
      authenticate: () => ({ tenant: "test", actor: { id: "alice", kind: "user" } }),
    });
    const request = new Request("http://localhost/agui", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "live", runId: "live-1", messages: [{ id: "u", role: "user", content: "go" }], tools: [], context: [], state: {}, forwardedProps: {} }),
    });
    const responsePromise = handle(request);
    const early = await Promise.race([responsePromise.then(() => true), Bun.sleep(300).then(() => false)]);
    const response = await responsePromise;
    expect(early).toBe(true);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let streamed = "";
    const untilVisible = async (): Promise<string> => {
      while (!streamed.includes('"delta":"visible now"')) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
      }
      return streamed;
    };
    expect(await Promise.race([untilVisible(), Bun.sleep(300).then(() => "")])).toContain('"delta":"visible now"');
    release();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      streamed += decoder.decode(value, { stream: true });
    }
    expect(streamed).toContain('"status":"completed"');
  } finally {
    release();
    await runtime.close();
  }
});
