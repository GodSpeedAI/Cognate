// Example: autonomous-harness — the reference harness looping model → tool → model to completion.
// Docs: docs/architecture.md (spec §29.2: the Harness reference profile: model providers, tool registry, agent loop).
import { createHarness, providerComponent, toolComponent } from "@cognate/profile-harness";
import { localProvider } from "@cognate/provider-local";

// A scripted local model: call the `add` tool once, then answer from its result.
const model = localProvider({
  id: "harness-example",
  rules: [
    {
      respond: (r) => {
        const lastTool = [...r.messages].reverse().find((m) => m.role === "tool");
        if (!lastTool) return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "t1", name: "add", arguments: { a: 19, b: 23 } }], finishReason: "tool_calls" };
        return { message: { role: "assistant", content: `The sum is ${lastTool.content}.` }, toolCalls: [], finishReason: "stop" };
      },
    },
  ],
});

async function main() {
  const harness = await createHarness({ store: ":memory:", instructions: "You are a calculator agent." });
  try {
    await harness.mount(providerComponent(model));
    await harness.mount(
      toolComponent({
        name: "add",
        description: "Add two numbers",
        inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
        handler: (input) => String((input as { a: number; b: number }).a + (input as { a: number; b: number }).b),
      }),
    );

    const runId = await harness.send("session-1", "What is 19 + 23?");
    const runs = await waitUntil(() => harness.session("session-1"), (rs) => rs.some((r) => r.status !== "running" && r.status !== "waiting"));
    const run = runs.find((r) => r.runId === runId)!;
    if (run.status !== "completed") throw new Error(`run did not complete: ${JSON.stringify(run)}`);
    const answer = (run.output as { answer: string }).answer;
    if (!answer.includes("42")) throw new Error(`expected the computed sum in the answer, got: ${answer}`);
    console.log(`ok: autonomous harness looped model -> tool -> model to reach: "${answer}"`);
  } finally {
    await harness.close();
  }
}

async function waitUntil<T>(read: () => Promise<T> | T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for condition, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

await main();
