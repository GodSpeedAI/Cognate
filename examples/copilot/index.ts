// Example: copilot — a support copilot as a pure composition of runtime components.
// Docs: docs/ui.md, docs/getting-started.md (spec §29.1: the Copilot reference profile).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@godspeedai/client";
import { localProvider } from "@godspeedai/provider-local";
import { alice } from "@godspeedai/runtime-api/conformance";
import { COPILOT_AGENT, createCopilotApp } from "@godspeedai/profile-copilot";

const dir = mkdtempSync(join(tmpdir(), "cognate-example-copilot-"));

// A scripted local model: quote a refund, then answer using the tool result. No network involved.
const model = localProvider({
  id: "copilot-example",
  rules: [
    {
      respond: (r) => {
        const lastTool = [...r.messages].reverse().find((m) => m.role === "tool");
        if (!lastTool) return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "t1", name: "billing.quote", arguments: { amount: 21 } }], finishReason: "tool_calls" };
        return { message: { role: "assistant", content: `Your refund total is ${JSON.parse(lastTool.content).total}.` }, toolCalls: [], finishReason: "stop" };
      },
    },
  ],
});

async function main() {
  const copilot = await createCopilotApp({
    store: join(dir, "app.sqlite"),
    model,
    instructions: "You are a support copilot.",
    backendTools: [
      {
        contract: { id: "billing.quote", version: "1.0.0" },
        description: "Quote a refund total",
        inputSchema: { type: "object" },
        handler: (i) => ({ total: (i as { amount: number }).amount * 2 }),
      },
    ],
  });
  const client = createClient({ service: copilot.runtime.service, caller: alice });
  try {
    const { runId } = await client.startRun(COPILOT_AGENT, { message: "How much is my refund?" });
    const state = await waitUntil(() => client.run(runId).get(), (s) => s.status === "completed");
    if (!state.text.includes("42")) throw new Error(`expected the quoted total in the answer, got: ${state.text}`);
    console.log(`ok: copilot answered using a backend tool call: "${state.text}"`);
  } finally {
    await client.close();
    await copilot.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitUntil<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for condition, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

await main();
