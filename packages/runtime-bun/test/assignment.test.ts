// WP-23: a run opened from an assignment carries its id, episode, brief and budget; spend is tracked per currency;
// interruption and resume are recorded under the same id; a spend above a numeric limit stops the run with
// ASSIGNMENT_BUDGET_EXCEEDED; a run with no assignment behaves exactly as before.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredEvent } from "@godspeedai/cognate-events";
import { type AgentDefinition, type Assignment, type AssignmentCode, AssignmentRefusedError, type AssignmentView, type CaseContext, type Caller, formatAssignmentId, runAssignmentLifecycle, ServiceError, validateAssignmentEvent } from "@godspeedai/cognate-runtime-api";
import { type ActionPolicy, createRuntime, type Runtime } from "../src/index.ts";

const FIXTURES = join(import.meta.dir, "..", "..", "runtime-api", "test", "fixtures", "assignment");
const fixture = (...p: string[]) => JSON.parse(readFileSync(join(FIXTURES, ...p), "utf8"));
const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };
const bob: Caller = { actor: { id: "bob", kind: "user" }, tenant: "t" };

const BASE: Assignment = fixture("valid", "assignment-first-delegation.json");
const episodeFor = (n: number) => BASE.episode_ref.replace(/:1@/, `:${n}@`);
/** The fixture assignment with delegation instance `k` of episode 1. */
const assignmentFor = (k: number, over: Partial<Assignment> = {}): Assignment => ({ ...BASE, k, assignment_id: formatAssignmentId({ caseId: BASE.case_id, stepId: BASE.step_id, n: BASE.n, k }), ...over });
const contextFor = (a: Assignment, over: Partial<CaseContext> = {}): CaseContext => ({
  worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: a.case_id, planItemId: a.step_id, role: "executor", kind: "evaluated", ...over,
});

const gates = new Map<string, { promise: Promise<void>; open: () => void }>();
const gate = (name: string) => {
  if (!gates.has(name)) {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => (open = resolve));
    gates.set(name, { promise, open });
  }
  return gates.get(name)!;
};
const agents: AgentDefinition[] = [
  { id: "agent.quick", version: "1", run: async (_i, ctx) => ({ done: await ctx.step("a", () => 1) }) },
  { id: "agent.fails", version: "1", run: async () => { throw new Error("boom"); } },
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
];

let runtime: Runtime | undefined;
afterEach(async () => {
  for (const g of gates.values()) g.open();
  gates.clear();
  await runtime?.close();
  runtime = undefined;
});

async function open(actions: ActionPolicy = { authorize: () => ({ allow: true, reason: "ok" }) }) {
  const seen: string[] = [];
  runtime = await createRuntime({
    store: ":memory:",
    agents,
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) },
    actions,
    outboxFor: (event) => (seen.push(event.eventType), []),
  });
  return { rt: runtime, seen };
}
const eventsOf = async (rt: Runtime, runId: string) => {
  const out: StoredEvent[] = [];
  for await (const e of rt.service.events(alice, { runId })) out.push(e);
  return out;
};
const until = async (cond: () => Promise<boolean>, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await Bun.sleep(15);
  }
  throw new Error("condition not reached");
};
const status = async (rt: Runtime, runId: string) => (await rt.service.getRun(alice, { runId })).status;
async function start(rt: Runtime, agent: string, a: Assignment, key = `k-${a.assignment_id}`, extra: { linkExpiresAt?: string; caseContext?: CaseContext; input?: { readonly gate: string } } = {}) {
  return rt.service.startRun(alice, { agent, input: extra.input ?? {}, idempotencyKey: key, caseContext: extra.caseContext ?? contextFor(a), assignment: a, ...(extra.linkExpiresAt ? { linkExpiresAt: extra.linkExpiresAt } : {}) });
}
const refused = async (p: Promise<unknown>): Promise<AssignmentCode | string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AssignmentRefusedError) return e.assignmentCode;
    if (e instanceof ServiceError) return e.code;
    throw e;
  }
  return "NOT_REFUSED";
};
const lifecycle = (view: AssignmentView) => view.events.map((e) => e.event);

