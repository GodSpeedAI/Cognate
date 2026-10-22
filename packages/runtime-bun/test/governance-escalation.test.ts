import { afterEach, describe, expect, test } from "bun:test";
import type { Component } from "@godspeedai/cognate-kernel-api";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { type ApprovalReference, type ApprovalState, createRuntime, type GovernanceAuthority, type GovernanceDecision, type GovernedOperation, type Runtime } from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;
const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
let key = 0;
const nextKey = () => `e${++key}`;

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> {
  const end = Date.now() + 5_000;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(10);
  }
}

describe("governance escalation: durable wait and revalidated resume", () => {
  let runtime: Runtime | undefined;
  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  /** A scriptable authority that escalates capability calls until `approved`, and records every question. */
  const script = (options: { expiresInMs?: number } = {}) => {
    const asked: { approval: string | undefined; kind: string }[] = [];
    const state = { value: "pending" as ApprovalState, approvedForRevalidation: false };
    const authority: GovernanceAuthority = {
      decide(operation: GovernedOperation, _world: string, approval?: ApprovalReference): GovernanceDecision {
        asked.push({ approval: approval?.approvalId, kind: operation.kind });
        if (operation.kind !== "capability") return { disposition: "allow", reason: "actions allowed" };
        if (approval && state.approvedForRevalidation) return { disposition: "allow", reason: "approved" };
        return { disposition: "escalate", reason: "needs a human", escalation: { approvalId: "apr-op-1", ...(options.expiresInMs ? { expiresAt: Date.now() + options.expiresInMs } : {}) } };
      },
      approvalState: async () => state.value,
    };
    return { authority, asked, state };
  };

  let providerRuns = 0;
  const tool: Component = { id: "tool-provider", provides: [{ id: "tool.ping", version: "1.0.0" }], activate: (fiber) => fiber.provide({ id: "tool.ping", version: "1.0.0" }, () => (providerRuns++, { pong: true })) };
  const agent: AgentDefinition = { id: "agent.pinger", version: "1.0.0", async run(_i, ctx) { return { output: await ctx.invoke("tool.ping", {}) }; } };

  const open = async (authority: GovernanceAuthority) => {
    providerRuns = 0;
    runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [agent],
      components: [tool],
      governance: { mode: "sea-forge", worldRef: WORLD, authority },
    });
    return runtime;
  };
  const status = (rt: Runtime, runId: string) => rt.service.getRun(alice, { runId }).then((r) => r.status);

  test("an escalated capability call waits durably; the provider has not run and the authority was asked once", async () => {
    const { authority, asked } = script();
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "waiting", "run waits");
    expect(providerRuns).toBe(0);
    expect(asked.filter((a) => a.kind === "capability")).toHaveLength(1);
    const waits = await rt.service.listContinuations(alice, { runId: run.runId, status: "OPEN" });
    expect(waits.map((w) => w.type)).toEqual(["governance-approval"]);
    expect(waits[0]!.condition).toEqual({ kind: "governance_approval", approvalId: "apr-op-1" });
  });

  test("polling while still pending does nothing; once approved it resumes, revalidates with the approval, and runs once", async () => {
    const { authority, asked, state } = script();
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "waiting", "waits");

    expect(await rt.pollApprovals()).toBe(0);
    expect(await status(rt, run.runId)).toBe("waiting");

    state.value = "approved";
    state.approvedForRevalidation = true;
    expect(await rt.pollApprovals()).toBe(1);
    await until(() => status(rt, run.runId), (s) => s === "completed", "run completes");
    expect(providerRuns).toBe(1);
    // The run re-executes from the start on resume, yet the escalation was asked about exactly once,
    // and the second capability question carried the approval being relied on.
    expect(asked.filter((a) => a.kind === "capability" && a.approval === undefined)).toHaveLength(1);
    expect(asked.filter((a) => a.kind === "capability" && a.approval === "apr-op-1")).toHaveLength(1);
    // A second poll finds nothing left to do.
    expect(await rt.pollApprovals()).toBe(0);
  });

  test("a resume while the authority does not agree fails closed: a poke cannot approve anything", async () => {
    const { authority, asked } = script();
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "waiting", "waits");
    const [wait] = await rt.service.listContinuations(alice, { runId: run.runId, status: "OPEN" });
    // Someone resumes the continuation by hand with an input claiming approval.
    await rt.service.resolveContinuation(alice, { continuationId: wait!.id, action: "resume", input: { approved: true }, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "failed", "run fails closed");
    expect(providerRuns).toBe(0);
    expect(asked.some((a) => a.approval === "apr-op-1")).toBe(true);
  });

  test("a rejected approval closes the wait and fails the run without running the provider", async () => {
    const { authority, state } = script();
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "waiting", "waits");
    state.value = "rejected";
    expect(await rt.pollApprovals()).toBe(1);
    await until(() => status(rt, run.runId), (s) => s === "failed", "run fails");
    expect(providerRuns).toBe(0);
  });

  test("an approval window that closes expires the wait and fails the run", async () => {
    const { authority } = script({ expiresInMs: 200 });
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "waiting", "waits");
    await until(() => status(rt, run.runId), (s) => s === "failed", "run fails after expiry");
    expect(providerRuns).toBe(0);
  });

  test("an escalation that no approval can satisfy is a plain refusal, not a wait", async () => {
    const authority: GovernanceAuthority = { decide: (op) => (op.kind === "capability" ? { disposition: "escalate", reason: "identity unresolved" } : { disposition: "allow", reason: "ok" }) };
    const rt = await open(authority);
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => status(rt, run.runId), (s) => s === "failed", "run fails");
    expect(await rt.service.listContinuations(alice, { runId: run.runId, status: "OPEN" })).toEqual([]);
    expect(providerRuns).toBe(0);
  });

  test("a direct service.invoke escalation is refused and names the approval", async () => {
    const { authority } = script();
    const rt = await open(authority);
    await expect(rt.service.invoke(alice, { capability: "tool.ping", input: {} })).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("apr-op-1") });
    expect(providerRuns).toBe(0);
  });
});

