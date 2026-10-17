// Two-process run-write ownership journeys (docs/contracts/run-write-ownership.md). Two
// runtimes against one PostgreSQL store: a worker whose lease expires is fenced at its next
// write; the recovering worker never re-performs the interrupted external effect under
// `ambiguousSteps: "wait"`, records the ambiguity and completes only from an explicit
// reconciliation; the default `reexecute` mode preserves the historical single-process
// restart behavior. These fail, never skip, without the development database.
import { expect, test } from "bun:test";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import type { AgentDefinition, RuntimeService } from "@godspeedai/cognate-runtime-api";
import type { Json } from "@godspeedai/cognate-events";
import { createRuntime } from "../src/index.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

{
  try {
    const probe = await openPostgresStore({ url, schema: `cognate_probe_${Date.now()}`, pollMs: 0 });
    await probe.dropSchema();
    await probe.close();
  } catch (cause) {
    throw new Error(`run-ownership journeys need PostgreSQL (just db-up); ${url} unreachable`, { cause });
  }
}

const caller = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };
const allow = {
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
};

/** Shared handler state: both runtimes mount the same component definition, so the counter and
 * the gate are shared across the two "processes" of the journey. `release` interrupts the
 * handler abort-style; `finish` lets it complete normally. */
interface Gate {
  /** Resolves only when the handler actually starts its blocked stretch (a true deferred —
   * initializing an already-resolved promise would let `await gate.started` race past the run). */
  started: Promise<void>;
  start(): void;
  finishers: (() => void)[];
  aborters: (() => void)[];
}
function makeGate(): Gate {
  let start!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  return { started, start: () => start(), finishers: [], aborters: [] };
}
function blockedTool(gate: Gate) {
  let calls = 0;
  const component = {
    id: "blocked-provider",
    provides: [{ id: "tool.blocked", version: "1.0.0" }],
    activate: (fiber: { provide: (contract: { id: string; version: string }, handler: (input: unknown, ctx: { signal: AbortSignal }) => Promise<unknown>) => void }) => {
      fiber.provide({ id: "tool.blocked", version: "1.0.0" }, async (input, ctx) => {
        calls += 1;
        await (ctx as { progress?: (payload: unknown) => Promise<void> }).progress?.({ started: true });
        gate.start();
        await new Promise<unknown>((resolve, reject) => {
          const abort = () => reject((ctx.signal as AbortSignal & { reason?: Error }).reason ?? new DOMException("aborted", "AbortError"));
          if (ctx.signal.aborted) abort();
          else ctx.signal.addEventListener("abort", abort, { once: true });
          gate.finishers.push(() => resolve(undefined));
          gate.aborters.push(() => abort());
        });
        return { done: true, input };
      });
    },
  };
  return { component, count: () => calls };
}

const workerAgent: AgentDefinition = {
  id: "agent.worker",
  version: "1.0.0",
  run: async (input: Json, ctx: { invoke: (capability: string, input: Json) => Promise<Json> }) => ({ outcome: await ctx.invoke("tool.blocked", input) }),
};

async function awaitStatus(service: RuntimeService, runId: string, status: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = await service.getRun(caller, { runId });
    if (run.status === status) return run;
    if (["completed", "failed", "cancelled"].includes(run.status) && run.status !== status) throw new Error(`run reached ${run.status} while waiting for ${status}`);
    if (Date.now() >= deadline) throw new Error(`timed out waiting for run status ${status} (at ${run.status})`);
    await Bun.sleep(20);
  }
}