describe("opening a run from an assignment", () => {
  test("the run carries the id, episode, brief and budget; the case context is implied", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    const run = await start(rt, "agent.quick", a);
    const events = await eventsOf(rt, run.runId);
    const started = events[0]!;
    expect(started.eventType).toBe("run.started");
    const meta = started.metadata as Record<string, any>;
    expect(meta.assignment).toEqual(a as never); // brief, budget, episode, id frozen as issued
    expect(meta.caseContext).toMatchObject({ caseId: "case-0001", planItemId: "item-03", assignmentId: a.assignment_id, episodeRef: a.episode_ref, principal: "alice" });
    await until(async () => (await status(rt, run.runId)) === "completed");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("completed");
    expect(lifecycle(view)).toEqual(["issued", "started", "completed"]);
    expect(view.assignment.brief.context_refs[0]!.trust).toBe("untrusted_reference");
    // Every recorded lifecycle event is a valid contract Event and the sequence passes the state machine.
    for (const e of view.events) expect(validateAssignmentEvent(e).ok).toBe(true);
    expect(runAssignmentLifecycle(view.events, { budget: a.budget }).ok).toBe(true);
    // every event of the run carries the context (so the interaction extension can name the assignment)
    for (const e of (await eventsOf(rt, run.runId)).filter((x) => x.eventType !== "run.started")) expect((e.metadata as any).caseContext.assignmentId).toBe(a.assignment_id);
  });

  test("a case context that disagrees with the assignment is refused", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    expect(await refused(start(rt, "agent.quick", a, "x1", { caseContext: contextFor(a, { caseId: "case-9999" }) }))).toBe("ASSIGNMENT_ID_INVALID");
    expect(await refused(start(rt, "agent.quick", a, "x2", { caseContext: contextFor(a, { planItemId: "item-99" }) }))).toBe("ASSIGNMENT_ID_INVALID");
    expect(await refused(start(rt, "agent.quick", a, "x3", { caseContext: contextFor(a, { episodeRef: episodeFor(2) }) }))).toBe("ASSIGNMENT_EPISODE_CHANGED");
    expect(await refused(start(rt, "agent.quick", a, "x4", { caseContext: contextFor(a, { assignmentId: assignmentFor(2).assignment_id }) }))).toBe("ASSIGNMENT_ID_INVALID");
    expect(await refused(rt.service.startRun(alice, { agent: "agent.quick", input: {}, idempotencyKey: "x5", assignment: a }))).toBe("invalid_argument"); // no case context to imply
    expect((await rt.service.listRuns(alice, {})).length).toBe(0); // nothing was started
  });

  test("an agreeing context that names the same episode and id is accepted", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    const run = await start(rt, "agent.quick", a, "ok", { caseContext: contextFor(a, { episodeRef: a.episode_ref, assignmentId: a.assignment_id }) });
    expect(run.status).not.toBe("failed");
  });

  test("payloads the contract refuses are refused with the contract's code", async () => {
    const { rt } = await open();
    const cases: [string, string][] = [
      ["id-n-differs-from-episode-ref.json", "ASSIGNMENT_ID_INVALID"],
      ["id-step-differs-from-episode-ref.json", "ASSIGNMENT_ID_INVALID"],
      ["fields-differ-from-id.json", "ASSIGNMENT_ID_INVALID"],
      ["budget-currency-repeated.json", "ASSIGNMENT_BUDGET_INVALID"],
      ["id-k-zero.json", "ASSIGNMENT_ID_INVALID"],
      ["budget-money-unit-not-iso.json", "invalid_argument"],
      ["brief-context-trusted.json", "invalid_argument"],
    ];
    for (const [file, code] of cases) {
      const a = fixture("invalid", file) as Assignment;
      expect(await refused(rt.service.startRun(alice, { agent: "agent.quick", input: {}, idempotencyKey: file, caseContext: contextFor(BASE), assignment: a }))).toBe(code);
    }
  });

  test("an assignment id is issued to one run only; a redelivered start returns the same run", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    const first = await start(rt, "agent.quick", a, "same");
    const again = await start(rt, "agent.quick", a, "same");
    expect(again.runId).toBe(first.runId);
    expect(await refused(start(rt, "agent.quick", a, "other-key"))).toBe("ASSIGNMENT_ID_INVALID");
    expect((await rt.service.listRuns(alice, {})).length).toBe(1);
    const second = await start(rt, "agent.quick", assignmentFor(2)); // a new delegation instance takes a new k
    expect(second.runId).not.toBe(first.runId);
  });

  test("a run with no assignment behaves exactly as before", async () => {
    const { rt, seen } = await open();
    const run = await rt.service.startRun(alice, { agent: "agent.quick", input: {}, idempotencyKey: "plain" });
    await until(async () => (await status(rt, run.runId)) === "completed");
    expect((await eventsOf(rt, run.runId)).some((e) => e.eventType.startsWith("assignment."))).toBe(false);
    expect(seen.some((t) => t.startsWith("assignment."))).toBe(false);
    expect(await refused(rt.assignments.getAssignment(alice, { runId: run.runId }))).toBe("failed_precondition");
    expect(await refused(rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i" }))).toBe("failed_precondition");
  });
});

