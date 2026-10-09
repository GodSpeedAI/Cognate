// Example: ag-ui — a run projected as a schema-shaped AG-UI SSE event stream over HTTP.
// Docs: docs/protocols.md (ADR-0008; spec §24: outbound AG-UI mapping over durable run events).
import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const agent: AgentDefinition = {
  id: "agent.copilot",
  version: "1.0.0",
  async run(input, ctx) {
    const { message } = input as { readonly message: string };
    for (const word of ["Checking ", "your ", "refund"]) await ctx.emit("message.delta", { text: word });
    await ctx.emit("state.changed", { snapshot: { refund: { status: "review" } } });
    return { echoed: message };
  },
};

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [agent],
  });
  const handler = createAgUiHandler({
    service: runtime.service,
    defaultAgent: "agent.copilot",
    authenticate: (headers) => {
      const match = /^Bearer (\w+)$/.exec(headers.get("authorization") ?? "");
      return match ? { actor: { id: match[1]!, kind: "user" }, tenant: "tenant-a" } : undefined;
    },
  });
  const server = Bun.serve({ port: 0, fetch: handler });
  try {
    const response = await fetch(`${server.url.origin}/agui`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer alice" },
      body: JSON.stringify({ threadId: "t-1", runId: "r-1", messages: [{ id: "u1", role: "user", content: "refund please" }], tools: [], context: [], state: {}, forwardedProps: {} }),
    });
    const text = await response.text();
    const events = text
      .split("\n\n")
      .map((chunk) => chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""))
      .filter(Boolean)
      .map((data) => JSON.parse(data) as { type: string; [k: string]: unknown });

    if (events[0]?.type !== "RUN_STARTED") throw new Error(`expected the stream to start with RUN_STARTED, got: ${events[0]?.type}`);
    if (events.at(-1)?.type !== "RUN_FINISHED") throw new Error(`expected the stream to end with RUN_FINISHED, got: ${events.at(-1)?.type}`);
    const types = events.map((e) => e.type);
    if (!types.includes("TEXT_MESSAGE_START") || !types.includes("TEXT_MESSAGE_CONTENT") || !types.includes("STATE_SNAPSHOT")) throw new Error(`missing expected AG-UI event types: ${types.join(",")}`);
    const text_ = events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("");
    if (text_ !== "Checking your refund") throw new Error(`expected reassembled streamed text, got: ${text_}`);

    console.log(`ok: run projected to ${events.length} well-bracketed AG-UI events (RUN_STARTED ... RUN_FINISHED) with reassembled text "${text_}"`);
  } finally {
    server.stop(true);
    await runtime.close();
  }
}

await main();
