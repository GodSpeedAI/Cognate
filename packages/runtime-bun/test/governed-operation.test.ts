import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Component } from "@cognate/kernel-api";
import type { AgentDefinition } from "@cognate/runtime-api";
import { createRuntime, type GovernanceAuthority, type GovernanceDecision, type GovernedOperation, type Runtime } from "../src/index.ts";

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;
const WORLD = `world:demo@sha256:${"a".repeat(64)}`;
const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const allowLocal = { authorize: () => ({ allow: true, reason: "local ok" }) };
const allowKernel = { authorize: () => ({ allow: true, policyId: "p", reason: "kernel ok" }) };

const echo: AgentDefinition = { id: "agent.echo", version: "1.0.0", async run(input) { return { output: input }; } };
const tool: Component = {
  id: "tool-provider",
  provides: [{ id: "tool.ping", version: "1.0.0" }],
  activate: (fiber) => fiber.provide({ id: "tool.ping", version: "1.0.0" }, () => ({ pong: true })),
};
const invoker: AgentDefinition = {
  id: "agent.invoker",
  version: "1.0.0",
  async run(_input, ctx) {
    return { output: await ctx.invoke("tool.ping", {}) };
  },
};

describe("GovernedOperation choke point", () => {
  let runtime: Runtime | undefined;
  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  const open = async (governance: Parameters<typeof createRuntime>[0]["governance"], local = allowLocal, kernel = allowKernel) => {
    runtime = await createRuntime({ store: ":memory:", policy: kernel, actions: local, agents: [echo, invoker], components: [tool], governance });
    return runtime;
  };
  const authority = (decide: GovernanceAuthority["decide"]): GovernanceAuthority => ({ decide });

  test("off mode is local policy only and says so", async () => {
    const rt = await open({ mode: "off" });
    const run = await rt.service.startRun(alice, { agent: echo.id, input: { x: 1 }, idempotencyKey: nextKey() });
    expect(run.runId).toBeTruthy();
  });

  test("default governance is off (explicit, not silent)", async () => {
    const rt = await open(undefined);
    await rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() });
  });

  test("sea-forge mode consults the authority with the pinned world for every action", async () => {
    const seen: { op: GovernedOperation; world: string }[] = [];
    const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority((op, world) => (seen.push({ op, world }), { disposition: "allow", reason: "granted" })) });
    await rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.world === WORLD)).toBe(true);
    expect(seen[0]!.op).toMatchObject({ kind: "action", action: "run.start", resource: echo.id });
  });

  test("capability invocations pass through the same authority", async () => {
    const kinds: string[] = [];
    const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority((op) => (kinds.push(op.kind), { disposition: "allow", reason: "granted" })) });
    const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: nextKey() });
    await rt.idle();
    expect(kinds).toContain("capability");
    expect((await rt.service.getRun(alice, { runId: run.runId })).status).toBe("completed");
  });

  test("a non-allow disposition refuses the action", async () => {
    for (const disposition of ["deny", "escalate", "unknown", "constrained_allow", "boundary", "degraded"] as const) {
      const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => ({ disposition, reason: `because ${disposition}`, policyBasis: "p" })) });
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
      await rt.close();
      runtime = undefined;
    }
  });

  test("a denied capability invocation never runs the provider", async () => {
    const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority((op) => (op.kind === "capability" ? { disposition: "deny", reason: "no" } : { disposition: "allow", reason: "ok" })) });
    const run = await rt.service.startRun(alice, { agent: invoker.id, input: {}, idempotencyKey: nextKey() });
    await rt.idle();
    expect((await rt.service.getRun(alice, { runId: run.runId })).status).not.toBe("completed");
  });

  test("authority allow cannot override a local denial (authority != capability)", async () => {
    let consulted = false;
    const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => ((consulted = true), { disposition: "allow", reason: "ok" })) }, { authorize: () => ({ allow: false, reason: "local deny" }) });
    await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
    expect(consulted).toBe(false);
  });

  test("an authority that throws or returns garbage fails closed", async () => {
    const thrower = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => { throw new Error("boom"); }) });
    await expect(thrower.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
    await thrower.close();
    runtime = undefined;
    const garbage = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => ({ disposition: "yes" as unknown as GovernanceDecision["disposition"], reason: "" })) });
    await expect(garbage.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
  });

  test("misconfiguration fails at construction, never at first use", async () => {
    const ok = authority(() => ({ disposition: "allow", reason: "ok" }));
    const base = { store: ":memory:", policy: allowKernel, actions: allowLocal, agents: [echo] };
    await expect(createRuntime({ ...base, governance: { mode: "sea-forge", worldRef: WORLD } })).rejects.toThrow(/authority/);
    await expect(createRuntime({ ...base, governance: { mode: "sea-forge", authority: ok } })).rejects.toThrow(/worldRef/);
    await expect(createRuntime({ ...base, governance: { mode: "sea-forge", authority: ok, worldRef: "world:demo" } })).rejects.toThrow(/worldRef/);
    await expect(createRuntime({ ...base, governance: { mode: "shadow" as "off" } })).rejects.toThrow(/unsupported/);
  });

  test("no code outside governed-operation.ts calls local policy directly", () => {
    const src = join(import.meta.dir, "../src");
    const offenders = readdirSync(src)
      .filter((f) => f.endsWith(".ts") && f !== "governed-operation.ts")
      .filter((f) => /\.actions\.authorize\(|userPolicy|kernelPolicy\.authorize|options\.policy\.authorize/.test(readFileSync(join(src, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
