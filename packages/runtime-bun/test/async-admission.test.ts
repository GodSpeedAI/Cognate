import { describe, expect, test } from "bun:test";
import type { AgentDefinition, Caller, RunView } from "@godspeedai/cognate-runtime-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRuntime } from "../src/index.ts";
import { RUNS, runStream } from "../src/fold.ts";
import { ExecutionSlots } from "../src/execution-slots.ts";

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

  test("tracked recovery retries do not rescan the pending outbox on every timer tick", async () => {
    const base = openSqliteStore({ path: ":memory:" });
    const runId = "recovery-scan-bounded";
    const agent: AgentDefinition = { id: "agent.recovery-scan", version: "1.0.0", run: async () => "unused" };
    await base.commit({
      appends: [{ streamId: runStream(runId), expectedVersion: 0, events: [{
        eventType: "run.started", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: caller.tenant,
        correlationId: runId, causationId: null, runId, scopeId: "test-scope",
        payload: { input: null }, metadata: { agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind },
      }] }],
      records: [{ collection: RUNS, id: runId, expectedVersion: 0,
        value: { tenant: caller.tenant, agent: agent.id, correlationId: runId, startedBy: caller.actor.id, scopeId: "test-scope" } }],
    });
    let recoveryPendingQueries = 0;
    const store = new Proxy(base, { get(target, property) {
      if (property === "listOutbox") return async (query: Parameters<typeof target.listOutbox>[0]) => {
        if (query?.topic === "run.execute" && query.status === "pending") {
          recoveryPendingQueries++;
        }
        return target.listOutbox(query);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const runtime = await createRuntime({ store: { store }, agents: [agent], policy, actions,
      execution: { resourceKeys: async () => { throw new Error("recovery lookup temporarily unavailable"); } } });
    try {
      for (let i = 0; i < 100; i++) {
        const pending = await base.listOutbox({ topic: "run.execute", status: "pending" });
        if (pending.some((item) => item.lastError?.includes("recovery lookup temporarily unavailable"))) break;
        await Bun.sleep(5);
      }
      const afterRetry = recoveryPendingQueries;
      expect(afterRetry).toBeGreaterThan(0);
      await Bun.sleep(120);
      expect(recoveryPendingQueries - afterRetry).toBeLessThanOrEqual(1);
    } finally {
      await runtime.close();
      await base.close();
    }
  });

  test("startup recovery scans a backlog in bounded 100-run batches with throttled reconciliation", async () => {
    const base = openSqliteStore({ path: ":memory:" });
    const candidateCount = 250;
    const runIds = Array.from({ length: candidateCount }, (_, index) => `recovery-backlog-${index}`);
    const agent: AgentDefinition = { id: "agent.recovery-backlog", version: "1.0.0", run: async () => "recovered" };
    await base.commit({
      appends: runIds.map((runId) => ({ streamId: runStream(runId), expectedVersion: 0, events: [{
        eventType: "run.started", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: caller.tenant,
        correlationId: runId, causationId: null, runId, scopeId: "test-scope",
        payload: { input: null }, metadata: { agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind },
      }] })),
      records: runIds.map((runId) => ({ collection: RUNS, id: runId, expectedVersion: 0,
        value: { tenant: caller.tenant, agent: agent.id, correlationId: runId, startedBy: caller.actor.id, scopeId: "test-scope" } })),
    });
    let recoveryPendingQueries = 0;
    let firstRecoveryScanAt: number | undefined;
    const store = new Proxy(base, { get(target, property) {
      if (property === "listOutbox") return async (query: Parameters<typeof target.listOutbox>[0]) => {
        if (query?.topic === "run.execute" && query.status === "pending") {
          firstRecoveryScanAt ??= performance.now();
          recoveryPendingQueries++;
        }
        return target.listOutbox(query);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const runtime = await createRuntime({ store: { store }, agents: [agent], policy, actions });
    try {
      for (let i = 0; i < 100 && recoveryPendingQueries === 0; i++) await Bun.sleep(5);
      expect(recoveryPendingQueries).toBeGreaterThan(0);
      const afterFirstScan = recoveryPendingQueries;
      await Bun.sleep(120);
      expect(recoveryPendingQueries - afterFirstScan).toBeLessThanOrEqual(1);

      let completed = 0;
      for (let i = 0; i < 300; i++) {
        completed = (await base.readAll({ limit: 1_000 })).filter((event) => event.eventType === "run.completed").length;
        if (completed === candidateCount) break;
        await Bun.sleep(10);
      }
      expect(completed).toBe(candidateCount);
      expect(performance.now() - firstRecoveryScanAt!).toBeGreaterThan(500);
      expect((await base.listOutbox({ topic: "run.execute", status: "delivered" })).length).toBe(candidateCount);
      expect(recoveryPendingQueries).toBeLessThanOrEqual(4);
    } finally {
      await runtime.close();
      await base.close();
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
        // A run's completion commits before its outbox row settles; wait for the settlement itself.
        let delivered = await runtime.store.listOutbox({ topic: "run.execute", status: "delivered" });
        for (let i = 0; i < 300 && !delivered.some((item) => item.id === `run.execute:${retryingRun}`); i++) {
          await Bun.sleep(10);
          delivered = await runtime.store.listOutbox({ topic: "run.execute", status: "delivered" });
        }
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
      // "waiting" is visible before the first delivery settles. Resolving earlier lets that execution's
      // retry replay the resume in place, bypassing the resumed eligibility lookup this test pins.
      for (let i = 0; i < 200 && !(await database.store.listOutbox({ topic: "run.execute", status: "delivered" })).some((item) => item.id === `run.execute:${run.runId}`); i++) await Bun.sleep(10);
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
      // Completion commits before the recovery row settles; wait for the settlement itself.
      const recoveryDelivered = async () => (await runtime!.store.listOutbox({ topic: "run.execute", status: "delivered" })).some((item) =>
        item.id.startsWith("run.execute:recovery:") && (item.payload as { runId?: string } | null)?.runId === run.runId);
      for (let i = 0; i < 300 && !(await recoveryDelivered()); i++) await Bun.sleep(10);
      expect(await recoveryDelivered()).toBe(true);
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

  test("cancellation while waiting for an execution slot aborts admission and releases late grants", async () => {
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const waiterStarted = deferred<void>();
    const queuedLookup = deferred<void>();
    const signals = new Map<number, AbortSignal>();
    let waiterLookups = 0;
    const effects: number[] = [];
    const agent: AgentDefinition = { id: "agent.cancel-slot-wait", version: "1.0.0", async run(input, ctx) {
      const n = (input as { n: number }).n;
      if (n === 2) {
        waiterStarted.resolve();
        await ctx.waitFor("cancel-slot-wait", {
          type: "test.cancel-slot-wait", condition: { kind: "cancel-slot-wait" }, payload: null,
        });
      }
      return ctx.step("effect", async () => {
        if (n === 1) { firstEntered.resolve(); await releaseFirst.promise; }
        effects.push(n);
        return { n };
      });
    } };
    const runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 1, resourceKeys: (run, signal) => {
        const n = (run.input as { n: number }).n;
        if (signal) signals.set(n, signal);
        if (n === 2 && ++waiterLookups === 2) queuedLookup.resolve();
        return [];
      } } });
    const waitFor = async <T>(promise: Promise<T>, step: string): Promise<T> => Promise.race([
      promise,
      Bun.sleep(1_000).then(() => { throw new Error(`timed out waiting for ${step}`); }),
    ]);
    try {
      const cancelled = await runtime.service.startRun(caller, { agent: agent.id, input: { n: 2 }, idempotencyKey: "cancel-slot-waiter" });
      await waitFor(waiterStarted.promise, "continuation waiter");
      for (let i = 0; i < 100 && (await runtime.service.getRun(caller, { runId: cancelled.runId })).status !== "waiting"; i++) await Bun.sleep(5);
      const continuation = (await runtime.service.listContinuations(caller, { runId: cancelled.runId, status: "OPEN" }))[0];
      expect(continuation).toBeDefined();
      await runtime.service.startRun(caller, { agent: agent.id, input: { n: 1 }, idempotencyKey: "cancel-slot-holder" });
      await waitFor(firstEntered.promise, "slot holder effect");
      await runtime.service.resolveContinuation(caller, {
        continuationId: continuation!.id, action: "cancel", reason: "cancel while waiting for slot", idempotencyKey: "cancel-slot-continuation",
      });
      await waitFor(queuedLookup.promise, "cancelled continuation execution queued for slot");
      await runtime.service.cancelRun(caller, { runId: cancelled.runId, reason: "cancel while waiting for slot", idempotencyKey: "cancel-slot-waiter-run" });
      expect(signals.get(2)?.aborted).toBe(true);
      const next = await runtime.service.startRun(caller, { agent: agent.id, input: { n: 3 }, idempotencyKey: "cancel-slot-next" });
      releaseFirst.resolve();
      await runtime.idle();
      expect((await runtime.service.getRun(caller, { runId: cancelled.runId })).status).toBe("cancelled");
      expect((await runtime.service.getRun(caller, { runId: next.runId })).status).toBe("completed");
      expect(effects.sort()).toEqual([1, 3]);
    } finally {
      releaseFirst.resolve();
      await runtime.close();
    }
  });

  test("runtime close after a slot grant still releases the grant before skipping execution", async () => {
    const originalAcquire = ExecutionSlots.prototype.acquire;
    const slotReleaseObserved = deferred<void>();
    const closeStarted = deferred<void>();
    let runtime: Awaited<ReturnType<typeof createRuntime>>;
    let closePromise: Promise<void> | undefined;
    let acquisitions = 0;
    let effects = 0;
    const agent: AgentDefinition = { id: "agent.close-after-slot-grant", version: "1.0.0", run: async () => {
      effects++;
      return "ran";
    } };
    ExecutionSlots.prototype.acquire = function(keys) {
      const acquisition = originalAcquire.call(this, keys);
      return new Promise((resolve, reject) => {
        acquisition.then((release) => {
          acquisitions++;
          if (acquisitions === 2) {
            resolve(() => { release(); slotReleaseObserved.resolve(); });
            // Let acquireExecutionSlot's grant handler return its permit first, then close before
            // execute() resumes from its await. This forces the late-close branch deterministically.
            queueMicrotask(() => queueMicrotask(() => {
              closePromise = runtime.close();
              closeStarted.resolve();
            }));
          } else resolve(release);
        }, reject);
      });
    };
    runtime = await createRuntime({ store: ":memory:", agents: [agent], policy, actions,
      execution: { maxConcurrentRuns: 1, resourceKeys: async () => [] } });
    try {
      await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "close-after-slot-grant" });
      await Promise.race([closeStarted.promise, Bun.sleep(1_000).then(() => { throw new Error("runtime close was not triggered after slot grant"); })]);
      await closePromise;
      await Promise.race([slotReleaseObserved.promise, Bun.sleep(1_000).then(() => { throw new Error("granted execution slot leaked during close"); })]);
      expect(effects).toBe(0);
    } finally {
      ExecutionSlots.prototype.acquire = originalAcquire;
      await runtime.close();
    }
  });

  test("cancellation during the executor's initial snapshot read prevents stale-snapshot agent entry", async () => {
    const readEntered = deferred<void>();
    const releaseRead = deferred<void>();
    let gateRunId: string | undefined;
    let gateNextRead = false;
    let agentEntries = 0;
    const agent: AgentDefinition = { id: "agent.cancel-snapshot-read", version: "1.0.0", async run() {
      agentEntries++;
      return "must not run";
    } };
    const base = openSqliteStore({ path: ":memory:" });
    const store = new Proxy(base, { get(target, property) {
      if (property === "readStream") return async (streamId: Parameters<typeof target.readStream>[0]) => {
        const snapshot = await target.readStream(streamId);
        if (gateNextRead && gateRunId && streamId === runStream(gateRunId)) {
          gateNextRead = false;
          readEntered.resolve();
          await releaseRead.promise;
        }
        return snapshot;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const runtime = await createRuntime({ store: { store }, agents: [agent], policy, actions,
      execution: { resourceKeys: (run) => { gateRunId = run.runId; gateNextRead = true; return []; } } });
    try {
      const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "cancel-snapshot-read" });
      await readEntered.promise;
      await runtime.service.cancelRun(caller, { runId: run.runId, reason: "cancel during executor read", idempotencyKey: "cancel-snapshot-read-run" });
      releaseRead.resolve();
      await runtime.idle();
      expect(agentEntries).toBe(0);
      expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("cancelled");
    } finally {
      releaseRead.resolve();
      await runtime.close();
      await base.close();
    }
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
