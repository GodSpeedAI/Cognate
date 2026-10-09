// Example: artifact-workbench — an agent produces a durable, content-addressed artifact and reads it back.
// Docs: docs/architecture.md (spec §13.1: artifacts have authoritative records and content-addressed bytes).
import { createClient } from "@godspeedai/cognate-client";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";

const agent: AgentDefinition = {
  id: "agent.report",
  version: "1.0.0",
  async run(input, ctx) {
    const { total } = input as { readonly total: number };
    const content = `# Refund report\n\nTotal refunded: ${total}\n`;
    const artifactId = await ctx.artifact({ name: "refund-report.md", mediaType: "text/markdown", bytes: new TextEncoder().encode(content) });
    return { artifactId };
  },
};

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [agent],
  });
  const client = createClient({ service: runtime.service, caller: alice });
  try {
    const { runId } = await client.startRun("agent.report", { total: 42 });
    const state = await waitUntil(() => client.run(runId).get(), (s) => s.status === "completed");
    const artifactId = (state.output as { artifactId: string }).artifactId;
    if (state.artifacts.length !== 1 || state.artifacts[0] !== artifactId) throw new Error(`expected exactly one produced artifact, got: ${JSON.stringify(state.artifacts)}`);
    const record = await client.artifact(artifactId);
    const text = new TextDecoder().decode(record.bytes);
    if (!text.includes("Total refunded: 42")) throw new Error(`unexpected artifact content: ${text}`);
    console.log(`ok: agent produced artifact ${artifactId} (${record.mediaType}), content-addressed and readable back`);
  } finally {
    await client.close();
    await runtime.close();
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
