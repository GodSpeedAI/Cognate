// Review of PR #93: the assignment lifecycle stream's version is the lifecycle revision. Every test orders its races
// with explicit barriers (a store proxy that parks a chosen commit), never with sleeps.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConcurrencyError, fingerprint, type StoredEvent } from "@godspeedai/cognate-events";
import { type AgentDefinition, type Assignment, AssignmentRefusedError, type AssignmentView, type Caller, formatAssignmentId, ServiceError, type SpendEntry, spendOf as zeroSpend } from "@godspeedai/cognate-runtime-api";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRuntime, type Runtime } from "../src/index.ts";

/** Spent amount of one currency in a spend vector. */
const spentIn = (spend: readonly SpendEntry[], currency: string) => spend.find((s) => s.currency === currency)!.spent;
const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };
const BASE: Assignment = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "runtime-api", "test", "fixtures", "assignment", "valid", "assignment-first-delegation.json"), "utf8"));
const assignment: Assignment = { ...BASE, k: 1, assignment_id: formatAssignmentId({ caseId: BASE.case_id, stepId: BASE.step_id, n: BASE.n, k: 1 }) };
const caseContext = { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: assignment.case_id, planItemId: assignment.step_id, role: "executor", kind: "evaluated" } as const;

interface Deferred { readonly promise: Promise<void>; readonly resolve: () => void }
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const gates = new Map<string, Deferred>();
const gate = (name: string) => (gates.has(name) ? gates.get(name)! : (gates.set(name, deferred()), gates.get(name)!));
const effects: string[] = [];
const started = deferred();
let passes = 0;
let exits = 0;
const emitErrors: string[] = [];
const agents: AgentDefinition[] = [
  {
    id: "agent.gated",
    version: "1",
    run: async (input, ctx) => {
      await ctx.step("first", () => 1);
      await gate((input as { gate: string }).gate).promise;
      await ctx.step("second", () => 2);
      return { done: true };
    },
  },
  {
    id: "agent.streaming",
    version: "1",
    run: async (_input, ctx) => {
      passes++;
      try {
        for (let i = 0; i < 400; i++) {
          await ctx.emit("progress", { i });
          await Bun.sleep(1);
        }
        return { done: true };
      } finally {
        exits++;
      }
    },
  },
  {
    id: "agent.stepper",
    version: "1",
    run: async (_input, ctx) => {
      await ctx.step("work", async () => {
        started.resolve();
        await gate("h5").promise;
        effects.push("work");
        return 1;
      });
      return { done: true };
    },
  },
  {
    id: "agent.forger",
    version: "1",
    run: async (_input, ctx) => {
      await ctx.step("first", () => 1);
      try {
        await ctx.emit("assignment.interrupted", { forged: true });
      } catch (error) {
        emitErrors.push((error as Error).message);
      }
      await gate("forger").promise;
      return { done: true };
    },
  },
];

type Commit = { readonly types: readonly string[]; readonly streams: readonly string[] };
let runtime: Runtime | undefined;
let dir: string | undefined;
afterEach(async () => {
  for (const g of gates.values()) g.resolve();
  gates.clear();
  await runtime?.close();
  runtime = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
  passes = exits = 0;
  progressWaiters = [];
  emitErrors.length = 0;
  effects.length = 0;
});

