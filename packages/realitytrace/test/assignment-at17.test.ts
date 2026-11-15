// WP-23 / AT-17 (lifecycle part), end to end in Cognate: open a run from an assignment, every consequential event
// carries the assignment id in the interaction extension (valid against the vendored CEP schema), interrupt, resume
// with the same id, and a budget overrun stops the run. Redelivery of the new events is idempotent.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { DurableStore, StoredEvent } from "@godspeedai/cognate-events";
import { type AgentDefinition, type Assignment, type Caller, type CaseContext, formatAssignmentId, runAssignmentLifecycle } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { INTERACTION_EVENT_TYPES, interactionOutboxFor, ObservationDelivery, OBSERVATION_TOPIC, type DeliveryReceipt, type Observation, type ObservationPort } from "../src/index.ts";

const schema = JSON.parse(readFileSync(join(import.meta.dir, "..", "schemas", "godspeed.interaction_event.v1.json"), "utf8"));
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
const check = (v: unknown): string[] => (validate(v) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`));

const BASE: Assignment = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "runtime-api", "test", "fixtures", "assignment", "valid", "assignment-first-delegation.json"), "utf8"));
const assignmentFor = (k: number): Assignment => ({ ...BASE, k, assignment_id: formatAssignmentId({ caseId: BASE.case_id, stepId: BASE.step_id, n: BASE.n, k }) });
const context = (a: Assignment): CaseContext => ({ worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: a.case_id, planItemId: a.step_id, role: "executor", kind: "evaluated", expectationRefs: [] });
const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };

// One gate per test (re-armed in beforeEach, released in afterEach), so a test controls when the agent proceeds.
let open: () => void = () => {};
let gate: Promise<void> = Promise.resolve();
beforeEach(() => {
  gate = new Promise<void>((r) => (open = r));
});
const agents: AgentDefinition[] = [{ id: "agent.gated", version: "1", run: async (_i, ctx) => { await ctx.step("first", () => 1); await gate; await ctx.step("second", () => 2); return { done: true }; } }];

let runtime: Runtime | undefined;
afterEach(async () => {
  open();
  await runtime?.close();
  runtime = undefined;
});

const until = async (cond: () => Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await cond()) return;
    await Bun.sleep(15);
  }
  throw new Error("condition not reached");
};
const rows = async (store: DurableStore) => (await store.listOutbox({ topic: OBSERVATION_TOPIC })).map((i) => i.payload as unknown as Observation);
const eventsOf = async (runId: string) => {
  const out: StoredEvent[] = [];
  for await (const e of runtime!.service.events(alice, { runId })) out.push(e);
  return out;
};

async function boot() {
  const store = createMemoryStore();
  runtime = await createRuntime({
    store: { store },
    agents,
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    outboxFor: (e) => interactionOutboxFor(e as never),
  });
  return { store, rt: runtime };
}

describe("AT-17 lifecycle (Cognate): delegate, interrupt, resume, complete; budget overrun", () => {
  test("open from an assignment, interrupt, resume with the same id, complete: every consequential event names the assignment", async () => {
    const { store, rt } = await boot();
    const a = assignmentFor(1);
    const run = await rt.service.startRun(alice, { agent: "agent.gated", input: {}, idempotencyKey: "s1", caseContext: context(a), assignment: a });
    await until(async () => (await eventsOf(run.runId)).some((e) => e.eventType === "run.step.completed"));
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 3, idempotencyKey: "sp1" });
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "operator paused", idempotencyKey: "i1" });
    open();
    await Bun.sleep(100);
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await until(async () => (await rt.service.getRun(alice, { runId: run.runId })).status === "completed");

    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.events.map((e) => e.event)).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
    expect(new Set(view.events.map((e) => e.assignment_id))).toEqual(new Set([a.assignment_id]));
    expect(runAssignmentLifecycle(view.events, { budget: a.budget }).ok).toBe(true);
    expect(view.events.at(-1)!.spend.find((s) => s.currency === "time")!.spent).toBe(3); // spend survives interrupt and resume

    const events = await eventsOf(run.runId);
    const ob = await rows(store);
    const consequential = events.filter((e) => INTERACTION_EVENT_TYPES.has(e.eventType));
    expect(consequential.map((e) => e.eventType)).toEqual(["run.started", "assignment.spend", "assignment.interrupted", "assignment.resumed", "run.completed"]);
    expect(ob.length).toBe(consequential.length);
    for (const e of consequential) {
      const ext = ob.find((o) => o.eventId === e.eventId)!.interactionEvent as Record<string, any>;
      expect(check(ext)).toEqual([]); // valid against the vendored CEP schema
      expect(ext.context.assignment_id).toBe(a.assignment_id);
      expect(ext.correlation).toMatchObject({ assignment_id: a.assignment_id, episode_ref: a.episode_ref, case_id: a.case_id });
      expect(ext.context.episode_ref).toBe(a.episode_ref);
    }
    const status = (type: string) => (ob.find((o) => o.eventId === events.find((e) => e.eventType === type)!.eventId)!.interactionEvent as any).outcome.status;
    expect(status("assignment.interrupted")).toBe("interrupted");
    expect(status("assignment.resumed")).toBe("succeeded");
  });

  test("a budget overrun stops the run, records the overrun, and the stop is an interaction event with status failed", async () => {
    const { store, rt } = await boot();
    const a = assignmentFor(1);
    const run = await rt.service.startRun(alice, { agent: "agent.gated", input: {}, idempotencyKey: "s2", caseContext: context(a), assignment: a });
    await until(async () => (await eventsOf(run.runId)).some((e) => e.eventType === "run.step.completed"));
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 5.01, idempotencyKey: "sp1" });
    expect(view.status).toBe("failed");
    expect(view.budgetExceeded).toEqual([{ currency: "money", limit: 5, spent: 5.01 }]);
    expect((await rt.service.getRun(alice, { runId: run.runId })).error).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
    open();
    await Bun.sleep(100);
    const events = await eventsOf(run.runId);
    expect(events.some((e) => e.eventType === "run.completed")).toBe(false);
    const spend = events.find((e) => e.eventType === "assignment.spend")!;
    const ext = (await rows(store)).find((o) => o.eventId === spend.eventId)!.interactionEvent as any;
    expect(check(ext)).toEqual([]);
    expect(ext.outcome.status).toBe("failed");
    expect(ext.context.assignment_id).toBe(a.assignment_id);
    const terminal = (await rows(store)).find((o) => o.eventId === events.find((e) => e.eventType === "run.failed")!.eventId)!.interactionEvent as any;
    expect(terminal.outcome.status).toBe("failed");
  });

  test("redelivery of the new events: one record per event, byte-identical extension on every attempt", async () => {
    const { store, rt } = await boot();
    const a = assignmentFor(1);
    const run = await rt.service.startRun(alice, { agent: "agent.gated", input: {}, idempotencyKey: "s3", caseContext: context(a), assignment: a });
    await until(async () => (await eventsOf(run.runId)).some((e) => e.eventType === "run.step.completed"));
    for (let i = 0; i < 2; i++) { // a redelivered request adds no event and no intent
      await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 2, idempotencyKey: "sp" });
      await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i" });
    }
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r" });
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r" });
    const before = await rows(store);
    expect(before.length).toBe(4); // started, spend, interrupted, resumed
    const seen: Observation[] = [];
    const recorded = new Map<string, Observation>();
    let calls = 0;
    const port: ObservationPort = {
      id: "t",
      async record(o): Promise<DeliveryReceipt> {
        seen.push(o);
        const rid = (o.interactionEvent as any).source.record_id as string;
        const dup = recorded.has(rid);
        recorded.set(rid, o);
        if (++calls % 2 === 1) throw new Error("transient"); // recorded, receipt lost: the outbox redelivers
        return { status: dup ? "duplicate" : "accepted", observationId: o.observationId, targetRef: rid, detail: {} };
      },
    };
    let t = 0;
    const delivery = new ObservationDelivery(store, { port, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 10 }, now: () => (t += 1000) });
    for (let i = 0; i < 6; i++) await delivery.drain();
    expect(calls).toBeGreaterThan(before.length);
    expect(recorded.size).toBe(before.length);
    const bytes = new Map<string, string>();
    for (const o of seen) {
      const rid = (o.interactionEvent as any).source.record_id as string;
      const b = JSON.stringify(o.interactionEvent);
      expect(bytes.get(rid) ?? b).toBe(b);
      bytes.set(rid, b);
    }
    const ids = (await eventsOf(run.runId)).filter((e) => e.eventType.startsWith("assignment.")).map((e) => e.eventType);
    expect(ids.filter((t) => t === "assignment.interrupted")).toHaveLength(1);
    expect(ids.filter((t) => t === "assignment.spend")).toHaveLength(1);
  });

  test("a run without an assignment emits no assignment id and no assignment events", async () => {
    const { store, rt } = await boot();
    const a = assignmentFor(1);
    open();
    const run = await rt.service.startRun(alice, { agent: "agent.gated", input: {}, idempotencyKey: "s4", caseContext: { ...context(a), kind: "exploratory" } });
    await until(async () => (await rt.service.getRun(alice, { runId: run.runId })).status === "completed");
    for (const o of await rows(store)) expect((o.interactionEvent as any).context.assignment_id).toBeUndefined();
    expect((await eventsOf(run.runId)).some((e) => e.eventType.startsWith("assignment."))).toBe(false);
  });
});