describe("governance: an approval belongs to the operation it was granted for", () => {
  let runtime: Runtime | undefined;
  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  test("a provider's nested calls during an approved revalidation are governed on their own, without the approval", async () => {
    // Like SEA-Forge: tool.outer escalates until approved; any call citing an approval granted for a
    // different operation is refused; tool.inner on its own is allowed.
    const asked: { capability: string; approval: string | undefined }[] = [];
    let approved = false;
    const authority: GovernanceAuthority = {
      decide(operation: GovernedOperation, _world: string, approval?: ApprovalReference): GovernanceDecision {
        if (operation.kind !== "capability") return { disposition: "allow", reason: "actions allowed" };
        const capability = operation.request.capability.id;
        asked.push({ capability, approval: approval?.approvalId });
        if (capability === "tool.inner") {
          return approval ? { disposition: "deny", reason: "approval was granted for another operation" } : { disposition: "allow", reason: "inner allowed" };
        }
        if (approval && approved) return { disposition: "allow", reason: "approved" };
        return { disposition: "escalate", reason: "needs a human", escalation: { approvalId: "apr-outer" } };
      },
      approvalState: async () => (approved ? "approved" : "pending"),
    };
    let innerRuns = 0;
    let outerRuns = 0;
    const inner: Component = { id: "inner", provides: [{ id: "tool.inner", version: "1.0.0" }], activate: (fiber) => fiber.provide({ id: "tool.inner", version: "1.0.0" }, () => (innerRuns++, { inner: true })) };
    const outer: Component = {
      id: "outer",
      provides: [{ id: "tool.outer", version: "1.0.0" }],
      requires: { inner: { capability: "tool.inner" } },
      activate: (fiber) => fiber.provide({ id: "tool.outer", version: "1.0.0" }, async (_input, ctx) => {
        outerRuns++;
        const result = await fiber.dependencies.inner!.invoke({}, ctx);
        if (!result.ok) throw new Error(`nested call refused: ${JSON.stringify(result.failure)}`);
        return { outer: true, nested: result.value };
      }),
    };
    const agent: AgentDefinition = { id: "agent.outer", version: "1.0.0", async run(_i, ctx) { return { output: await ctx.invoke("tool.outer", {}) }; } };
    runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [agent],
      components: [inner, outer],
      governance: { mode: "sea-forge", worldRef: WORLD, authority },
    });
    const rt = runtime;
    const run = await rt.service.startRun(alice, { agent: agent.id, input: {}, idempotencyKey: nextKey() });
    await until(() => rt.service.getRun(alice, { runId: run.runId }).then((r) => r.status), (s) => s === "waiting", "waits on approval");
    expect(outerRuns).toBe(0);

    approved = true;
    expect(await rt.pollApprovals()).toBe(1);
    const done = await until(() => rt.service.getRun(alice, { runId: run.runId }), (r) => r.status !== "running" && r.status !== "waiting", "run finishes");
    expect(done.status).toBe("completed");
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);
    // The approval was cited only for the operation it was granted for.
    expect(asked.filter((a) => a.approval !== undefined).map((a) => a.capability)).toEqual(["tool.outer"]);
  });
});

