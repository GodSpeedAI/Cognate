// Example: shared-state — an agent publishes application state that the client derives via JSON Patch.
// Docs: docs/concepts.md, docs/ui.md (spec §12 `state.changed` events; RunState.state is derived, not stored).
import { createClient } from "@godspeedai/client";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime } from "@godspeedai/runtime-bun";
import { alice } from "@godspeedai/runtime-api/conformance";

const agent: AgentDefinition = {
  id: "agent.order",
  version: "1.0.0",
  async run(_input, ctx) {
    await ctx.emit("state.changed", { snapshot: { order: { id: "o-1", status: "open", total: 0 } } });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/status", value: "paid" }] });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/total", value: 42 }] });
    return { done: true };
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
    const { runId } = await client.startRun("agent.order", {});
    const state = await waitUntil(() => client.run(runId).get(), (s) => s.status === "completed");
    const order = state.state as { order: { id: string; status: string; total: number } };
    if (order.order.status !== "paid" || order.order.total !== 42) throw new Error(`expected patched shared state, got: ${JSON.stringify(order)}`);
    console.log(`ok: shared state derived from a snapshot plus two JSON Patch deltas: ${JSON.stringify(order)}`);
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