test("a reclaimed owner is fenced and the recovering worker reconciles the ambiguous effect without repeating it", async () => {
  const schema = `cognate_own_rt_${Date.now().toString(36)}`;
  const gate = makeGate();
  const tool = blockedTool(gate);
  const make = () => createRuntime({
    store: { postgres: { url, schema } },
    agents: [workerAgent],
    components: [tool.component],
    execution: { runOwnership: { leaseMs: 250, ambiguousSteps: "wait" } },
    ...allow,
  });
  const runtimeA = await make();
  let runtimeB;
  try {
    // Worker A claims the run and starts the external effect (progress recorded under its
    // generation), then dies mid-effect: the cooperative shutdown abort unwinds the handler
    // through the executor's guard, so no invocation outcome is recorded, and A's execution
    // pass releases its ownership.
    const start = await runtimeA.service.startRun(caller, { agent: "agent.worker", input: { hi: 1 }, idempotencyKey: "fence-1" });
    await gate.started;
    await runtimeA.close();

    // Worker B recovers the killed run and claims a fresh generation.
    runtimeB = await make();
    await awaitStatus(runtimeB.service, start.runId, "waiting");

    // The interrupted effect is marked ambiguous: B did not re-perform it, and the killed
    // owner never recorded an outcome.
    expect(tool.count()).toBe(1);
    let ambiguous = 0;
    let lateInvocations = 0;
    for await (const event of runtimeB.service.events(caller, { runId: start.runId })) {
      if (event.eventType === "run.invocation.ambiguous") ambiguous += 1;
      if (event.eventType === "run.invocation") lateInvocations += 1;
    }
    expect(ambiguous).toBe(1);
    expect(lateInvocations).toBe(0);

    // Reconciliation supplies the observed outcome; the run completes from it, not from a repeat.
    const [continuation] = (await runtimeB.service.listContinuations(caller, { runId: start.runId, status: "OPEN" })).filter((c) => c.type === "ambiguous-invocation");
    expect(continuation).toBeDefined();
    await runtimeB.service.resolveContinuation(caller, { continuationId: continuation!.id, action: "resume", input: { result: { reconciled: true } }, idempotencyKey: "reconcile-1" });
    const completed = await awaitStatus(runtimeB.service, start.runId, "completed");
    expect((completed.output as { outcome: { reconciled: boolean } }).outcome).toEqual({ reconciled: true });
    expect(tool.count()).toBe(1);
  } finally {
    for (const abort of gate.aborters) abort();
    await Bun.sleep(100);
    await runtimeA.close().catch(() => {});
    await runtimeB?.close().catch(() => {});
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 45_000);

test("default ambiguousSteps reexecute keeps the historical single-process restart behavior", async () => {
  const schema = `cognate_own_rt_${Date.now().toString(36)}_2`;
  const gate = makeGate();
  const tool = blockedTool(gate);
  const make = () => createRuntime({
    store: { postgres: { url, schema } },
    agents: [workerAgent],
    components: [tool.component],
    execution: { runOwnership: { leaseMs: 250 } },
    ...allow,
  });
  const runtimeA = await make();
  let runtimeB;
  try {
    const start = await runtimeA.service.startRun(caller, { agent: "agent.worker", input: { hi: 2 }, idempotencyKey: "fence-2" });
    await gate.started;
    await runtimeA.close();

    // The killed worker left the effect started but unrecorded. The recovering worker holds a
    // fresh generation and, in the default mode, re-executes the interrupted handler under a
    // fresh attempt number instead of gating on reconciliation — the historical single-process
    // restart behavior.
    runtimeB = await make();
    const deadline = Date.now() + 10_000;
    // Wait for the recovering worker's re-execution to register its own finisher, then let only
    // that second execution complete; the killed worker's call stays interrupted.
    while (gate.finishers.length < 2 && Date.now() < deadline) await Bun.sleep(20);
    gate.finishers[1]!();
    const completed = await awaitStatus(runtimeB.service, start.runId, "completed");
    expect((completed.output as { outcome: { done: boolean; input: unknown } }).outcome).toEqual({ done: true, input: { hi: 2 } });
    expect(tool.count()).toBe(2);
    let ambiguous = 0;
    for await (const event of runtimeB.service.events(caller, { runId: start.runId })) if (event.eventType === "run.invocation.ambiguous") ambiguous += 1;
    expect(ambiguous).toBe(0);
  } finally {
    // Abandon any still-blocked call so execution chains can settle for close.
    for (const abort of gate.aborters) abort();
    await Bun.sleep(100);
    await runtimeA.close().catch(() => {});
    await runtimeB?.close().catch(() => {});
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 45_000);

test("a held-lease back-off re-arms the run and recovers after the lease can lapse", async () => {
  const schema = `cognate_own_rt_${Date.now().toString(36)}_3`;
  const gate = makeGate();
  const tool = blockedTool(gate);
  const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
  const database = await openPostgresStore({ url, schema, maxConnections: 4, pollMs: 0 });
  // Seed a killed worker's residue: a non-terminal run, its pending run.execute intent, and a
  // still-live ownership lease whose holder no longer exists. The recovering worker must refuse
  // the live lease, re-arm itself, and take the run over once the lease can have lapsed.
  const runId = `held-${crypto.randomUUID()}`;
  await database.store.commit({
    appends: [{ streamId: `run-${runId}`, expectedVersion: 0, events: [{
      eventType: "run.started", schemaVersion: 1, occurredAt: new Date().toISOString(),
      tenant: caller.tenant, correlationId: runId, causationId: null, runId, scopeId: "test-scope",
      payload: { input: {} },
      metadata: { agent: "agent.worker", agentVersion: "1.0.0", startedBy: caller.actor.id, startedByKind: caller.actor.kind },
    }] }],
    records: [{ collection: "runs", id: runId, expectedVersion: 0, value: { tenant: caller.tenant, agent: "agent.worker", correlationId: runId, startedBy: caller.actor.id, scopeId: "test-scope" } }],
    outbox: [{ id: `run.execute:${runId}`, topic: "run.execute", payload: { runId } }],
  });
  await database.store.claimRunOwnership!({ runId, ownerId: "dead-worker", now: Date.now(), leaseMs: 5_000 });
  let runtime;
  try {
    runtime = await createRuntime({
      store: { store: database.store },
      agents: [workerAgent],
      components: [tool.component],
      execution: { runOwnership: { leaseMs: 500 } },
      ...allow,
    });
    // Before the fix this stranded forever: the held back-off consumed the only recovery
    // trigger. Now the run completes only after the seeded lease lapsed and the recovery
    // re-armed itself — and the killed worker's lease genuinely refused the first claim.
    const deadline = Date.now() + 20_000;
    while (gate.finishers.length < 1 && Date.now() < deadline) await Bun.sleep(20);
    expect(tool.count()).toBe(1);
    gate.finishers[0]!();
    const completed = await awaitStatus(runtime.service, runId, "completed");
    expect((completed.output as { outcome: { done: boolean; input: unknown } }).outcome).toEqual({ done: true, input: {} });
  } finally {
    for (const abort of gate.aborters) abort();
    await Bun.sleep(100);
    await runtime?.close().catch(() => {});
    await database.close();
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 45_000);
