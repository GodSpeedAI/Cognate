// CG-PRF-003 (spec §29.2, §35, §40.K): Harness behaviours as a composition of existing primitives.
import { afterEach, describe, expect, test } from "bun:test";
import type { ModelRequest } from "@cognate/capabilities";
import { resolveProfile } from "@cognate/profile";
import { localProvider } from "@cognate/provider-local";
import type { AgentDefinition } from "@cognate/runtime-api";
import { alice } from "@cognate/runtime-api/conformance";
import { createHarness, harnessProfile, harnessRegistry, LOOP_AGENT, providerComponent, skillComponent, spawnSubagent, storageComponent, toolComponent, type Harness } from "../src/index.ts";

/** A model that calls the first offered tool whose name appears in the user message, then answers with the result. */
function toolCallingModel(id: string) {
  return localProvider({
    id,
    rules: [
      {
        respond: (r: ModelRequest) => {
          const tool = [...r.messages].reverse().find((m) => m.role === "tool");
          if (tool) return { message: { role: "assistant", content: `[${id}] ${tool.content}` }, toolCalls: [], finishReason: "stop" };
          const user = [...r.messages].reverse().find((m) => m.role === "user")!.content;
          const offered = (r.tools ?? []).find((t) => user.includes(t.name));
          return offered
            ? { message: { role: "assistant", content: "" }, toolCalls: [{ id: "c1", name: offered.name, arguments: { text: user } }], finishReason: "tool_calls" }
            : { message: { role: "assistant", content: `[${id}] no tool for: ${user}` }, toolCalls: [], finishReason: "stop" };
        },
      },
    ],
  });
}

const waitRun = async (h: Harness, runId: string, status = "completed") => {
  for (let i = 0; i < 800; i++) {
    const run = await h.runtime.service.getRun(alice, { runId });
    if (run.status === status) return run;
    if (run.status === "failed" && status !== "failed") throw new Error(`run failed: ${run.error}`);
    await Bun.sleep(10);
  }
  throw new Error(`run ${runId} never reached ${status}`);
};

