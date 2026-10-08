// Example: multi-agent — a parent agent durably spawns and awaits a child run (subagents).
// Docs: docs/architecture.md (spec §29.2: the harness's `subagent.start` component and `spawnSubagent`).
import { createHarness, LOCAL_OPERATOR, spawnSubagent } from "@godspeedai/profile-harness";
import type { AgentDefinition } from "@godspeedai/runtime-api";

const childAgent: AgentDefinition = {
  id: "agent.child",
  version: "1.0.0",
  async run(input) {
    const { n } = input as { readonly n: number };
    return { doubled: n * 2 };
  },
};

const parentAgent: AgentDefinition = {
  id: "agent.parent",
  version: "1.0.0",
  async run(input, ctx) {
    const { n } = input as { readonly n: number };
    const childOutput = (await spawnSubagent(ctx, "child-1", "agent.child", { n })) as { readonly doubled: number };
    return { childOutput };
  },
};

async function main() {
  const harness = await createHarness({ store: ":memory:", agents: [parentAgent, childAgent] });
  try {
    const view = await harness.runtime.service.startRun(LOCAL_OPERATOR, { agent: "agent.parent", input: { n: 21 }, idempotencyKey: "multi-agent-example" });
    const done = await waitUntil(() => harness.runtime.service.getRun(LOCAL_OPERATOR, { runId: view.runId }), (r) => r.status !== "running" && r.status !== "waiting");
    if (done.status !== "completed") throw new Error(`parent run did not complete: ${JSON.stringify(done)}`);
    const { childOutput } = done.output as { readonly childOutput: { readonly doubled: number } };
    if (childOutput.doubled !== 42) throw new Error(`expected the child's computed output, got: ${JSON.stringify(childOutput)}`);
    console.log(`ok: parent run durably spawned a child run and awaited its output: ${JSON.stringify(childOutput)}`);
  } finally {
    await harness.close();
  }
}

async function waitUntil<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for condition, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

await main();