/** Resolves when a progress event has been committed after this call (a barrier on the executor, not a sleep). */
let progressCommits = 0;
let progressWaiters: (() => void)[] = [];
const nextProgress = () => new Promise<void>((resolve) => progressWaiters.push(resolve));
const progressNotify = () => {
  progressCommits++;
  const waiting = progressWaiters;
  progressWaiters = [];
  for (const w of waiting) w();
};
type BootOptions = {
  before?: (commit: Commit) => Promise<void> | undefined;
  /** Fail a commit (before it is applied) with this error. */
  failCommit?: (commit: Commit) => Error | undefined;
  /** Observe a stream read (before it is served). */
  onRead?: (streamId: string, rest: unknown[]) => void;
  file?: string;
  outboxFor?: (e: { eventType: string; runId: string | null; streamSequence: number }) => [];
};
/** A runtime on an in-memory (or file) store whose commits pass through `before`, which may park them. */
async function boot(opts: BootOptions = {}) {
  const inner = openSqliteStore({ path: opts.file ?? ":memory:" });
  const store = new Proxy(inner, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "readStream") {
        return (streamId: string, ...rest: unknown[]) => (opts.onRead?.(streamId, rest), (value as (...a: unknown[]) => Promise<unknown>).apply(target, [streamId, ...rest]));
      }
      if (prop !== "commit") return typeof value === "function" ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        const appends = (args[0] as { appends: { streamId: string; events: { eventType: string }[] }[] }).appends;
        const commit: Commit = { types: appends.flatMap((a) => a.events.map((e) => e.eventType)), streams: appends.map((a) => a.streamId) };
        await opts.before?.(commit);
        const failure = opts.failCommit?.(commit);
        if (failure) throw failure;
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        if (commit.types.includes("progress")) progressNotify();
        return result;
      };
    },
  });
  runtime = await createRuntime({ store: { store }, agents, policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, ...(opts.outboxFor ? { outboxFor: opts.outboxFor as never } : {}) });
  return { rt: runtime, store: inner };
}
const startRun = (rt: Runtime, agent: string, key: string, input: { readonly gate: string } | Record<string, never> = {}) => rt.service.startRun(alice, { agent, input, idempotencyKey: key, caseContext, assignment });
const eventsOf = async (rt: Runtime, runId: string) => {
  const out: StoredEvent[] = [];
  for await (const e of rt.service.events(alice, { runId })) out.push(e);
  return out;
};
const until = async (cond: () => Promise<boolean> | boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await Bun.sleep(5);
  }
  throw new Error("condition not reached");
};
const hasEvent = async (rt: Runtime, runId: string, type: string) => (await eventsOf(rt, runId)).some((e) => e.eventType === type);
const runStatus = async (rt: Runtime, runId: string) => (await rt.service.getRun(alice, { runId })).status;
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AssignmentRefusedError) return e.assignmentCode;
    if (e instanceof ServiceError) return e.code;
    throw e;
  }
  return "NOT_REFUSED";
};
/** Parks the first commit matching `match` until `release()`; `reached` settles when it arrives. */
const parkFirst = (match: (c: Commit) => boolean) => {
  const reached = deferred();
  const release = deferred();
  let parked = false;
  return { reached: reached.promise, release: release.resolve, before: async (c: Commit) => { if (!parked && match(c)) { parked = true; reached.resolve(); await release.promise; } } };
};