describe("interruption and resume", () => {
  test("interrupt pauses the run, resume continues it under the same id", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    const run = await start(rt, "agent.gated", a, "g1", { input: { gate: "g1" } });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    const interrupted = await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "operator paused", idempotencyKey: "i1" });
    expect(interrupted.status).toBe("interrupted");
    expect(interrupted.events.at(-1)).toMatchObject({ event: "interrupted", reason: "operator paused", assignment_id: a.assignment_id, episode_ref: a.episode_ref });
    gate("g1").open(); // the paused agent is released but must not finish while interrupted
    await Bun.sleep(150);
    expect(await status(rt, run.runId)).toBe("running");
    expect((await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.completed")).toBe(false);

    const resumed = await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    expect(resumed.status).toBe("resumed");
    await until(async () => (await status(rt, run.runId)) === "completed");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(lifecycle(view)).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
    expect(new Set(view.events.map((e) => e.assignment_id))).toEqual(new Set([a.assignment_id])); // one id for the whole sequence
    expect(new Set(view.events.map((e) => e.episode_ref))).toEqual(new Set([a.episode_ref]));
    expect(runAssignmentLifecycle(view.events, { budget: a.budget }).ok).toBe(true);
  });

  test("transitions the contract forbids are refused and record nothing", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g2", { input: { gate: "g2" } });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    expect(await refused(rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r0" }))).toBe("ASSIGNMENT_TRANSITION_INVALID"); // resume without interrupt
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    expect(await refused(rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "again", idempotencyKey: "i2" }))).toBe("ASSIGNMENT_TRANSITION_INVALID");
    expect(lifecycle(await rt.assignments.getAssignment(alice, { runId: run.runId }))).toEqual(["issued", "started", "interrupted"]);
  });

  test("a redelivered interrupt or resume (same key) records one event", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g3", { input: { gate: "g3" } });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    const req = { runId: run.runId, reason: "x", idempotencyKey: "i1" };
    await rt.assignments.interruptAssignment(alice, req);
    await rt.assignments.interruptAssignment(alice, req);
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
    gate("g3").open();
    await until(async () => (await status(rt, run.runId)) === "completed");
    expect(lifecycle(await rt.assignments.getAssignment(alice, { runId: run.runId }))).toEqual(["issued", "started", "interrupted", "resumed", "completed"]);
    expect(await refused(rt.assignments.interruptAssignment(alice, { ...req, reason: "different" }))).not.toBe("NOT_REFUSED"); // same key, different request
  });

  test("resume after the delegation link expired is refused; a new delegation takes a new k", async () => {
    const { rt } = await open();
    const a = assignmentFor(1);
    const run = await start(rt, "agent.gated", a, "g4", { input: { gate: "g4" }, linkExpiresAt: new Date(Date.now() + 400).toISOString() });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    await Bun.sleep(500);
    expect(await refused(rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" }))).toBe("ASSIGNMENT_LINK_EXPIRED");
    expect((await rt.assignments.getAssignment(alice, { runId: run.runId })).status).toBe("interrupted"); // nothing recorded
    // the same id cannot be started again; the new delegation instance is k+1
    expect(await refused(start(rt, "agent.quick", a, "again"))).toBe("ASSIGNMENT_ID_INVALID");
    const next = await start(rt, "agent.quick", assignmentFor(2));
    expect((await rt.assignments.getAssignment(alice, { runId: next.runId })).assignment.k).toBe(2);
  });

  test("cancelling an interrupted run records assignment.cancelled before run.cancelled", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g5", { input: { gate: "g5" } });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "x", idempotencyKey: "i1" });
    await rt.service.cancelRun(alice, { runId: run.runId, reason: "operator gave up", idempotencyKey: "c1" });
    const types = (await eventsOf(rt, run.runId)).map((e) => e.eventType);
    expect(types.slice(-2)).toEqual(["assignment.cancelled", "run.cancelled"]);
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("cancelled");
    expect(view.events.at(-1)!.reason).toBe("operator gave up");
    expect(runAssignmentLifecycle(view.events).ok).toBe(true);
  });

  test("a failing agent closes the assignment as failed with the reason", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.fails", assignmentFor(1));
    await until(async () => (await status(rt, run.runId)) === "failed");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.status).toBe("failed");
    expect(view.events.at(-1)!.reason).toBe("boom");
  });

  test("interrupt, resume and spend are authorized actions", async () => {
    const { rt } = await open({ authorize: ({ action, caller }) => (action.startsWith("assignment.") && caller.actor.id === "bob" ? { allow: false, reason: "bob may not" } : { allow: true, reason: "ok" }) });
    const run = await start(rt, "agent.gated", assignmentFor(1), "g6", { input: { gate: "g6" } });
    expect(await refused(rt.assignments.interruptAssignment(bob, { runId: run.runId, reason: "x", idempotencyKey: "i" }))).toBe("permission_denied");
    expect(await refused(rt.assignments.recordSpend(bob, { runId: run.runId, currency: "time", amount: 1, idempotencyKey: "s" }))).toBe("permission_denied");
  });
});