describe("Harness profile (§29.2)", () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  test("the profile is a pure composition of registered components", () => {
    const resolved = resolveProfile(harnessProfile, harnessRegistry);
    expect(resolved.unresolved).toEqual([]);
    expect(harnessProfile.components).toEqual(expect.arrayContaining(["model-providers", "tool-registry", "agent-loop", "sessions", "storage", "skills", "scheduler", "sandbox", "subagents"]));
  });

  test("agent loop over a model provider and the tool registry; sessions group runs", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    await h.mount(providerComponent(toolCallingModel("model-a")));
    await h.mount(toolComponent({ name: "reverse", description: "Reverse text", inputSchema: { type: "object" }, handler: (i) => ({ reversed: [...String((i as { text: string }).text)].reverse().join("") }) }));
    const first = await h.send("s1", "please reverse this");
    expect((await waitRun(h, first)).output).toMatchObject({ answer: expect.stringContaining("[model-a]") });
    expect(JSON.stringify((await waitRun(h, first)).output)).toContain("siht esrever esaelp");
    const second = await h.send("s1", "no tools here");
    await waitRun(h, second);
    expect((await h.session("s1")).map((r) => r.runId)).toEqual([first, second]);
    expect(await h.session("other")).toEqual([]);
  });

  test("providers are replaceable live without consumer changes", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    const a = await h.mount(providerComponent(toolCallingModel("model-a")));
    expect(JSON.stringify((await waitRun(h, await h.send("s", "hello"))).output)).toContain("[model-a]");
    await a.dispose("swap");
    await h.mount(providerComponent(toolCallingModel("model-b")));
    expect(JSON.stringify((await waitRun(h, await h.send("s", "hello again"))).output)).toContain("[model-b]");
  });

  test("skills add tools dynamically; the loop discovers them on the next run", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    await h.mount(providerComponent(toolCallingModel("m")));
    expect(JSON.stringify((await waitRun(h, await h.send("s", "shout it"))).output)).toContain("no tool");
    const skill = await h.mount(skillComponent({ name: "loud", tools: [{ name: "shout", description: "Upper-case", inputSchema: { type: "object" }, handler: (i) => String((i as { text: string }).text).toUpperCase() }] }));
    expect(JSON.stringify((await waitRun(h, await h.send("s", "shout it"))).output)).toContain("SHOUT IT");
    await skill.dispose("unload");
    expect(JSON.stringify((await waitRun(h, await h.send("s", "shout it"))).output)).toContain("no tool");
  });

  test("§35: a tool requiring storage activates, deactivates on removal, and reactivates on restore", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    const memo = await h.mount(toolComponent({ name: "memo", description: "Remember text", inputSchema: { type: "object" }, requires: { kv: { capability: "storage.kv" } }, handler: (i) => i }));
    await memo.waitFor("ACTIVE");
    await h.storage.dispose("remove storage");
    await memo.waitFor("WAITING");
    await h.mount(storageComponent(h.runtime.store));
    await memo.waitFor("ACTIVE");
  });

  test("storage.kv persists values as durable records", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    const svc = h.runtime.service;
    await svc.invoke(alice, { capability: "storage.kv", input: { op: "set", key: "k", value: { n: 1 } } });
    expect(await svc.invoke(alice, { capability: "storage.kv", input: { op: "get", key: "k" } })).toEqual({ n: 1 });
    // Partitioned by the caller's tenant (spec §32): another tenant neither sees nor overwrites it.
    const bob = { actor: { id: "bob", kind: "user" as const }, tenant: "tenant-b" };
    expect(await svc.invoke(bob, { capability: "storage.kv", input: { op: "get", key: "k" } })).toBeNull();
    await svc.invoke(bob, { capability: "storage.kv", input: { op: "set", key: "k", value: "b" } });
    expect(await svc.invoke(alice, { capability: "storage.kv", input: { op: "get", key: "k" } })).toEqual({ n: 1 });
  });

  test("sandbox.exec runs code in a subprocess with a timeout and no inherited secrets", async () => {
    process.env.COGNATE_TEST_SECRET = "top-secret";
    h = await createHarness({ store: ":memory:", caller: alice, sandbox: { timeoutMs: 1000, maxOutputBytes: 10_000 } });
    const out = (await h.runtime.service.invoke(alice, { capability: "sandbox.exec", input: { code: "console.log(1 + 1, process.env.COGNATE_TEST_SECRET ?? 'none')" } })) as { exitCode: number; stdout: string };
    expect(out).toMatchObject({ exitCode: 0, stdout: "2 none\n" });
    const slow = (await h.runtime.service.invoke(alice, { capability: "sandbox.exec", input: { code: "await Bun.sleep(5000)" } })) as { timedOut: boolean };
    expect(slow.timedOut).toBe(true);
    delete process.env.COGNATE_TEST_SECRET;
  });

  test("the scheduler starts a run at its time, durably", async () => {
    h = await createHarness({ store: ":memory:", caller: alice });
    await h.mount(providerComponent(toolCallingModel("m")));
    const at = Date.now() + 150;
    await h.schedule(LOOP_AGENT, { message: "scheduled hello", sessionId: "cron" }, at);
    await Bun.sleep(50);
    expect(await h.session("cron")).toEqual([]);
    for (let i = 0; i < 300 && (await h.session("cron")).length === 0; i++) await Bun.sleep(10);
    const [run] = await h.session("cron");
    expect(run).toBeDefined();
    await waitRun(h, run!.runId);
  });

  test("subagent composition: a parent run durably awaits a child run's output", async () => {
    const child: AgentDefinition = { id: "agent.child", version: "1.0.0", run: async (input) => ({ doubled: (input as { n: number }).n * 2 }) };
    const parent: AgentDefinition = { id: "agent.parent", version: "1.0.0", run: async (input, ctx) => ({ fromChild: await spawnSubagent(ctx, "sub", "agent.child", input) }) };
    h = await createHarness({ store: ":memory:", caller: alice, agents: [child, parent] });
    const { runId } = await h.runtime.service.startRun(alice, { agent: "agent.parent", input: { n: 21 }, idempotencyKey: "p" });
    expect((await waitRun(h, runId)).output).toEqual({ fromChild: { doubled: 42 } });
  });
});
