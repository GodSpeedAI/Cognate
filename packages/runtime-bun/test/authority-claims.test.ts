// Authority claims: what a run asserts about one governed capability call travels verbatim to the authority with
// the decision request (SEA-Forge: `claims` in the authority_request extension) and is recorded with the
// invocation. Claims belong to the call that made them: a later call carries none, and an approved escalation is
// revalidated with the same claims. Invalid claims are refused before anything is recorded or sent.
import { afterEach, describe, expect, test } from "bun:test";
import type { Component } from "@godspeedai/cognate-kernel-api";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import {
  type ApprovalReference,
  type ApprovalState,
  type GovernanceAuthority,
  type GovernanceDecision,
  type GovernedOperation,
  type Runtime,
  assertAuthorityClaims,
  buildAuthorityRequest,
  createRuntime,
} from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;
const alice = { tenant: "tenant-a", actor: { id: "alice", kind: "user" as const } };
const CLAIMS = { expectation_digest: `sha256:${"b".repeat(64)}`, threshold_id: "thr-01", threshold_position: 42 };
let key = 0;

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> {
  const end = Date.now() + 5_000;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(10);
  }
}

describe("authority claims in the SEA-Forge envelope", () => {
  const request = { operation: "invoke", actor: alice.actor, tenant: alice.tenant, scopeId: "s", capability: { id: "tool.write", version: "1.0.0" }, providerId: "p", correlationId: "corr-1" };

  test("claims ride in the request profile extension, verbatim", () => {
    const { envelope } = buildAuthorityRequest({ kind: "capability", request, claims: CLAIMS } as GovernedOperation, WORLD);
    const ext = (envelope.extensions as Record<string, Record<string, unknown>>)["godspeed.authority_request"]!;
    expect(ext.claims).toEqual(CLAIMS);
    expect(ext.resource_id).toBe("tool.write");
  });

  test("an operation without claims sends no claims field", () => {
    const { envelope } = buildAuthorityRequest({ kind: "capability", request } as GovernedOperation, WORLD);
    const ext = (envelope.extensions as Record<string, Record<string, unknown>>)["godspeed.authority_request"]!;
    expect("claims" in ext).toBe(false);
  });

  test("claims are bounded, flat and scalar", () => {
    expect(assertAuthorityClaims(CLAIMS)).toEqual(CLAIMS);
    expect(() => assertAuthorityClaims({})).toThrow(/1 to 16 entries/);
    expect(() => assertAuthorityClaims({ "Bad-Key": "x" })).toThrow(/must match/);
    expect(() => assertAuthorityClaims({ nested: { a: 1 } })).toThrow(/string or a finite number/);
    expect(() => assertAuthorityClaims({ n: Number.NaN })).toThrow(/finite number/);
    expect(() => assertAuthorityClaims({ s: "x".repeat(513) })).toThrow(/1 to 512 characters/);
    expect(() => assertAuthorityClaims(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])))).toThrow(/1 to 16 entries/);
  });
});

