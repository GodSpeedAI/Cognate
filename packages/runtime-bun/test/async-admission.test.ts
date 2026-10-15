import { describe, expect, test } from "bun:test";
import type { AgentDefinition, Caller, RunView } from "@godspeedai/cognate-runtime-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRuntime } from "../src/index.ts";
import { RUNS, runStream } from "../src/fold.ts";

const caller: Caller = { tenant: "test", actor: { id: "human", kind: "user" } };
const policy = { authorize: () => ({ allow: true as const, policyId: "test", reason: "test" }) };
const actions = { authorize: () => ({ allow: true as const, reason: "test" }) };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("awaitable execution eligibility", () => {
  test("waits for trusted resource lookup before effects and serializes equal keys", async () => {
    const lookups: { workspace: string; gate: ReturnType<typeof deferred<string[]>> }[] = [];
    let activeLookups = 0;
    let peakLookups = 0;
    const active = new Set<string>();
    let peak = 0;
    const agent: AgentDefinition = { id: "agent.async", version: "1.0.0", async run(input, ctx) {
      const workspace = (input as { workspace: string }).workspace;
      return ctx.step("effect", async () => {
        expect(lookups.some((lookup) => lookup.workspace === workspace)).toBe(true);
        if (active.has(workspace)) throw new Error(`overlapping effect for ${workspace}`);
        active.add(workspace); peak = Math.max(peak, active.size);
        try { await Bun.sleep(35); return { workspace }; } finally { active.delete(workspace); }
      });
    } };
    const store = openSqliteStore({ path: ":memory:" });
    const runIds = ["async-same-1", "async-other", "async-same-2"];
    const workspaces = ["same", "other", "same"] as const;
    await store.commit({
      appends: runIds.map((runId, index) => ({ streamId: runStream(runId), expectedVersion: 0,
        events: [{ eventType: "run.started", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: caller.tenant,
          correlationId: runId, causationId: null, runId, scopeId: "test-scope",
          payload: { input: { workspace: workspaces[index]! } },
          metadata: { agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind } }],
      })),
      records: runIds.map((runId) => ({ collection: RUNS, id: runId, expectedVersion: 0,
        value: { tenant: caller.tenant, agent: agent.id, correlationId: runId, startedBy: caller.actor.id, scopeId: "test-scope" } })),
    });
    const runtime = await createRuntime({ store: { store }, agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 2, resourceKeys: async (run: RunView, signal?: AbortSignal) => {
        const workspace = (run.input as { workspace: string }).workspace;
        const lookup = deferred<string[]>(); lookups.push({ workspace, gate: lookup });
        if (signal?.aborted) throw new Error("eligibility aborted");
        activeLookups++; peakLookups = Math.max(peakLookups, activeLookups);
        try { return await lookup.promise; } finally { activeLookups--; }
      } } });
    try {
      for (let i = 0; i < 100 && lookups.length < 2; i++) await Bun.sleep(2);
      expect(lookups).toHaveLength(2);
      expect(activeLookups).toBe(2);
      expect(peakLookups).toBe(2);
      expect(active.size).toBe(0);
      for (const lookup of lookups) lookup.gate.resolve([`root:${lookup.workspace}`]);
      for (let i = 0; i < 100 && lookups.length < 3; i++) await Bun.sleep(2);
      expect(lookups.map((lookup) => lookup.workspace).sort()).toEqual(["other", "same", "same"]);
      lookups[2]!.gate.resolve([`root:${lookups[2]!.workspace}`]);
      await runtime.idle();
      expect(peakLookups).toBeLessThanOrEqual(2);
      expect(peak).toBe(2);
      for (const runId of runIds) expect((await runtime.service.getRun(caller, { runId })).status).toBe("completed");
    } finally { await runtime.close(); await store.close(); }
  });

  test("failed eligibility has no agent effects and remains a durable retry failure", async () => {
    let effects = 0;
    const agent: AgentDefinition = { id: "agent.fail-lookup", version: "1.0.0", run: (_input, ctx) =>
      ctx.step("effect", () => { effects++; return "ran"; }) };
    const runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 2, resourceKeys: async () => { throw new Error("metadata unavailable"); } } });
    try {
      const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "lookup-fails" });
      for (let i = 0; i < 100; i++) {
        const item = (await runtime.store.listOutbox({ topic: "run.execute", status: "pending" })).find((candidate) => candidate.lastError);
        if (item) { expect(item.lastError).toContain("metadata unavailable"); break; }
        await Bun.sleep(5);
      }
      expect(effects).toBe(0);
      expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("running");
      expect((await runtime.store.listOutbox({ topic: "run.execute", status: "pending" })).some((item) => item.lastError?.includes("metadata unavailable"))).toBe(true);
    } finally { await runtime.close(); }
  });

  test("invalid eligibility results remain retryable instead of delivering work", async () => {
    for (const invalid of [undefined, null]) {
      let effects = 0;
      const agent: AgentDefinition = { id: `agent.invalid-lookup-${String(invalid)}`, version: "1.0.0", run: (_input, ctx) =>
        ctx.step("effect", () => { effects++; return "ran"; }) };
      const runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
        execution: { resourceKeys: async () => invalid as unknown as readonly string[] } });
      try {
        const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: `invalid-lookup-${String(invalid)}` });
        let pending: { id: string; lastError?: string | null } | undefined;
        for (let i = 0; i < 100; i++) {
          pending = (await runtime.store.listOutbox({ topic: "run.execute", status: "pending" })).find((item) => item.lastError);
          if (pending) break;
          await Bun.sleep(5);
        }
        expect(effects).toBe(0);
        expect(pending?.lastError).toContain("execution.resourceKeys must resolve to an array");
        expect((await runtime.store.listOutbox({ topic: "run.execute", status: "delivered" })).some((item) => item.id === pending?.id)).toBe(false);
        expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("running");
      } finally { await runtime.close(); }
    }
  });

  test("cancellation while eligibility lookup is pending prevents agent work", async () => {
    const lookup = deferred<readonly string[]>();
    const entered = deferred<void>();
    let effects = 0;
    let receivedSignal: AbortSignal | undefined;
    const agent: AgentDefinition = { id: "agent.cancel-lookup", version: "1.0.0", run: (_input, ctx) =>
      ctx.step("effect", () => { effects++; return "ran"; }) };
    const runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 2, resourceKeys: (_run, signal) => { receivedSignal = signal; entered.resolve(); return lookup.promise; } } });
    try {
      const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "cancel-lookup" });
      await entered.promise;
      await runtime.service.cancelRun(caller, { runId: run.runId, reason: "cancel before lookup", idempotencyKey: "cancel-before-eligibility" });
      expect(receivedSignal?.aborted).toBe(true);
      await runtime.idle();
      expect(effects).toBe(0);
      expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("cancelled");
      lookup.reject(new Error("late cancelled lookup rejection"));
      await Bun.sleep(0);
    } finally { await runtime.close(); }
  });

  test("close aborts and releases a never-settling eligibility lookup", async () => {
    const entered = deferred<void>();
    const pending = deferred<readonly string[]>();
    let receivedSignal: AbortSignal | undefined;
    const agent: AgentDefinition = { id: "agent.close-lookup", version: "1.0.0", run: async () => "ran" };
    const runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 2, resourceKeys: (_run, signal) => {
        receivedSignal = signal; entered.resolve(); return pending.promise;
      } } });
    await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "close-lookup" });
    await entered.promise;
    await Promise.race([runtime.close(), Bun.sleep(500).then(() => { throw new Error("close hung on eligibility"); })]);
    expect(receivedSignal?.aborted).toBe(true);
    pending.reject(new Error("late lookup rejection"));
  });

  test("cancelled lookup retains its bounded permit until the callback actually settles (PostgreSQL)", async () => {
    const database = await openPostgresStore({
      url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
      schema: `cognate_admission_cancel_${crypto.randomUUID().replaceAll("-", "")}`,
      pollMs: 0,
    });
    const abandonedLookup = deferred<readonly string[]>();
    const firstEntered = deferred<void>();
    const secondEntered = deferred<void>();
    let lookupCalls = 0;
    let effects = 0;
    const agent: AgentDefinition = { id: "agent.cancelled-eligibility-permit", version: "1.0.0", run: (_input, ctx) =>
      ctx.step("effect", () => { effects++; return "ran"; }) };
    const runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 1, resourceKeys: (run: RunView) => {
        lookupCalls++;
        const n = (run.input as { n: number }).n;
        if (n === 1) { firstEntered.resolve(); return abandonedLookup.promise; }
        secondEntered.resolve();
        return [`resource:${n}`];
      } } });
    try {
      const first = await runtime.service.startRun(caller, { agent: agent.id, input: { n: 1 }, idempotencyKey: "cancelled-lookup-first" });
      await firstEntered.promise;
      await runtime.service.cancelRun(caller, { runId: first.runId, reason: "cancel pending eligibility", idempotencyKey: "cancelled-lookup-first-run" });
      const second = await runtime.service.startRun(caller, { agent: agent.id, input: { n: 2 }, idempotencyKey: "cancelled-lookup-second" });
      await Bun.sleep(40);
      expect(lookupCalls).toBe(1);
      expect(effects).toBe(0);

      abandonedLookup.reject(new Error("late eligibility rejection"));
      await secondEntered.promise;
      await runtime.idle();
      expect(lookupCalls).toBe(2);
      expect(effects).toBe(1);
      expect((await runtime.service.getRun(caller, { runId: first.runId })).status).toBe("cancelled");
      expect((await runtime.service.getRun(caller, { runId: second.runId })).status).toBe("completed");
    } finally {
      abandonedLookup.reject(new Error("cleanup"));
      await runtime.close();
      await database.dropSchema();
      await database.close();
    }
  });
});
