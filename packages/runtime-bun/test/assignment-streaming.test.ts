// DEBT-033 root cause: operator controls (interrupt, spend) must not be foreign appends to the run stream while a
// bound run is streaming (spec §29.1, fold.ts runStateStream). A control commit is held for a few milliseconds
// between its read and its write, so a streaming executor always commits in that window; a control that shares the
// executor's stream version therefore loses every attempt, deterministically.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredEvent } from "@godspeedai/cognate-events";
import { type AgentDefinition, type Assignment, type Caller, formatAssignmentId } from "@godspeedai/cognate-runtime-api";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRuntime, type Runtime } from "../src/index.ts";

const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };
const BASE: Assignment = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "runtime-api", "test", "fixtures", "assignment", "valid", "assignment-first-delegation.json"), "utf8"));
const assignment: Assignment = { ...BASE, k: 1, assignment_id: formatAssignmentId({ caseId: BASE.case_id, stepId: BASE.step_id, n: BASE.n, k: 1 }) };

let passes = 0;
const agents: AgentDefinition[] = [
  {
    id: "agent.streaming",
    version: "1",
    run: async (_input, ctx) => {
      passes++;
      for (let i = 0; i < 400; i++) {
        await ctx.emit("progress", { i });
        await Bun.sleep(1);
      }
      return { done: true };
    },
  },
];

let runtime: Runtime | undefined;
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  passes = 0;
});

const CONTROLS = new Set(["assignment.interrupted", "assignment.resumed", "assignment.spend"]);
async function streaming() {
  const inner = openSqliteStore({ path: ":memory:" });
  const store = new Proxy(inner, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "commit") return typeof value === "function" ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        const appends = (args[0] as { appends: { events: { eventType: string }[] }[] }).appends;
        if (appends.some((a) => a.events.some((e) => CONTROLS.has(e.eventType)))) await Bun.sleep(8);
        return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      };
    },
  });
  runtime = await createRuntime({ store: { store }, agents, policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) } });
  const run = await runtime.service.startRun(alice, {
    agent: "agent.streaming", input: {}, idempotencyKey: "start", assignment,
    caseContext: { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: assignment.case_id, planItemId: assignment.step_id, role: "executor", kind: "evaluated" },
  });
  const events = async () => {
    const out: StoredEvent[] = [];
    for await (const e of runtime!.service.events(alice, { runId: run.runId })) out.push(e);
    return out;
  };
  for (let i = 0; i < 400 && !(await events()).some((e) => e.eventType === "progress"); i++) await Bun.sleep(5);
  return { rt: runtime, run, events };
}

test("a spend report succeeds on the first call while the bound run streams, and the executor is not halted", async () => {
  const { rt, run, events } = await streaming();
  const view = await rt.assignments.recordSpend(alice, { runId: run.runId, currency: "time", amount: 10, idempotencyKey: "s1" });
  expect(view.status).toBe("started");
  expect((await rt.service.getRun(alice, { runId: run.runId })).status).toBe("running");
  for (let i = 0; i < 600 && (await rt.service.getRun(alice, { runId: run.runId })).status === "running"; i++) await Bun.sleep(10);
  expect((await rt.service.getRun(alice, { runId: run.runId })).status).toBe("completed");
  expect(passes).toBe(1); // a ConcurrencyError would halt the pass and re-run it
  expect((await events()).filter((e) => e.eventType === "progress").length).toBe(400);
});

test("an interrupt succeeds on the first call while the bound run streams and stops the executor", async () => {
  const { rt, run, events } = await streaming();
  const view = await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "operator", idempotencyKey: "i1" });
  expect(view.status).toBe("interrupted");
  await Bun.sleep(100);
  const progressed = (await events()).filter((e) => e.eventType === "progress").length;
  await Bun.sleep(100);
  expect((await events()).filter((e) => e.eventType === "progress").length).toBe(progressed); // the pass stopped
  expect((await rt.service.getRun(alice, { runId: run.runId })).status).toBe("running"); // paused, not failed
  expect((await rt.assignments.getAssignment(alice, { runId: run.runId })).status).toBe("interrupted");
  const resumed = await rt.assignments.resumeAssignment(alice, { runId: run.runId, idempotencyKey: "r1" });
  expect(resumed.status).toBe("resumed");
  expect(passes).toBeGreaterThanOrEqual(1);
});
