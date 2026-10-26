// Performance before/after (mission Phase 5): sequential and concurrent append throughput, commit
// latency percentiles, and projection catch-up, measured against the same DurableStore contract on
// SQLite (bun:sqlite, in-process) and PostgreSQL (postgres.js over TCP to the local pg0 instance).
// Results are recorded in .agents/evidence/2026-10-09-postgres-performance.md.
//
// Runtime load mode (DEBT-015): `bun scripts/bench-stores.ts runtime [--store memory|sqlite|postgres]
//   [--runs 200] [--concurrency 1] [--tick-ms <ms>]`
// starts N runs through the runtime service and prints runs/s and p50/p99 submit→completed latency.
// `--concurrency` sets execution.maxConcurrentRuns (above 1 declares independent resourceKeys).
// `--tick-ms 10` approximates the pre-DEBT-015 10 ms polling loop for comparison.
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { DurableStore } from "@godspeedai/cognate-events";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const SEQ = 500;
const CONC_WRITERS = 8;
const CONC_EACH = 50;

function event(n: number) {
  return { eventType: "bench.e", schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "bench", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: { n, pad: "x".repeat(200) } };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function bench(name: string, store: DurableStore, schema: string): Promise<Record<string, number | string>> {
  // Sequential appends: one commit of one event at a time, measuring per-commit latency.
  const latencies: number[] = [];
  const seqStart = performance.now();
  for (let i = 0; i < SEQ; i++) {
    const t0 = performance.now();
    await store.commit({ appends: [{ streamId: `seq-${i % 8}`, expectedVersion: Math.floor(i / 8), events: [event(i)] }] });
    latencies.push(performance.now() - t0);
  }
  const seqMs = performance.now() - seqStart;

  // Concurrent appends: independent streams, distinct idempotency-free commits (counter lock is the
  // only serialization point).
  const concStart = performance.now();
  await Promise.all(
    Array.from({ length: CONC_WRITERS }, (_, w) =>
      (async () => {
        for (let i = 0; i < CONC_EACH; i++) await store.commit({ appends: [{ streamId: `conc-${w}`, expectedVersion: i, events: [event(i)] }] });
      })(),
    ),
  );
  const concMs = performance.now() - concStart;

  // Projection catch-up: fold everything committed so far in one runner pass (a fresh projection).
  const foldStart = performance.now();
  const total = SEQ + CONC_WRITERS * CONC_EACH;
  let position = 0;
  let folded = 0;
  for (;;) {
    const page = await store.readAll({ afterPosition: position, limit: 256 });
    if (page.length === 0) break;
    const writes = page.map((e) => ({ key: `k${e.position}`, value: e.position as unknown as import("@godspeedai/cognate-events").Json }));
    await store.commitProjection({ name: `bench-${schema}`, version: "1", fromPosition: position, toPosition: page[page.length - 1]!.position, writes });
    position = page[page.length - 1]!.position;
    folded += page.length;
    if (folded >= total) break;
  }
  const foldMs = performance.now() - foldStart;

  const row = {
    bench: name,
    sequential: `${SEQ} commits in ${seqMs.toFixed(0)} ms (${(SEQ / (seqMs / 1000)).toFixed(0)}/s)`,
    "commit latency": `p50 ${percentile(latencies, 50).toFixed(1)} ms / p95 ${percentile(latencies, 95).toFixed(1)} ms`,
    concurrent: `${CONC_WRITERS * CONC_EACH} commits on ${CONC_WRITERS} streams in ${concMs.toFixed(0)} ms (${(CONC_WRITERS * CONC_EACH / (concMs / 1000)).toFixed(0)}/s)`,
    "projection catch-up": `${folded} events folded in ${foldMs.toFixed(0)} ms`,
  };
  console.log(JSON.stringify(row));
  return row;
}

async function storeBench(): Promise<void> {
  const sqlite = openSqliteStore({ path: ":memory:" });
  const sqliteRows = await bench("SQLite (bun:sqlite, in-memory file)", sqlite, "sqlite");
  await sqlite.close();

  const pg = await openPostgresStore({ url, schema: `cognate_bench_${Date.now().toString(36)}`, pollMs: 0 });
  const pgRows = await bench("PostgreSQL 18.1 (pg0, TCP)", pg.store, "postgres");
  await pg.dropSchema();
  await pg.close();

  console.log("\n| metric | SQLite (in-process) | PostgreSQL (TCP, pg0) |");
  console.log("|---|---|---|");
  const rate = (row: Record<string, number | string>): string => {
    const text = String(row.sequential);
    const ms = Number(text.split(" in ")[1]!.split(" ms")[0]);
    return (SEQ / (ms / 1000)).toFixed(0);
  };
  console.log(`| sequential commits/s | ${rate(sqliteRows)} | ${rate(pgRows)} |`);
  console.log(`| commit latency p50/p95 | ${String(sqliteRows["commit latency"]).replace("commit latency", "").trim()} | ${String(pgRows["commit latency"]).replace("commit latency", "").trim()} |`);
}

function flag(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1]! : fallback;
}

