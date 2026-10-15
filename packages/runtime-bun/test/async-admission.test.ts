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

  test("recovered PostgreSQL runs retry failed eligibility through the durable dispatcher", async () => {
    const database = await openPostgresStore({
      url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
      schema: `cognate_admission_recovery_${crypto.randomUUID().replaceAll("-", "")}`,
      pollMs: 0,
    });
    let effects = 0;
    const deliveredRun = `recovered-${crypto.randomUUID()}`;
    const retryingRun = `retrying-${crypto.randomUUID()}`;
    const runIds = [deliveredRun, retryingRun];
    let deliveredLookups = 0;
    let retryingLookups = 0;
    const agent: AgentDefinition = { id: "agent.recovered-eligibility", version: "1.0.0", run: (_input, ctx) =>
      ctx.step("effect", () => { effects++; return "ran"; }) };
    try {
      await database.store.commit({
        appends: runIds.map((runId) => ({ streamId: runStream(runId), expectedVersion: 0, events: [{
          eventType: "run.started", schemaVersion: 1, occurredAt: new Date().toISOString(),
          tenant: caller.tenant, correlationId: runId, causationId: null, runId, scopeId: "test-scope",
          payload: { input: null },
          metadata: { agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind },
        }] })),
        records: runIds.map((runId) => ({ collection: RUNS, id: runId, expectedVersion: 0, value: {
          tenant: caller.tenant, agent: agent.id, correlationId: runId, startedBy: caller.actor.id, scopeId: "test-scope",
        } })),
        outbox: runIds.map((runId) => ({ id: `run.execute:${runId}`, topic: "run.execute", payload: { runId } })),
      });
      const originals = await database.store.claimOutbox({ topic: "run.execute", now: Date.now(), limit: 2, leaseMs: 1_000 });
      expect(originals.map((item) => item.id).sort()).toEqual(runIds.map((runId) => `run.execute:${runId}`).sort());
      await database.store.settleOutbox(`run.execute:${deliveredRun}`, { kind: "delivered", receipt: { seeded: true } });
      await database.store.settleOutbox(`run.execute:${retryingRun}`, { kind: "retry", error: "seeded backoff", retryAt: Date.now() + 1_500 });

      const runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions,
        execution: { resourceKeys: async (view) => {
          if (view.runId === deliveredRun) {
            deliveredLookups++;
            if (deliveredLookups === 1) throw new Error("recovered metadata temporarily unavailable");
          } else {
            retryingLookups++;
          }
          return ["recovered:workspace"];
        } } });
      try {
        for (let i = 0; i < 150 && (await runtime.service.getRun(caller, { runId: deliveredRun })).status !== "completed"; i++) await Bun.sleep(10);
        expect(deliveredLookups).toBeGreaterThanOrEqual(2);
        expect(retryingLookups).toBe(0);
        expect((await runtime.service.getRun(caller, { runId: retryingRun })).status).toBe("running");
        for (let i = 0; i < 300; i++) {
          const states = await Promise.all(runIds.map((runId) => runtime.service.getRun(caller, { runId })));
          if (states.every((view) => view.status === "completed")) break;
          await Bun.sleep(10);
        }
        expect(effects).toBe(2);
        for (const runId of runIds) expect((await runtime.service.getRun(caller, { runId })).status).toBe("completed");
        expect(retryingLookups).toBe(1);
        const delivered = await runtime.store.listOutbox({ topic: "run.execute", status: "delivered" });
        const recovery = delivered.filter((item) => (item.payload as { runId?: string } | null)?.runId === deliveredRun);
        expect(recovery.length).toBeGreaterThanOrEqual(2);
        expect(recovery.find((item) => item.id !== `run.execute:${deliveredRun}`)?.attempts).toBeGreaterThanOrEqual(2);
        expect(delivered.some((item) => item.id.includes(":recovery:") && (item.payload as { runId?: string } | null)?.runId === retryingRun)).toBe(false);
        expect(delivered.find((item) => item.id === `run.execute:${retryingRun}`)?.attempts).toBeGreaterThanOrEqual(2);
      } finally { await runtime.close(); }
    } finally {
      await database.dropSchema();
      await database.close();
    }
  });

  test("PostgreSQL RESUMED recovery retries failed eligibility without another restart", async () => {
    const database = await openPostgresStore({
      url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
      schema: `cognate_admission_resumed_${crypto.randomUUID().replaceAll("-", "")}`,
      pollMs: 0,
    });
    const resumedLookupEntered = deferred<void>();
    const releaseResumedLookup = deferred<readonly string[]>();
    const resumedLookupAborted = deferred<void>();
    let firstRuntimeLookups = 0;
    let secondRuntimeLookups = 0;
    const agent: AgentDefinition = { id: "agent.resumed-eligibility-retry", version: "1.0.0", async run(_input, ctx) {
      const answer = await ctx.waitFor("resume-retry", {
        type: "test.resume-retry", condition: { kind: "resume-retry" }, payload: { marker: "persisted" },
      });
      return { answer };
    } };
    let runtime: Awaited<ReturnType<typeof createRuntime>> | undefined;
    try {
      runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions,
        execution: { maxConcurrentRuns: 1, resourceKeys: (_run, signal) => {
          firstRuntimeLookups++;
          if (firstRuntimeLookups === 1) return [];
          resumedLookupEntered.resolve();
          signal?.addEventListener("abort", () => resumedLookupAborted.resolve(), { once: true });
          return releaseResumedLookup.promise;
        } } });
      const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "resumed-eligibility-recovery" });
      for (let i = 0; i < 200 && (await runtime.service.getRun(caller, { runId: run.runId })).status !== "waiting"; i++) await Bun.sleep(10);
      const continuation = (await runtime.service.listContinuations(caller, { runId: run.runId, status: "OPEN" }))[0];
      expect(continuation).toBeDefined();
      await runtime.service.resolveContinuation(caller, {
        continuationId: continuation!.id, action: "resume", input: { answer: "continue" }, idempotencyKey: "resume-for-eligibility-recovery",
      });
      await resumedLookupEntered.promise;
      await runtime.close();
      runtime = undefined;
      await resumedLookupAborted.promise;
      expect((await database.store.readStream(runStream(run.runId))).some((event) => event.eventType === "run.resumed")).toBe(false);
      expect((await database.store.listOutbox({ topic: "continuation.resume", status: "delivered" })).some((item) =>
        (item.payload as { continuationId?: string } | null)?.continuationId === continuation!.id)).toBe(true);
      releaseResumedLookup.resolve([]);

      runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions,
        execution: { maxConcurrentRuns: 1, resourceKeys: async () => {
          secondRuntimeLookups++;
          if (secondRuntimeLookups === 1) throw new Error("resumed metadata temporarily unavailable");
          return [];
        } } });
      for (let i = 0; i < 300; i++) {
        const view = await runtime.service.getRun(caller, { runId: run.runId });
        if (view.status === "completed") break;
        await Bun.sleep(10);
      }
      expect(secondRuntimeLookups).toBeGreaterThanOrEqual(2);
      expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("completed");
      expect((await runtime.service.getRun(caller, { runId: run.runId })).output).toEqual({ answer: { answer: "continue" } });
      expect((await database.store.readStream(runStream(run.runId))).filter((event) => event.eventType === "run.resumed")).toHaveLength(1);
      expect((await runtime.store.listOutbox({ topic: "run.execute", status: "delivered" })).some((item) =>
        item.id.startsWith("run.execute:recovery:") && (item.payload as { runId?: string } | null)?.runId === run.runId)).toBe(true);
    } finally {
      releaseResumedLookup.resolve([]);
      await runtime?.close();
      await database.dropSchema();
      await database.close();
    }
  }, 30_000);

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