describe("authority claims through a governed run", () => {
  let runtime: Runtime | undefined;
  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  const tool: Component = {
    id: "tool-provider",
    provides: [{ id: "tool.write", version: "1.0.0" }, { id: "tool.read", version: "1.0.0" }],
    activate: (fiber) => {
      fiber.provide({ id: "tool.write", version: "1.0.0" }, () => ({ wrote: true }));
      fiber.provide({ id: "tool.read", version: "1.0.0" }, () => ({ read: true }));
    },
  };

  /** Records every capability question; escalates tool.write until approved when `escalate` is set. */
  function authority(options: { escalate?: boolean } = {}) {
    const asked: { capability: string; claims: unknown; approval: string | undefined }[] = [];
    const state = { value: "pending" as ApprovalState, approved: false };
    const value: GovernanceAuthority = {
      decide(operation: GovernedOperation, _world: string, approval?: ApprovalReference): GovernanceDecision {
        if (operation.kind !== "capability") return { disposition: "allow", reason: "actions allowed" };
        asked.push({ capability: operation.request.capability.id, claims: operation.claims ?? null, approval: approval?.approvalId });
        if (options.escalate && operation.request.capability.id === "tool.write" && !(approval && state.approved)) {
          return { disposition: "escalate", reason: "needs a human", escalation: { approvalId: "apr-op-1" } };
        }
        return { disposition: "allow", reason: "ok" };
      },
      approvalState: async () => state.value,
    };
    return { value, asked, state };
  }

  const open = async (agent: AgentDefinition, governance: GovernanceAuthority) => {
    runtime = await createRuntime({
      store: ":memory:",
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [agent],
      components: [tool],
      governance: { mode: "sea-forge", worldRef: WORLD, authority: governance },
    });
    return runtime;
  };

  const writer: AgentDefinition = {
    id: "agent.writer",
    version: "1.0.0",
    async run(_input, ctx) {
      const wrote = await ctx.invoke("tool.write", {}, { authorityClaims: CLAIMS });
      const read = await ctx.invoke("tool.read", {});
      return { wrote, read };
    },
  };

  test("the owning call's claims reach the authority and Cognate's invocation record; a later call carries none", async () => {
    const gov = authority();
    const rt = await open(writer, gov.value);
    const run = await rt.service.startRun(alice, { agent: writer.id, input: {}, idempotencyKey: `c${++key}` });
    await until(() => rt.service.getRun(alice, { runId: run.runId }).then((r) => r.status), (s) => s === "completed", "run completes");
    expect(gov.asked).toEqual([
      { capability: "tool.write", claims: CLAIMS, approval: undefined },
      { capability: "tool.read", claims: null, approval: undefined },
    ]);
    const invocations = (await rt.store.readStream(`run-${run.runId}`, {})).filter((e) => e.eventType === "run.invocation");
    expect(invocations.map((e) => (e.metadata as Record<string, unknown>).authorityClaims ?? null)).toEqual([CLAIMS, null]);
  });

  test("an approved escalation is revalidated with the same claims", async () => {
    const gov = authority({ escalate: true });
    const rt = await open(writer, gov.value);
    const run = await rt.service.startRun(alice, { agent: writer.id, input: {}, idempotencyKey: `c${++key}` });
    await until(() => rt.service.getRun(alice, { runId: run.runId }).then((r) => r.status), (s) => s === "waiting", "run waits");
    gov.state.value = "approved";
    gov.state.approved = true;
    await rt.pollApprovals();
    await until(() => rt.service.getRun(alice, { runId: run.runId }).then((r) => r.status), (s) => s === "completed", "run completes after approval");
    const writes = gov.asked.filter((entry) => entry.capability === "tool.write");
    expect(writes).toEqual([
      { capability: "tool.write", claims: CLAIMS, approval: undefined },
      { capability: "tool.write", claims: CLAIMS, approval: "apr-op-1" },
    ]);
  });

  test("invalid claims are refused before the authority is asked or anything is recorded", async () => {
    const gov = authority();
    const bad: AgentDefinition = {
      id: "agent.bad",
      version: "1.0.0",
      async run(_input, ctx) {
        return ctx.invoke("tool.write", {}, { authorityClaims: { nested: { no: true } } as never });
      },
    };
    const rt = await open(bad, gov.value);
    const run = await rt.service.startRun(alice, { agent: bad.id, input: {}, idempotencyKey: `c${++key}` });
    const view = await until(() => rt.service.getRun(alice, { runId: run.runId }), (r) => r.status === "failed", "run fails");
    expect(view.error).toContain("string or a finite number");
    expect(gov.asked).toHaveLength(0);
    expect((await rt.store.readStream(`run-${run.runId}`, {})).some((e) => e.eventType === "run.invocation")).toBe(false);
  });
});
