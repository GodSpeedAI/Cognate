// CG-STA-001 (spec §29.1): shared application state is bidirectional. An agent's `state.changed` events are
// visible to the client; a caller's `RuntimeService.updateState` is visible to the agent through
// `RunContext.state`; `startRun({ state })` seeds it; AG-UI's `RunAgentInput.state` seeds it end to end.
import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@godspeedai/cognate-client";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { createAgUiHandler } from "@godspeedai/cognate-ag-ui";

const agents: AgentDefinition[] = [
  {
    id: "agent.chat",
    version: "1.0.0",
    async run(_input, ctx) {
      await ctx.emit("state.changed", { snapshot: { order: { status: "open" } } });
      return { done: true };
    },
  },
  {
    id: "agent.waitsForCallerState",
    version: "1.0.0",
    async run(_input, ctx) {
      const before = await ctx.state("before");
      await ctx.waitFor("go", { type: "state-check", condition: {}, payload: {} });
      const after = await ctx.state("after");
      return { before, after };
    },
  },
];

const until = async <T>(read: () => T | Promise<T>, ok: (v: T) => boolean, what: string, ms = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out: ${what} (last ${JSON.stringify(value)})`);
    await Bun.sleep(10);
  }
};

describe("shared application state is bidirectional (spec §29.1)", () => {
  let runtime: Runtime;
  afterEach(async () => {
    await runtime?.close();
  });
  const open = () =>
    createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents,
    });

  test("an agent's state.changed events are visible through the client", async () => {
    runtime = await open();
    const client = createClient({ service: runtime.service, caller: alice });
    const { runId } = await client.startRun("agent.chat", null);
    const state = client.run(runId);
    await until(() => state.get(), (s) => s.status === "completed", "run completes");
    expect(state.get().state).toEqual({ order: { status: "open" } });
    await client.close();
  });

  test("client.updateState writes state a waiting agent reads via ctx.state after resume", async () => {
    runtime = await open();
    const client = createClient({ service: runtime.service, caller: alice });
    const { runId } = await client.startRun("agent.waitsForCallerState", null);
    const state = client.run(runId);
    await until(() => state.get(), (s) => s.openContinuations.length === 1, "run waits");
    const updated = await client.updateState(runId, { snapshot: { flag: true } });
    expect(updated).toEqual({ state: { flag: true }, version: 1 });
    await client.resolveContinuation(state.get().openContinuations[0]!.id, "resume");
    const done = await until(() => state.get(), (s) => s.status === "completed", "run completes");
    expect(done.output).toEqual({ before: {}, after: { flag: true } });
    await client.close();
  });

  test("startRun({ state }) seeds the run's shared state before the agent runs", async () => {
    runtime = await open();
    const { runId } = await runtime.service.startRun(alice, { agent: "agent.waitsForCallerState", input: null, idempotencyKey: "seed", state: { seeded: true } });
    await until(() => runtime.service.getRun(alice, { runId }), (r) => r.status === "waiting", "run waits");
    const [c] = await runtime.service.listContinuations(alice, { runId, status: "OPEN" });
    await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: null, idempotencyKey: "go" });
    const done = await until(() => runtime.service.getRun(alice, { runId }), (r) => r.status === "completed", "run completes");
    expect(done.output).toEqual({ before: { seeded: true }, after: { seeded: true } });
  });

  test("AG-UI RunAgentInput.state seeds the run", async () => {
    runtime = await open();
    const handler = createAgUiHandler({ service: runtime.service, defaultAgent: "agent.waitsForCallerState", authenticate: () => alice });
    const server = Bun.serve({ port: 0, fetch: handler });
    try {
      const response = await fetch(`${server.url.origin}/agui`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: "t-seed", runId: "r-1", messages: [{ id: "m1", role: "user", content: "hi" }], tools: [], context: [], state: { seeded: true } }),
      });
      const stream = await response.text();
      expect(stream).toContain("RUN_FINISHED");
      const [run] = await runtime.service.listRuns(alice, { correlationId: "agui-thread:t-seed" });
      const [c] = await runtime.service.listContinuations(alice, { runId: run!.runId, status: "OPEN" });
      await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: null, idempotencyKey: "go" });
      const done = await until(() => runtime.service.getRun(alice, { runId: run!.runId }), (r) => r.status === "completed", "run completes");
      expect(done.output).toEqual({ before: { seeded: true }, after: { seeded: true } });
    } finally {
      server.stop(true);
    }
  });

  test("AG-UI's default RunAgentInput.state ({}) does not seed the run", async () => {
    runtime = await open();
    const handler = createAgUiHandler({ service: runtime.service, defaultAgent: "agent.waitsForCallerState", authenticate: () => alice });
    const server = Bun.serve({ port: 0, fetch: handler });
    try {
      const response = await fetch(`${server.url.origin}/agui`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: "t-empty", runId: "r-2", messages: [{ id: "m1", role: "user", content: "hi" }], tools: [], context: [], state: {} }),
      });
      const stream = await response.text();
      expect(stream).toContain("RUN_FINISHED");
      const [run] = await runtime.service.listRuns(alice, { correlationId: "agui-thread:t-empty" });
      const [c] = await runtime.service.listContinuations(alice, { runId: run!.runId, status: "OPEN" });
      await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: null, idempotencyKey: "go" });
      const done = await until(() => runtime.service.getRun(alice, { runId: run!.runId }), (r) => r.status === "completed", "run completes");
      expect(done.output).toEqual({ before: {}, after: {} });
    } finally {
      server.stop(true);
    }
  });
});