describe("lifecycle revision guards every lifecycle write", () => {
  test("H1: a control that validated against a live assignment is refused, not silently dropped, when the run ended first", async () => {
    const park = parkFirst((c) => c.types.includes("assignment.interrupted"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "h1", { gate: "h1" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const interrupt = rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "late", idempotencyKey: "i1" });
    const settled = interrupt.then(() => "ok", (e) => e);
    await park.reached;
    gate("h1").resolve();
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    park.release();
    const outcome = await settled;
    expect(outcome).toBeInstanceOf(AssignmentRefusedError);
    const types = (await eventsOf(rt, run.runId)).map((e) => e.eventType);
    expect(types).not.toContain("assignment.interrupted"); // a refused control leaves no event behind the terminal one
    expect(types).toContain("assignment.completed");
  });

  test("H2: an interrupt that lands before the terminal commit wins: the run is not completed and the interrupt is kept", async () => {
    const park = parkFirst((c) => c.types.includes("run.completed"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "h2", { gate: "h2" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    gate("h2").resolve();
    await park.reached; // the executor decided to complete and is about to commit
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "wins", idempotencyKey: "i1" });
    park.release();
    await until(async () => (await rt.assignments.getAssignment(alice, { runId: run.runId })).status === "interrupted");
    expect(await hasEvent(rt, run.runId, "run.completed")).toBe(false);
    const types = (await eventsOf(rt, run.runId)).map((e) => e.eventType);
    expect(types).not.toContain("assignment.completed");
    expect(await runStatus(rt, run.runId)).toBe("running");
    // resuming completes it, with the interrupt kept in a valid sequence
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    expect((await rt.assignments.getAssignment(alice, { runId: run.runId })).events.map((e) => e.event)).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
  });

  test("H2: a spend that lands before the terminal commit is in the terminal event's accepted total", async () => {
    const park = parkFirst((c) => c.types.includes("run.completed"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "h2s", { gate: "h2s" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    gate("h2s").resolve();
    await park.reached;
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 10, idempotencyKey: "s1" });
    park.release();
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("completed");
    expect(spentIn(view.events.at(-1)!.spend, "time")).toBe(10); // the terminal event carries the final total
    expect(spentIn(view.acceptedSpend, "time")).toBe(10);
  });

  test("H2: cancelling after a spend records the cancelled event with that spend, atomically with run.cancelled", async () => {
    const { rt } = await boot();
    const run = await startRun(rt, "agent.gated", "h2c", { gate: "h2c" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 7, idempotencyKey: "s1" });
    await rt.service.cancelRun(alice, { runId: run.runId, reason: "stop", idempotencyKey: "c1" });
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("cancelled");
    expect(spentIn(view.events.at(-1)!.spend, "time")).toBe(7);
    expect(await runStatus(rt, run.runId)).toBe("cancelled");
  });

  test("H3: a breach is recorded on the first call under a streaming executor and stops the run durably", async () => {
    const { rt } = await boot({ before: async (c) => { if (c.types.includes("assignment.spend")) await nextProgress(); } });
    const run = await startRun(rt, "agent.streaming", "h3");
    await until(() => hasEvent(rt, run.runId, "progress"));
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" });
    expect(view.status).toBe("failed");
    expect(view.budgetExceeded).toEqual([{ currency: "money", limit: 5, spent: 6 }]);
    expect(await runStatus(rt, run.runId)).toBe("failed");
    const events = await eventsOf(rt, run.runId);
    expect(events.filter((e) => e.eventType === "assignment.spend").length).toBe(1);
    expect(events.at(-1)!.eventType).toBe("run.failed");
    // M6: the failure points at the run stream's tail, the breach is carried separately
    const failed = events.find((e) => e.eventType === "assignment.failed")!;
    const spend = events.find((e) => e.eventType === "assignment.spend")!;
    const runStreamIds = new Set(events.filter((e) => e.streamId === `run-${run.runId}`).map((e) => e.eventId));
    expect(runStreamIds.has(failed.causationId!)).toBe(true); // a run-stream event, never the spend on the lifecycle stream
    expect((failed.metadata as Record<string, unknown>).breachEventId).toBe(spend.eventId);
    await until(() => exits === passes); // the agent pass has stopped
  });
});

describe("spend and interrupt under a streaming bound run", () => {
  // Each control commit waits for the executor to commit one more progress event first, so it always races a live executor.
  const hold = async (c: Commit) => { if (c.types.includes("assignment.spend") || c.types.includes("assignment.interrupted")) await nextProgress(); };

  test("a spend succeeds first call, is durable, the executor is not halted and the terminal total includes it", async () => {
    const { rt } = await boot({ before: hold });
    const run = await startRun(rt, "agent.streaming", "sp");
    await until(() => hasEvent(rt, run.runId, "progress"));
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 10, idempotencyKey: "s1" });
    expect(spentIn(view.spend, "time")).toBe(10);
    await until(async () => (await runStatus(rt, run.runId)) === "completed", 15000);
    expect(passes).toBe(1); // a halted pass would have been re-run
    const final = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(final.status).toBe("completed");
    expect(spentIn(final.acceptedSpend, "time")).toBe(10);
    expect((await eventsOf(rt, run.runId)).filter((e) => e.eventType === "assignment.spend").length).toBe(1);
  }, 30_000);

  test("an interrupt stops the pass; resume executes again and makes new progress", async () => {
    const { rt } = await boot({ before: hold });
    const run = await startRun(rt, "agent.streaming", "ir");
    await until(() => hasEvent(rt, run.runId, "progress"));
    expect((await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "op", idempotencyKey: "i1" })).status).toBe("interrupted");
    await until(() => exits === passes);
    const paused = (await eventsOf(rt, run.runId)).filter((e) => e.eventType === "progress").length;
    expect(paused).toBeLessThan(400);
    expect(await runStatus(rt, run.runId)).toBe("running");
    expect((await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" })).status).toBe("resumed");
    await until(async () => (await eventsOf(rt, run.runId)).filter((e) => e.eventType === "progress").length > paused);
    expect(passes).toBeGreaterThanOrEqual(2); // a new pass ran
  }, 30_000);
});

describe("provenance and replay", () => {
  test("M3: an agent cannot emit assignment events, and a forged one in a legacy history is not lifecycle state", async () => {
    const { rt, store } = await boot();
    const run = await startRun(rt, "agent.forger", "m3");
    await until(() => emitErrors.length > 0);
    expect(emitErrors[0]).toContain("reserved");
    // a pre-reservation history: an emitted assignment.completed carries the emit's stepId
    const stream = await store.readStream(`run-${run.runId}`);
    const forged = { assignment_id: assignment.assignment_id, episode_ref: assignment.episode_ref, event: "completed", at: new Date().toISOString(), spend: [] };
    await store.commit({ appends: [{ streamId: `run-${run.runId}`, expectedVersion: stream.length, events: [{ eventId: "forged-1", eventType: "assignment.completed", schemaVersion: 1, occurredAt: forged.at, tenant: "t", correlationId: stream[0]!.correlationId, causationId: stream.at(-1)!.eventId, runId: run.runId, scopeId: stream[0]!.scopeId, payload: forged as never, metadata: { stepId: "emit:9", assignmentEvent: "completed" } }] }] });
    expect((await rt.assignments.getAssignment(alice, { runId: run.runId })).status).toBe("started");
  });

  test("M2: a control already recorded on the run stream (pre-upgrade) is a no-op on redelivery", async () => {
    const { rt, store } = await boot();
    const run = await startRun(rt, "agent.gated", "m2", { gate: "m2" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const base = fingerprint({ scope: "t:alice:assignment.interrupt", key: "old", request: { runId: run.runId, reason: "legacy" } });
    const stream = await store.readStream(`run-${run.runId}`);
    const at = new Date().toISOString();
    const event = { assignment_id: assignment.assignment_id, episode_ref: assignment.episode_ref, event: "interrupted", at, spend: zeroSpend(0), reason: "legacy" };
    await store.commit({ appends: [{ streamId: `run-${run.runId}`, expectedVersion: stream.length, events: [{ eventId: `asg_${base}_0`, eventType: "assignment.interrupted", schemaVersion: 1, occurredAt: at, tenant: "t", correlationId: stream[0]!.correlationId, causationId: stream.at(-1)!.eventId, runId: run.runId, scopeId: stream[0]!.scopeId, payload: event as never, metadata: { assignmentEvent: "interrupted", by: "alice" } }] }] });
    const view: AssignmentView = await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "legacy", idempotencyKey: "old" });
    expect(view.status).toBe("interrupted");
  });
});

describe("durable intents, ordering and restart", () => {
  test("M4: a resume and a breach commit a run.execute intent with the control", async () => {
    const topics: string[] = [];
    const inner = openSqliteStore({ path: ":memory:" });
    const store = new Proxy(inner, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop !== "commit") return typeof value === "function" ? value.bind(target) : value;
        return async (...args: unknown[]) => {
          const c = args[0] as { appends: { events: { eventType: string }[] }[]; outbox?: { id: string; topic: string }[] };
          const t = c.appends.flatMap((a) => a.events.map((e) => e.eventType));
          if (t.includes("assignment.resumed") || t.includes("assignment.failed")) topics.push(...(c.outbox ?? []).map((o) => o.topic));
          return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        };
      },
    });
    runtime = await createRuntime({ store: { store }, agents, policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) } });
    const rt = runtime;
    const run = await startRun(rt, "agent.gated", "m4", { gate: "m4" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    expect(topics).toEqual(["run.execute"]);
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" });
    expect(topics).toEqual(["run.execute", "run.execute"]);
  });

  test("M5: the observation ordering coordinate never restarts or repeats within a run", async () => {
    const seen: { eventType: string; runId: string | null; streamSequence: number }[] = [];
    const { rt } = await boot({ outboxFor: (e) => (seen.push({ eventType: e.eventType, runId: e.runId, streamSequence: e.streamSequence }), []) });
    const run = await startRun(rt, "agent.gated", "m5", { gate: "m5" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 1, idempotencyKey: "s0" }).catch(() => {}); // refused while interrupted
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 1, idempotencyKey: "s1" });
    gate("m5").resolve();
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    const sequences = seen.filter((e) => e.runId === run.runId).map((e) => e.streamSequence);
    expect(sequences.length).toBeGreaterThan(6);
    for (let i = 1; i < sequences.length; i++) expect(sequences[i]!).toBeGreaterThan(sequences[i - 1]!);
  });

  test("M7: a restart with the assignment split across both streams keeps its state and resumes", async () => {
    dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cognate-asg-lc-"));
    const file = join(dir, "app.sqlite");
    const first = await boot({ file });
    const run = await startRun(first.rt, "agent.gated", "m7", { gate: "m7" });
    await until(() => hasEvent(first.rt, run.runId, "run.step.completed"));
    await first.rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 3, idempotencyKey: "s1" });
    await first.rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    gate("m7").resolve();
    await first.rt.close();
    runtime = undefined;
    const second = await boot({ file });
    const view = await second.rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("interrupted");
    expect(spentIn(view.acceptedSpend, "time")).toBe(3);
    await second.rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await until(async () => (await runStatus(second.rt, run.runId)) === "completed");
    const final = await second.rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(final.events.map((e) => e.event)).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
    expect(spentIn(final.events.at(-1)!.spend, "time")).toBe(3);
  });
});

