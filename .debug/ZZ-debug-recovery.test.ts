import { test } from "bun:test";
import { openPostgresStore } from "../packages/store-postgres/src/index.ts";
import { createRuntime } from "../packages/runtime-bun/src/index.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const caller = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };
const allow = {
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
};

test("debug recovery", async () => {
  const schema = `cognate_dbg_${Date.now().toString(36)}`;
  const gate: { finishers: (() => void)[]; aborters: (() => void)[]; started: Promise<void> } = { finishers: [], aborters: [], started: Promise.resolve() };
  const component = {
    id: "blocked-provider",
    provides: [{ id: "tool.blocked", version: "1.0.0" }],
    activate: (fiber: { provide: (c: { id: string; version: string }, h: (input: unknown, ctx: { signal: AbortSignal }) => Promise<unknown>) => void }) => {
      fiber.provide({ id: "tool.blocked", version: "1.0.0" }, async (input, ctx) => {
        await (ctx as unknown as { progress?: (payload: unknown) => Promise<void> }).progress?.({ started: true });
        gate.started = Promise.resolve();
        await new Promise<unknown>((resolve, reject) => {
          const abort = () => reject(new DOMException("aborted", "AbortError"));
          if (ctx.signal.aborted) abort(); else ctx.signal.addEventListener("abort", abort, { once: true });
          gate.finishers.push(() => resolve(undefined));
          gate.aborters.push(() => abort());
        });
        return { done: true };
      });
    },
  };
  const workerAgent = { id: "agent.worker", version: "1.0.0", run: async (input: never, ctx: { invoke: (c: string, i: never) => Promise<unknown> }) => ({ outcome: await ctx.invoke("tool.blocked", input) }) };
  let workerTag = "A";
  const make = () => { const tag = workerTag; workerTag = "B"; return createRuntime({ store: { postgres: { url, schema } }, agents: [workerAgent as never], components: [component as never], execution: { maxConcurrentRuns: 2, resourceKeys: () => [], runOwnership: { ownerId: tag, leaseMs: 250, ambiguousSteps: "wait" } }, ...allow }); };
  const a = await make();
  let b;
  const raw = await openPostgresStore({ url, schema, pollMs: 0 });
  try {
    const start = await a.service.startRun(caller, { agent: "agent.worker", input: {}, idempotencyKey: "dbg" });
    await gate.started;
    await a.close();
    console.log("A CLOSED");
    b = await make();
    console.log("B STARTED");
    await Bun.sleep(2000);
    console.log("FINISHERS:", gate.finishers.length);
    const run = await b.service.getRun(caller, { runId: start.runId });
    console.log("RUN STATUS:", run.status);
    for (const item of await raw.store.listOutbox({})) console.log("OUTBOX:", JSON.stringify({id: item.id.slice(-40), status: item.status, err: item.lastError, attempts: item.attempts, availableAt: item.availableAt}));
    for await (const e of raw.store.readStream(`run-${start.runId}`)) console.log("EV:", e.eventType);
  } finally {
    for (const abort of gate.aborters) abort();
    await Bun.sleep(200);
    await a.close().catch(() => {});
    await b?.close().catch(() => {});
    await raw.close();
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 30_000);