describe("spend and budget", () => {
  const spendOf = (view: AssignmentView, currency: string) => view.spend.find((s) => s.currency === currency)!.spent;

  test("spend is tracked per currency as events; unknown stays unknown and never trips a limit", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g7", { input: { gate: "g7" } });
    let view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 100, idempotencyKey: "s1" });
    view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 50, idempotencyKey: "s2" });
    view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 5, idempotencyKey: "s3" }); // equal to the limit: allowed
    view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "attention", amount: 1e9, idempotencyKey: "s4" }); // unknown limit: never trips
    view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "risk", amount: "unknown", idempotencyKey: "s5" });
    view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "risk", amount: 3, idempotencyKey: "s6" });
    expect([spendOf(view, "time"), spendOf(view, "money"), spendOf(view, "attention"), spendOf(view, "risk"), spendOf(view, "recovery")]).toEqual([150, 5, 1e9, "unknown", 0]);
    expect(view.status).toBe("started");
    expect(view.budgetExceeded).toBeUndefined();
    const spendEvents = (await eventsOf(rt, run.runId)).filter((e) => e.eventType === "assignment.spend");
    expect(spendEvents.length).toBe(6); // every report is an event
    expect(await status(rt, run.runId)).toBe("running");
  });

  test("a redelivered spend report (same key) is counted once", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g8", { input: { gate: "g8" } });
    const req = { runId: run.runId, currency: "time" as const, amount: 10, idempotencyKey: "s1" };
    await rt.assignments.recordSpend(alice, req);
    const view = await rt.assignments.recordSpend(alice, req);
    expect(spendOf(view, "time")).toBe(10);
    expect((await eventsOf(rt, run.runId)).filter((e) => e.eventType === "assignment.spend").length).toBe(1);
  });

  test("a spend above a numeric limit stops the run with ASSIGNMENT_BUDGET_EXCEEDED and records the overrun", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g9", { input: { gate: "g9" } });
    await until(async () => (await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.step.completed"));
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 4, idempotencyKey: "s1" });
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 2, idempotencyKey: "s2" });
    expect(view.status).toBe("failed");
    expect(view.budgetExceeded).toEqual([{ currency: "money", limit: 5, spent: 6 }]);
    expect(spendOf(view, "money")).toBe(6); // the overrun is recorded, not dropped
    expect(view.acceptedSpend.find((s) => s.currency === "money")!.spent).toBe(4); // the lifecycle event carries the last in-budget spend
    const run2 = await rt.service.getRun(alice, { runId: run.runId });
    expect(run2.status).toBe("failed");
    expect(run2.error).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
    const last = view.events.at(-1)!;
    expect(last.event).toBe("failed");
    expect(last.reason).toContain("ASSIGNMENT_BUDGET_EXCEEDED");
    expect(runAssignmentLifecycle(view.events, { budget: view.assignment.budget }).ok).toBe(true); // every lifecycle event is contract-valid
    const types = (await eventsOf(rt, run.runId)).map((e) => e.eventType);
    expect(types.slice(-3)).toEqual(["assignment.spend", "assignment.failed", "run.failed"]);
    // the released agent must not continue or complete the stopped run
    gate("g9").open();
    await Bun.sleep(150);
    expect((await eventsOf(rt, run.runId)).some((e) => e.eventType === "run.completed")).toBe(false);
    // later spend is refused visibly, not dropped silently
    expect(await refused(rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 1, idempotencyKey: "s3" }))).toBe("ASSIGNMENT_TRANSITION_INVALID");
  });

  test("a numeric overrun in a currency whose total was unknown does not trip; an invalid amount is refused", async () => {
    const { rt } = await open();
    const run = await start(rt, "agent.gated", assignmentFor(1), "g10", { input: { gate: "g10" } });
    await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: "unknown", idempotencyKey: "s1" });
    const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "money", amount: 999, idempotencyKey: "s2" });
    expect(view.status).toBe("started");
    expect(await refused(rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: -1, idempotencyKey: "s3" }))).toBe("invalid_argument");
    expect(await refused(rt.assignments.recordSpend(alice, { runId: run.runId, currency: "gold" as never, amount: 1, idempotencyKey: "s4" }))).toBe("invalid_argument");
  });
});