describe("consistent read", () => {
  test("M1: a commit touching both streams between the two reads is never seen on one side only", async () => {
    let armed = false;
    let fired = false;
    let cancel: (() => Promise<unknown>) | undefined;
    const inner = openSqliteStore({ path: ":memory:" });
    const store = new Proxy(inner, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop !== "readStream") return typeof value === "function" ? value.bind(target) : value;
        return async (streamId: string, ...rest: unknown[]) => {
          // After the run stream was read and before the lifecycle stream is, the terminal cancel lands.
          if (armed && !fired && streamId.startsWith("run-assignment-")) {
            fired = true;
            await cancel!();
          }
          return (value as (...a: unknown[]) => Promise<unknown>).apply(target, [streamId, ...rest]);
        };
      },
    });
    runtime = await createRuntime({ store: { store }, agents, policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) } });
    const rt = runtime;
    const run = await startRun(rt, "agent.gated", "m1", { gate: "m1" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    cancel = () => rt.service.cancelRun(alice, { runId: run.runId, reason: "x", idempotencyKey: "c1" });
    armed = true;
    // The run stream read in `readLifecycle` is stale once the cancel lands; the pair must be re-read together.
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(fired).toBe(true);
    expect(view.status).toBe("cancelled");
    expect(await runStatus(rt, run.runId)).toBe("cancelled");
  });
});