async function runtimeBench(args: string[]): Promise<void> {
  const storeKind = flag(args, "--store", "sqlite");
  const runs = Number(flag(args, "--runs", "200"));
  const concurrency = Number(flag(args, "--concurrency", "1"));
  const tickFlag = flag(args, "--tick-ms", "");
  const tickMs = tickFlag === "" ? undefined : Number(tickFlag);
  if (!["memory", "sqlite", "postgres"].includes(storeKind)) throw new Error(`unknown --store ${storeKind}`);

  const caller: Caller = { tenant: "bench", actor: { id: "bench", kind: "user" } };
  const policy = { authorize: () => ({ allow: true as const, policyId: "bench", reason: "bench" }) };
  const actions = { authorize: () => ({ allow: true as const, reason: "bench" }) };
  const agent: AgentDefinition = {
    id: "agent.bench",
    version: "1.0.0",
    async run(input, ctx) {
      return ctx.step("work", async () => input);
    },
  };

  // The bench owns the store it opens and closes it after the runtime; the runtime gets it injected.
  let store: DurableStore;
  let dropSchema: (() => Promise<void>) | undefined;
  let closeStore: () => Promise<void>;
  if (storeKind === "memory") {
    store = createMemoryStore();
    closeStore = () => store.close();
  } else if (storeKind === "sqlite") {
    store = openSqliteStore({ path: ":memory:" });
    closeStore = () => store.close();
  } else {
    const pg = await openPostgresStore({ url, schema: `cognate_runbench_${Date.now().toString(36)}`, pollMs: 0 });
    store = pg.store;
    dropSchema = pg.dropSchema;
    closeStore = () => pg.close();
  }

  // Latency is submit→completed as seen by the store's commit notifications: t0 is taken before
  // startRun, and each run is matched by its unique correlationId.
  const submitted = new Map<string, number>();
  const latencies: number[] = [];
  let completed = 0;
  let failed = 0;
  let finish!: () => void;
  const allTerminal = new Promise<void>((resolve) => (finish = resolve));
  const unsubscribe = store.onCommitted((events) => {
    for (const e of events) {
      const t0 = submitted.get(e.correlationId);
      if (t0 === undefined) continue;
      if (e.eventType === "run.completed") {
        latencies.push(performance.now() - t0);
        completed++;
      } else if (e.eventType === "run.failed") {
        failed++;
      } else {
        continue;
      }
      submitted.delete(e.correlationId);
      if (completed + failed === runs) finish();
    }
  });

  const runtime = await createRuntime({
    store: { store },
    agents: [agent],
    policy,
    actions,
    ...(tickMs === undefined ? {} : { tickMs }),
    execution: { maxConcurrentRuns: concurrency, resourceKeys: () => [] },
  });
  const wallStart = performance.now();
  try {
    await Promise.all(
      Array.from({ length: runs }, (_, i) => {
        const correlationId = `bench-${i}`;
        submitted.set(correlationId, performance.now());
        return runtime.service.startRun(caller, { agent: agent.id, input: { i }, idempotencyKey: `bench-${i}`, correlationId });
      }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out: ${completed + failed}/${runs} terminal`)), 120_000); });
    try {
      await Promise.race([allTerminal, timeout]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    const wallMs = performance.now() - wallStart;
    unsubscribe();
    await runtime.close();
    if (dropSchema) await dropSchema();
    await closeStore();
    const row = {
      bench: "runtime",
      store: storeKind,
      maxConcurrentRuns: concurrency,
      tickMs: tickMs ?? 250,
      runs,
      completed,
      failed,
      wallMs: Math.round(wallMs),
      runsPerSec: Number((completed / (wallMs / 1000)).toFixed(1)),
      p50Ms: latencies.length ? Number(percentile(latencies, 50).toFixed(1)) : null,
      p99Ms: latencies.length ? Number(percentile(latencies, 99).toFixed(1)) : null,
    };
    console.log(JSON.stringify(row));
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "runtime") await runtimeBench(rest);
else await storeBench();
