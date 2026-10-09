// Umbrella smoke: every documented `@godspeedai/cognate` entrypoint resolves
// through the package's own public exports, and the re-exported runtime +
// client actually execute a capability end to end. The owning packages' own
// suites cover deep behavior; this suite only proves the umbrella surface.
import { describe, expect, test } from "bun:test";
import { createClient, createRuntime, type AgentDefinition } from "@godspeedai/cognate";
import * as umbrellaRuntime from "@godspeedai/cognate/runtime";
import * as umbrellaClient from "@godspeedai/cognate/client";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";

describe("@godspeedai/cognate umbrella", () => {
  test("root, /runtime, and /client exports resolve", () => {
    expect(typeof createRuntime).toBe("function");
    expect(typeof createClient).toBe("function");
    expect(typeof umbrellaRuntime.createRuntime).toBe("function");
    expect(typeof umbrellaClient.createClient).toBe("function");
  });

  test("re-exported runtime + client execute a capability end to end", async () => {
    const agent: AgentDefinition = {
      id: "agent.umbrella",
      version: "1.0.0",
      async run(_input, ctx) {
        await ctx.emit("state.changed", { snapshot: { counter: 1 } });
        await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/counter", value: 2 }] });
        return { done: true };
      },
    };
    const runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [agent],
    });
    const client = createClient({ service: runtime.service, caller: alice });
    try {
      const { runId } = await client.startRun("agent.umbrella", {});
      const start = Date.now();
      for (;;) {
        const state = client.run(runId).get();
        if (state.status === "completed") {
          expect(state.state).toEqual({ counter: 2 });
          break;
        }
        if (Date.now() - start > 10_000) throw new Error(`run never completed: ${JSON.stringify(state)}`);
        await Bun.sleep(10);
      }
    } finally {
      await client.close();
      await runtime.close();
    }
  });
});
