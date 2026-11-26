// H4: an interrupt accepted by one runtime must stop the run's executor in another process. Two runtimes share one
// PostgreSQL store; whichever one executes the run, the other interrupts it. The owning worker observes the committed
// interrupt at its next execution boundary (the durable lifecycle stream), not through a local abort signal.
// Fails, never skips, without the development database.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import type { AgentDefinition, Assignment, Caller } from "@godspeedai/cognate-runtime-api";
import { formatAssignmentId } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "../src/index.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
{
  try {
    const probe = await openPostgresStore({ url, schema: `cognate_probe_${Date.now()}`, pollMs: 0 });
    await probe.dropSchema();
    await probe.close();
  } catch (cause) {
    throw new Error(`assignment multi-runtime journeys need PostgreSQL (just db-up); ${url} unreachable`, { cause });
  }
}

const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };
const BASE: Assignment = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "runtime-api", "test", "fixtures", "assignment", "valid", "assignment-first-delegation.json"), "utf8"));
const assignment: Assignment = { ...BASE, k: 1, assignment_id: formatAssignmentId({ caseId: BASE.case_id, stepId: BASE.step_id, n: BASE.n, k: 1 }) };
const allow = { policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) } };

test("an interrupt committed through one runtime stops the executor running in the other", async () => {
  const schema = `cognate_asg_rt_${Date.now().toString(36)}`;
  let executor: string | undefined;
  let passes = 0;
  let exits = 0;
  const agentFor = (tag: string): AgentDefinition => ({
    id: "agent.streaming",
    version: "1",
    run: async (_input, ctx) => {
      executor ??= tag;
      passes++;
      try {
        for (let i = 0; i < 600; i++) {
          await ctx.emit("progress", { i });
          await Bun.sleep(2);
        }
        return { done: true };
      } finally {
        exits++;
      }
    },
  });
  const make = (tag: string) => createRuntime({ store: { postgres: { url, schema } }, agents: [agentFor(tag)], ...allow });
  const a = await make("A");
  const b = await make("B");
  try {
    const run = await a.service.startRun(alice, {
      agent: "agent.streaming", input: {}, idempotencyKey: "mr-1", assignment,
      caseContext: { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: assignment.case_id, planItemId: assignment.step_id, role: "executor", kind: "evaluated" },
    });
    const count = async () => {
      let n = 0;
      for await (const e of a.service.events(alice, { runId: run.runId })) if (e.eventType === "progress") n++;
      return n;
    };
    const until = async (cond: () => Promise<boolean> | boolean) => {
      const end = Date.now() + 20_000;
      while (Date.now() < end) {
        if (await cond()) return;
        await Bun.sleep(10);
      }
      throw new Error("condition not reached");
    };
    await until(async () => (await count()) > 3);
    const interrupter = executor === "A" ? b : a; // the runtime that is NOT executing
    const view = await interrupter.assignments.interruptAssignment(alice, { runId: run.runId, reason: "other process", idempotencyKey: "mr-i1" });
    expect(view.status).toBe("interrupted");
    await until(() => exits === passes); // the executing worker observed it and stopped
    const stopped = await count();
    expect(stopped).toBeLessThan(600);
    await Bun.sleep(100);
    expect(await count()).toBe(stopped);
    expect((await a.service.getRun(alice, { runId: run.runId })).status).toBe("running");
  } finally {
    await a.close().catch(() => {});
    await b.close().catch(() => {});
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 60_000);

test("PostgreSQL: an interrupt that lands before the executor's terminal commit wins, and a cancel after it is recorded", async () => {
  const schema = `cognate_asg_lc_${Date.now().toString(36)}`;
  const opened = await openPostgresStore({ url, schema, pollMs: 0 });
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let reachedResolve!: () => void;
  const reached = new Promise<void>((r) => (reachedResolve = r));
  let parked = false;
  const store = new Proxy(opened.store, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "commit") return typeof value === "function" ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        const appends = (args[0] as { appends?: { events: { eventType: string }[] }[] }).appends ?? [];
        if (!parked && appends.some((a) => a.events.some((e) => e.eventType === "run.completed"))) {
          parked = true;
          reachedResolve();
          await released; // the executor decided to complete; hold it before it commits
        }
        return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      };
    },
  });
  let open!: () => void;
  const opening = new Promise<void>((r) => (open = r));
  const agent: AgentDefinition = { id: "agent.once", version: "1", run: async (_i, ctx) => { await ctx.step("a", () => 1); await opening; return { done: true }; } };
  const rt = await createRuntime({ store: { store }, agents: [agent], ...allow });
  try {
    const run = await rt.service.startRun(alice, {
      agent: "agent.once", input: {}, idempotencyKey: "pg-lc", assignment,
      caseContext: { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: assignment.case_id, planItemId: assignment.step_id, role: "executor", kind: "evaluated" },
    });
    const until = async (cond: () => Promise<boolean>) => {
      const end = Date.now() + 20_000;
      while (Date.now() < end) { if (await cond()) return; await Bun.sleep(10); }
      throw new Error("condition not reached");
    };
    open();
    await reached;
    expect((await rt.assignments.interruptAssignment(alice, { runId: run.runId, reason: "wins", idempotencyKey: "pg-i1" })).status).toBe("interrupted");
    release();
    // the executor re-decides against the interrupt: it never completes the run
    await until(async () => (await rt.assignments.getAssignment(alice, { runId: run.runId })).status === "interrupted");
    const cancelled = await rt.service.cancelRun(alice, { runId: run.runId, reason: "stop", idempotencyKey: "pg-c1" });
    expect(cancelled.status).toBe("cancelled");
    const view = await rt.assignments.getAssignment(alice, { runId: run.runId });
    expect(view.events.map((e) => e.event)).toEqual(["issued", "started", "interrupted", "cancelled"]);
    const types: string[] = [];
    for await (const e of rt.service.events(alice, { runId: run.runId })) types.push(e.eventType);
    expect(types).not.toContain("run.completed");
  } finally {
    await rt.close().catch(() => {});
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
    await opened.close().catch(() => {});
  }
}, 60_000);
