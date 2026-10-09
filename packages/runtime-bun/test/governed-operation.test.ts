import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Component } from "@godspeedai/cognate-kernel-api";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { createRuntime, timeoutSecsEnforcer, type ConstraintEnforcer, type GovernanceAuthority, type GovernanceDecision, type GovernedOperation, type Runtime } from "../src/index.ts";

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
      const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => ({ disposition, reason: `because ${disposition}`, policyBasis: ["p"] })) });
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

  test("a constrained disposition is allowed only when every constraint is enforced for the operation", async () => {
    const seen: string[] = [];
    const timeout: ConstraintEnforcer = { apply: (constraint) => (seen.push(`${constraint.type}=${constraint.value}`), true) };
    const bounded = (disposition: "boundary" | "constrained_allow" | "degraded") => authority(() => ({ disposition, reason: "bounded", policyBasis: ["p"], constraints: [{ type: "timeout_secs", value: "30" }], compensatingControls: ["audit"] }));
    // no enforcer: refused
    const none = await open({ mode: "sea-forge", worldRef: WORLD, authority: bounded("boundary") });
    await expect(none.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
    await none.close();
    // enforcer for the constraint: allowed, and the constraint was actually applied
    const ok = await open({ mode: "sea-forge", worldRef: WORLD, authority: bounded("boundary"), enforcers: { timeout_secs: timeout } });
    await ok.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() });
    expect(seen).toContain("timeout_secs=30");
    await ok.close();
    // degraded also needs its compensating control enforced
    const missingControl = await open({ mode: "sea-forge", worldRef: WORLD, authority: bounded("degraded"), enforcers: { timeout_secs: timeout } });
    await expect(missingControl.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
    await missingControl.close();
    const full = await open({ mode: "sea-forge", worldRef: WORLD, authority: bounded("degraded"), enforcers: { timeout_secs: timeout, "control:audit": { apply: () => true } } });
    await full.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() });
    await full.close();
    runtime = undefined;
  });

  test("an enforcer that cannot enforce, throws, or answers truthy-but-not-true refuses", async () => {
    const decide = authority(() => ({ disposition: "boundary", reason: "b", policyBasis: ["p"], constraints: [{ type: "timeout_secs", value: "30" }] }));
    for (const apply of [() => false, () => { throw new Error("no"); }, () => "yes" as unknown as boolean]) {
      const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: decide, enforcers: { timeout_secs: { apply } } });
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
      await rt.close();
      runtime = undefined;
    }
  });

  test("a constrained disposition missing its constraints or basis is refused even with enforcers", async () => {
    const enforcers = { timeout_secs: { apply: () => true } };
    for (const decision of [
      { disposition: "boundary" as const, reason: "b", policyBasis: ["p"] },
      { disposition: "boundary" as const, reason: "b", constraints: [{ type: "timeout_secs", value: "1" }] },
    ]) {
      const rt = await open({ mode: "sea-forge", worldRef: WORLD, authority: authority(() => decision), enforcers });
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
      await rt.close();
      runtime = undefined;
    }
  });

  describe("timeout_secs is enforced for capability invocations", () => {
    let sawAbort = false;
    const slow: Component = {
      id: "slow-provider",
      provides: [{ id: "tool.slow", version: "1.0.0" }],
      activate: (fiber) =>
        fiber.provide({ id: "tool.slow", version: "1.0.0" }, (_input, ctx) =>
          new Promise((resolve) => {
            const done = setTimeout(() => resolve({ finished: true }), 6_000);
            ctx.signal.addEventListener("abort", () => ((sawAbort = true), clearTimeout(done), resolve({ aborted: true })), { once: true });
          }),
        ),
    };
    const callsSlow: AgentDefinition = { id: "agent.slow", version: "1.0.0", async run(_input, ctx) { return { output: await ctx.invoke("tool.slow", {}) }; } };
    const bounded = (seconds: string) => authority(() => ({ disposition: "boundary", reason: "bounded", policyBasis: ["p"], constraints: [{ type: "timeout_secs", value: seconds }] }));
    const openBounded = async (seconds: string) => {
      runtime = await createRuntime({ store: ":memory:", policy: allowKernel, actions: allowLocal, agents: [echo, invoker, callsSlow], components: [tool, slow], governance: { mode: "sea-forge", worldRef: WORLD, authority: bounded(seconds), enforcers: { timeout_secs: timeoutSecsEnforcer } } });
      return runtime;
    };

    test("a call that outlives its governed deadline is aborted and fails with deadline_exceeded", async () => {
      sawAbort = false;
      const rt = await openBounded("1");
      // Bounded authority also constrains the run.start action, which a deadline cannot honor, so the
      // action path is refused; invoke the capability directly through the service.
      const started = Date.now();
      await expect(rt.service.invoke(alice, { capability: "tool.slow", input: {} })).rejects.toMatchObject({ code: "deadline_exceeded" });
      expect(Date.now() - started).toBeLessThan(4_000);
      await Bun.sleep(50);
      expect(sawAbort).toBe(true);
    });

    test("a fast call under the same constraint completes normally", async () => {
      const rt = await openBounded("30");
      expect(await rt.service.invoke(alice, { capability: "tool.ping", input: {} })).toEqual({ pong: true });
    });

    test("actions cannot honor a deadline, so a timeout_secs constraint refuses them", async () => {
      const rt = await openBounded("30");
      await expect(rt.service.startRun(alice, { agent: echo.id, input: {}, idempotencyKey: nextKey() })).rejects.toMatchObject({ code: "permission_denied" });
    });

    test("invalid or absurd timeout values are not enforceable", async () => {
      for (const value of ["0", "-1", "1.5", "abc", "3601", "", "1e3", " 5"]) {
        const rt = await openBounded(value);
        await expect(rt.service.invoke(alice, { capability: "tool.ping", input: {} }), value).rejects.toMatchObject({ code: "permission_denied" });
        await rt.close();
        runtime = undefined;
      }
    });
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
