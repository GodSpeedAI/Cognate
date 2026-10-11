// Performance before/after (mission Phase 5): sequential and concurrent append throughput, commit
// latency percentiles, and projection catch-up, measured against the same DurableStore contract on
// SQLite (bun:sqlite, in-process) and PostgreSQL (postgres.js over TCP to the local pg0 instance).
// Results are recorded in .agents/evidence/2026-10-09-postgres-performance.md.
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import type { DurableStore } from "@godspeedai/cognate-events";

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