describe("cancel against the other lifecycle writes (H-1, M-5)", () => {
  const cancel = (rt: Runtime, runId: string, key = "c1") => rt.service.cancelRun(alice, { runId, reason: "stop", idempotencyKey: key });
  const sequence = async (rt: Runtime, runId: string) => (await rt.assignments.getAssignment(alice, { runId })).events.map((e) => e.event);

  test("cancelling a streaming run succeeds after losing a race to executor progress, and only then stops the pass", async () => {
    const park = parkFirst((c) => c.types.includes("run.cancelled"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.streaming", "cs");
    await until(() => hasEvent(rt, run.runId, "progress"));
    const cancelled = cancel(rt, run.runId);
    await park.reached;
    await nextProgress(); // the executor commits while the cancel is parked: its first attempt must lose
    park.release();
    expect((await cancelled).status).toBe("cancelled");
    expect(await sequence(rt, run.runId)).toEqual(["issued", "started", "cancelled"]);
    await until(() => exits === passes);
  });

  test("a cancel that cannot commit throws unavailable, leaves the run untouched and does not abort the executor", async () => {
    const { rt } = await boot({ failCommit: (c) => (c.types.includes("run.cancelled") ? new ConcurrencyError(`run-x`, 0, 1) : undefined) });
    const run = await startRun(rt, "agent.streaming", "cx");
    await until(() => hasEvent(rt, run.runId, "progress"));
    const outcome = await cancel(rt, run.runId).then(() => "ok", (e) => e);
    expect(outcome).toBeInstanceOf(ServiceError);
    expect(outcome.code).toBe("unavailable");
    expect(await runStatus(rt, run.runId)).toBe("running");
    const before = (await eventsOf(rt, run.runId)).filter((e) => e.eventType === "progress").length;
    await nextProgress();
    await until(async () => (await eventsOf(rt, run.runId)).filter((e) => e.eventType === "progress").length > before); // still executing
    expect(exits).toBe(0);
  });

  test("cancel against interrupt: the interrupt that won is kept, then the cancel is recorded after it", async () => {
    const park = parkFirst((c) => c.types.includes("run.cancelled"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "ci", { gate: "ci" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const cancelled = cancel(rt, run.runId);
    await park.reached;
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "first", idempotencyKey: "i1" });
    park.release();
    expect((await cancelled).status).toBe("cancelled");
    expect(await sequence(rt, run.runId)).toEqual(["issued", "started", "interrupted", "cancelled"]);
  });

  test("cancel against spend: the cancelled event carries the spend that won", async () => {
    const park = parkFirst((c) => c.types.includes("run.cancelled"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "cp", { gate: "cp" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const cancelled = cancel(rt, run.runId);
    await park.reached;
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 5, idempotencyKey: "s1" });
    park.release();
    await cancelled;
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("cancelled");
    expect(spentIn(view.events.at(-1)!.spend, "time")).toBe(5);
  });

  test("cancel against the executor's terminal commit: whichever is second sees the first and no event is duplicated", async () => {
    const park = parkFirst((c) => c.types.includes("run.cancelled"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "ct", { gate: "ct" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const cancelled = cancel(rt, run.runId);
    await park.reached;
    gate("ct").resolve();
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    park.release();
    expect((await cancelled).status).toBe("completed"); // the run had already ended: the cancel is a no-op, not a second terminal
    expect(await sequence(rt, run.runId)).toEqual(["issued", "started", "completed"]);
    expect((await eventsOf(rt, run.runId)).filter((e) => e.eventType === "run.cancelled").length).toBe(0);
  });

  test("resume against cancel: a resume that lost to the cancel is refused and leaves no event behind it", async () => {
    const park = parkFirst((c) => c.types.includes("assignment.resumed"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "rc", { gate: "rc" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    const resumed = rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" }).then(() => "ok", (e) => e);
    await park.reached;
    await cancel(rt, run.runId);
    park.release();
    expect(await resumed).toBeInstanceOf(AssignmentRefusedError);
    expect(await sequence(rt, run.runId)).toEqual(["issued", "started", "interrupted", "cancelled"]);
  });
});

describe("budget breach against the executor, and recovery (M-3, M-5)", () => {
  test("a breach that lands before the executor's terminal commit wins: the run fails with the budget error, never completes", async () => {
    const park = parkFirst((c) => c.types.includes("run.completed"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.gated", "bt", { gate: "bt" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    gate("bt").resolve();
    await park.reached;
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" });
    expect(view.status).toBe("failed");
    park.release();
    await until(async () => (await runStatus(rt, run.runId)) === "failed");
    expect((await rt.service.getRun(alice, { runId: run.runId })).error).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
    expect(await hasEvent(rt, run.runId, "run.completed")).toBe(false);
  });

  test("finalizing a stopped run that cannot commit throws instead of returning quietly", async () => {
    const { rt } = await boot({ failCommit: (c) => (c.types.includes("run.failed") ? new ConcurrencyError("run-x", 0, 1) : undefined) });
    const run = await startRun(rt, "agent.gated", "bx", { gate: "bx" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const outcome = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" }).then(() => "ok", (e) => e);
    expect(outcome).toBeInstanceOf(ServiceError);
    expect(outcome.code).toBe("unavailable");
    // the breach itself is durable
    expect((await rt.assignments.getAssignment(alice, { runId: run.runId })).status).toBe("failed");
  });

  test("a crash between assignment.failed and run.failed is finished by the next pass", async () => {
    let crash = true;
    const { rt } = await boot({ failCommit: (c) => (crash && c.types.includes("run.failed") ? new Error("crash") : undefined) });
    const run = await startRun(rt, "agent.gated", "bn", { gate: "bn" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" }).catch(() => {});
    expect(await runStatus(rt, run.runId)).toBe("running"); // the crash left the run unfinished
    crash = false;
    gate("bn").resolve(); // the run.execute intent committed with the breach (or the guard) drives the pass that finishes it
    await until(async () => (await runStatus(rt, run.runId)) === "failed");
    expect((await rt.service.getRun(alice, { runId: run.runId })).error).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
  });

  test("a crash between assignment.failed and run.failed is finished on restart", async () => {
    dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cognate-asg-cr-"));
    const file = join(dir, "app.sqlite");
    let dead = false;
    const first = await boot({ file, failCommit: (c) => (dead || c.types.includes("run.failed") ? new Error("crash") : undefined) });
    const run = await startRun(first.rt, "agent.gated", "br", { gate: "br" });
    await until(() => hasEvent(first.rt, run.runId, "run.step.completed"));
    await first.rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 6, idempotencyKey: "s1" }).catch(() => {});
    expect(await runStatus(first.rt, run.runId)).toBe("running");
    dead = true; // the process dies here: nothing more reaches the store
    gate("br").resolve(); // let the parked agent unwind so the runtime can close
    await first.rt.close();
    first.store.close();
    runtime = undefined;
    const second = await boot({ file });
    await until(async () => (await runStatus(second.rt, run.runId)) === "failed");
    expect((await second.rt.service.getRun(alice, { runId: run.runId })).error).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
  }, 30_000);
});

describe("fence and consistent read (M-1, M-2)", () => {
  test("M-2: a progress commit parked after its guard cannot land after an interrupt: the interrupt fences it", async () => {
    const park = parkFirst((c) => c.types.includes("progress"));
    const { rt } = await boot({ before: park.before });
    const run = await startRun(rt, "agent.streaming", "fe");
    await park.reached; // an executor progress commit, past its durable guard, is about to land
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "fence", idempotencyKey: "i1" });
    park.release();
    await until(() => exits === passes);
    const events = await eventsOf(rt, run.runId);
    const interrupted = events.find((e) => e.eventType === "assignment.interrupted")!;
    expect(events.some((e) => e.eventType === "progress" && e.position > interrupted.position)).toBe(false);
  });

  test("M-1: ordinary run progress never makes the assignment read re-read the run stream", async () => {
    let runReads = 0;
    let counting = false;
    const { rt } = await boot({ onRead: (id) => { if (counting && id.startsWith("run-") && !id.startsWith("run-assignment-") && !id.startsWith("run-state-")) runReads++; } });
    const run = await startRun(rt, "agent.streaming", "rd");
    await until(() => hasEvent(rt, run.runId, "progress"));
    counting = true;
    await rt.assignments.getAssignment(alice, { runId: run.runId });
    counting = false;
    // one read for the load's lifecycle pair; the tenant check in `load` is the same read
    expect(runReads).toBe(1);
  });
});

describe("legacy history through the new terminal commit (M-5)", () => {
  test("a run whose interrupt and resume are on the run stream completes with the assignment terminal on the lifecycle stream", async () => {
    const { rt, store } = await boot();
    const run = await startRun(rt, "agent.gated", "lg", { gate: "lg" });
    await until(() => hasEvent(rt, run.runId, "run.step.completed"));
    const stream = await store.readStream(`run-${run.runId}`);
    const mk = (event: "interrupted" | "resumed", id: string, prior: string) => {
      const at = new Date().toISOString();
      return { eventId: id, eventType: `assignment.${event}`, schemaVersion: 1, occurredAt: at, tenant: "t", correlationId: stream[0]!.correlationId, causationId: prior, runId: run.runId, scopeId: stream[0]!.scopeId, payload: { assignment_id: assignment.assignment_id, episode_ref: assignment.episode_ref, event, at, spend: zeroSpend(0) } as never, metadata: { assignmentEvent: event, by: "alice" } };
    };
    await store.commit({ appends: [{ streamId: `run-${run.runId}`, expectedVersion: stream.length, events: [mk("interrupted", "legacy-i", stream.at(-1)!.eventId), mk("resumed", "legacy-r", "legacy-i")] }] });
    gate("lg").resolve();
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.events.map((e) => e.event)).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
    expect((await eventsOf(rt, run.runId)).find((e) => e.eventType === "assignment.completed")!.streamId).toBe(`run-assignment-${run.runId}`);
  });
});

describe("known gaps", () => {
  // DEBT-034: an interrupt that wins over completion (or lands mid-step) discards the finished result, and resume re-runs
  // the agent body, so a side effect inside a step callback that was running (and any effect outside a step) repeats.
  // This asserts the exact double effect, so it turns red the day the gap is closed and must then be rewritten to
  // expect a single effect.
  test("H5 (DEBT-034): resuming after an interrupt mid-step runs the step's effect a second time", async () => {
    const { rt } = await boot();
    const run = await startRun(rt, "agent.stepper", "h5");
    await started.promise;
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "mid-step", idempotencyKey: "i1" });
    gate("h5").resolve();
    await until(() => effects.length === 1);
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await until(async () => (await runStatus(rt, run.runId)) === "completed");
    expect(effects).toEqual(["work", "work"]);
  });
});
