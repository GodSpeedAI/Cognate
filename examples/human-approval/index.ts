// Example: human-approval — an agent suspends on a durable continuation until a human resolves it.
// Docs: docs/concepts.md (spec §12: RunContext.waitFor / continuations as durable suspension points).
import { createClient } from "@godspeedai/client";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime } from "@godspeedai/runtime-bun";
import { alice } from "@godspeedai/runtime-api/conformance";

const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount } = input as { readonly amount: number };
    const decision = (await ctx.waitFor("approve", {
      type: "refund-approval",
      condition: { kind: "human_approval" },
      payload: { amount },
    })) as { readonly approved: boolean };
    return { amount, approved: decision.approved, status: decision.approved ? "refunded" : "denied" };
  },
};

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [refundAgent],
  });
  const client = createClient({ service: runtime.service, caller: alice });
  try {
    const { runId } = await client.startRun("agent.refund", { amount: 75 });

    // The run suspends: it is durably waiting on a human, not polling or blocking a thread.
    const waiting = await waitUntil(() => client.run(runId).get(), (s) => s.openContinuations.length === 1);
    const approval = waiting.openContinuations[0]!;
    if (approval.type !== "refund-approval") throw new Error(`unexpected continuation type: ${approval.type}`);

    // A human (here: this example) resolves it.
    await client.resolveContinuation(approval.id, "resume", { approved: true });

    const done = await waitUntil(() => client.run(runId).get(), (s) => s.status === "completed");
    if (!(done.output as { approved: boolean }).approved) throw new Error(`expected the approved outcome, got: ${JSON.stringify(done.output)}`);
    console.log(`ok: run suspended on a human-approval continuation and resumed with output ${JSON.stringify(done.output)}`);
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
