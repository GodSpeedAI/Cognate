// Clean-room consumer smoke for the published @cognate SDK.
// Runs OUTSIDE the monorepo (copy it into a fresh project that installed
// @cognate packages from a registry) and exercises: core capability
// execution, durable continuations, event persistence across a runtime
// restart, and the headless client — with every import resolved from
// node_modules alone. package.yml's clean-room step runs this after install.
import { createClient } from "@godspeedai/client";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { createRuntime } from "@godspeedai/runtime-bun";
import { alice } from "@godspeedai/runtime-api/conformance";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

const openPolicy = {
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
} as const;

async function waitUntil<T>(read: () => T, ok: (v: T) => boolean, ms = 10000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out, last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

// 1. Capability execution + derived shared state (snapshot + JSON Patch).
const orderAgent: AgentDefinition = {
  id: "agent.order",
  version: "1.0.0",
  async run(_input, ctx) {
    await ctx.emit("state.changed", { snapshot: { order: { id: "o-1", status: "open", total: 0 } } });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/status", value: "paid" }] });
    await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/total", value: 42 }] });
    return { done: true };
  },
};

const dbPath = join(tmpdir(), `cognate-clean-room-${process.pid}.db`);
const runtimeA = await createRuntime({ store: dbPath, agents: [orderAgent], ...openPolicy });
const clientA = createClient({ service: runtimeA.service, caller: alice });
const { runId } = await clientA.startRun("agent.order", {});
const state = await waitUntil(() => clientA.run(runId).get(), (s) => s.status === "completed");
const order = state.state as { order: { status: string; total: number } };
if (order.order.status !== "paid" || order.order.total !== 42) throw new Error(`shared state wrong: ${JSON.stringify(order)}`);
console.log("ok: capability executed; shared state derived from snapshot + patches");
await clientA.close();
await runtimeA.close();

// 2. Event persistence: the file-backed store outlives the runtime.
{
  const db = new Database(dbPath, { readonly: true });
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const eventsTable = tables.find((t) => t.name === "events");
  if (!eventsTable) throw new Error(`no events table found among: ${tables.map((t) => t.name).join(", ")}`);
  const count = (db.query(`SELECT count(*) AS n FROM "${eventsTable.name}"`).get() as { n: number }).n;
  if (count < 5) throw new Error(`expected the run's durable events to persist, found ${count} rows`);
  console.log(`ok: event persistence — ${count} durable events survived the runtime restart boundary in ${eventsTable.name}`);
  db.close();
}

// 3. Durable continuation: suspend until a human resolves, then resume.
const refundAgent: AgentDefinition = {
  id: "agent.refund",
  version: "1.0.0",
  async run(input, ctx) {
    const { amount } = input as { readonly amount: number };
    const decision = (await ctx.waitFor("approve", {
      type: "refund-approval",
      condition: { kind: "human_approval" },
      payload: { amount },
    })) as { readonly approved: boolean };
    return { amount, approved: decision.approved };
  },
};
const runtimeB = await createRuntime({ store: ":memory:", agents: [refundAgent], ...openPolicy });
const clientB = createClient({ service: runtimeB.service, caller: alice });
const refundRun = await clientB.startRun("agent.refund", { amount: 75 });
const waiting = await waitUntil(() => clientB.run(refundRun.runId).get(), (s) => s.openContinuations.length === 1);
const approval = waiting.openContinuations[0]!;
if (approval.type !== "refund-approval") throw new Error(`unexpected continuation type: ${approval.type}`);
await clientB.resolveContinuation(approval.id, "resume", { approved: true });
const done = await waitUntil(() => clientB.run(refundRun.runId).get(), (s) => s.status === "completed");
if (!(done.output as { approved: boolean }).approved) throw new Error(`continuation resumed wrong: ${JSON.stringify(done.output)}`);
console.log("ok: run suspended on a durable continuation and resumed after resolution");
await clientB.close();
await runtimeB.close();

console.log("SMOKE PASS");
