// Multi-process writer proof for DEBT-011 (mission §1.4): separate Bun processes operate on one
// PostgreSQL schema simultaneously — independent commits, typed conflicts, cross-process idempotency,
// disjoint outbox claims, lease recovery after a killed worker, cross-process commit notifications,
// crash-atomic commits, and state reconstruction after restart.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const dir = mkdtempSync(join(tmpdir(), "cognate-pg-mp-"));
// Every schema this file creates is dropped at the end, including by tests that fail before their own
// cleanup line runs.
const createdSchemas: string[] = [];
afterAll(async () => {
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  const failed: string[] = [];
  try {
    for (const schema of createdSchemas) {
      await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => failed.push(schema));
    }
    if (failed.length > 0) throw new Error(`could not drop test schemas: ${failed.join(", ")}`);
  } finally {
    await dropper.end({ timeout: 1 });
    rmSync(dir, { recursive: true, force: true });
  }
});

// One worker program, one process per invocation: opens its own store instance on the shared schema,
// performs the operation named in argv[2], prints one JSON line, exits. All modes are intentionally
// independent so a test spawns exactly the processes its scenario needs.
writeFileSync(
    join(dir, "worker.ts"),
    `import { openPostgresStore } from ${JSON.stringify(resolve("packages/store-postgres/src/index.ts"))};
const [schema, mode, argJson] = process.argv.slice(2);
const arg = argJson ? JSON.parse(argJson) : {};
const handle = await openPostgresStore({ url: ${JSON.stringify(url)}, schema, pollMs: 0 });
const store = handle.store;
function event(n) {
  return { eventType: "w." + n, schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "tenant-a", correlationId: "corr-1", causationId: null, runId: null, scopeId: "root", payload: { n } };
}
try {
  if (mode === "commit-burst") {
    const results = [];
    for (let i = 0; i < arg.count; i++) {
      try {
        const outcome = await store.commit({ appends: [{ streamId: arg.stream, expectedVersion: i, events: [event(i)] }] });
        results.push({ kind: outcome.kind });
      } catch (error) {
        results.push({ kind: "error", name: error.name });
      }
    }
    console.log(JSON.stringify({ results }));
  } else if (mode === "commit-one") {
    try {
      const outcome = await store.commit({
        ...(arg.idempotency ? { idempotency: arg.idempotency } : {}),
        appends: [{ streamId: arg.stream, expectedVersion: arg.expectedVersion ?? 0, events: [event(arg.n ?? 0)] }],
        result: { from: process.pid },
      });
      console.log(JSON.stringify({ kind: outcome.kind, result: outcome.result }));
    } catch (error) {
      console.log(JSON.stringify({ kind: "error", name: error.name }));
    }
  } else if (mode === "listen") {
    const received = [];
    let done;
    const finished = new Promise((resolve) => (done = resolve));
    store.onCommitted((events) => {
      received.push(...events.map((e) => e.position));
      if (received.length >= arg.expect) done();
    });
    // Let the store's LISTEN subscription settle its cursor before the parent spawns the writer.
    await new Promise((resolve) => setTimeout(resolve, 150));
    console.log(JSON.stringify({ listening: true }));
    const race = await Promise.race([finished, new Promise((resolve) => setTimeout(() => resolve("timeout"), arg.timeoutMs ?? 5000))]);
    console.log(JSON.stringify({ received, race }));
  } else if (mode === "claim-until-empty") {
    const claimed = [];
    for (;;) {
      const items = await store.claimOutbox({ topic: arg.topic, now: Date.now(), limit: 5, leaseMs: 60_000 });
      if (items.length === 0) break;
      claimed.push(...items.map((i) => i.id));
    }
    console.log(JSON.stringify({ claimed }));
  } else if (mode === "claim-and-hold") {
    const items = await store.claimOutbox({ topic: arg.topic, now: Date.now(), limit: arg.limit, leaseMs: arg.leaseMs });
    console.log(JSON.stringify({ claimed: items.map((i) => i.id) }));
    await new Promise(() => {}); // hold the lease until killed
  } else if (mode === "big-commit") {
    console.log(JSON.stringify({ started: true }));
    const events = Array.from({ length: arg.count }, (_, i) => event(i));
    await store.commit({ appends: [{ streamId: arg.stream, expectedVersion: 0, events }] });
    console.log(JSON.stringify({ committed: arg.count }));
  } else if (mode === "write-and-exit") {
    await store.commit({ appends: [{ streamId: arg.stream, expectedVersion: 0, events: [event(arg.n ?? 0)] }] });
    await store.commit({ appends: [], records: [{ collection: "state", id: "keeper", expectedVersion: 0, value: { pid: process.pid, n: arg.n ?? 0 } }] });
    await handle.close();
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
} finally {
  if (mode !== "write-and-exit") await handle.close();
}
`,
  );

let schemaCounter = 0;
function freshSchema(): string {
  const schema = `cognate_mp_${Date.now().toString(36)}_${schemaCounter++}`;
  createdSchemas.push(schema);
  return schema;
}

interface Worker {
  readonly proc: ReturnType<typeof Bun.spawn>;
  /** Next stdout line, parsed as JSON. Resolves incrementally — workers may hold stdout open. */
  next: () => Promise<Record<string, unknown>>;
  kill(): Promise<void>;
}

function spawnWorker(schema: string, mode: string, arg: Record<string, unknown> = {}): Worker {
  const proc = Bun.spawn(["bun", join(dir, "worker.ts"), schema, mode, JSON.stringify(arg)], { stdout: "pipe", stderr: "pipe" });
  const queue: (Record<string, unknown> | null)[] = [];
  let wake: (() => void) | undefined;
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) queue.push(JSON.parse(line) as Record<string, unknown>);
        wake?.();
        wake = undefined;
      }
    }
    queue.push(null); // EOF sentinel
    wake?.();
    wake = undefined;
  })();
  return {
    proc,
    async next() {
      for (;;) {
        const line = queue.shift();
        if (line === null) throw new Error(`worker ${mode} exited before the expected line`);
        if (line !== undefined) return line;
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
    async kill() {
      proc.kill();
      await proc.exited;
    },
  };
}

test("two processes commit independently; no event is lost, duplicated, or out of order", async () => {
  const schema = freshSchema();
  const a = spawnWorker(schema, "commit-burst", { stream: "a", count: 10 });
  const b = spawnWorker(schema, "commit-burst", { stream: "b", count: 10 });
  const [ra, rb] = await Promise.all([a.next(), b.next()]);
  const resultsA = ra.results as { kind: string }[];
  const resultsB = rb.results as { kind: string }[];
  expect(resultsA).toHaveLength(10);
  expect(resultsB).toHaveLength(10);
  expect(resultsA.every((r) => r.kind === "committed")).toBe(true);
  expect(resultsB.every((r) => r.kind === "committed")).toBe(true);

  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  try {
    const all = await parent.store.readAll();
    expect(all).toHaveLength(20);
    expect(all.map((e) => e.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const stream of ["a", "b"]) {
      const events = await parent.store.readStream(stream);
      expect(events.map((e) => e.streamSequence)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    }
  } finally {
    await parent.close();
    const dropper = postgres(url, { max: 1, onnotice: () => {} });
    await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dropper.end({ timeout: 1 });
  }
}, 30_000);

test("conflicting expected versions across processes: exactly one wins with a typed error for the other", async () => {
  const schema = freshSchema();
  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  await parent.store.commit({ appends: [{ streamId: "hot", expectedVersion: 0, events: [{ eventType: "w.seed", schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: null }] }] });
  const a = spawnWorker(schema, "commit-one", { stream: "hot", expectedVersion: 1, n: 1 });
  const b = spawnWorker(schema, "commit-one", { stream: "hot", expectedVersion: 1, n: 2 });
  const [ra, rb] = await Promise.all([a.next(), b.next()]);
  const outcomes = [ra, rb];
  expect(outcomes.filter((o) => o.kind === "committed")).toHaveLength(1);
  const errors = outcomes.filter((o) => o.kind === "error");
  expect(errors).toHaveLength(1);
  expect(errors[0]!.name).toBe("ConcurrencyError");
  expect(await parent.store.streamVersion("hot")).toBe(2);
  await parent.close();
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
}, 30_000);

test("idempotency holds across process boundaries: one commit, one duplicate replay", async () => {
  const schema = freshSchema();
  const idempotency = { scope: "tenant-a:alice:run.start", key: "same-key", fingerprint: "fp" };
  const a = spawnWorker(schema, "commit-one", { stream: "idem", idempotency, n: 1 });
  const b = spawnWorker(schema, "commit-one", { stream: "idem", idempotency, n: 2 });
  const [ra, rb] = await Promise.all([a.next(), b.next()]);
  const kinds = [ra.kind as string, rb.kind as string].sort();
  expect(kinds).toEqual(["committed", "duplicate"]);
  // The duplicate replays the winner's recorded result, not its own.
  const winner = ra.kind === "committed" ? ra : rb;
  const loser = ra.kind === "committed" ? rb : ra;
  expect(loser.result).toEqual(winner.result);

  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  expect((await parent.store.readStream("idem")).length).toBe(1);
  await parent.close();
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
}, 30_000);

test("outbox work is claimed without concurrent duplicate ownership", async () => {
  const schema = freshSchema();
  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  const intents = Array.from({ length: 40 }, (_, i) => ({ id: `job-${i}`, topic: "jobs", payload: { i } }));
  await parent.store.commit({ appends: [], outbox: intents });
  const a = spawnWorker(schema, "claim-until-empty", { topic: "jobs" });
  const b = spawnWorker(schema, "claim-until-empty", { topic: "jobs" });
  const [ra, rb] = await Promise.all([a.next(), b.next()]);
  const claimedA = ra.claimed as string[];
  const claimedB = rb.claimed as string[];
  expect([...claimedA, ...claimedB].sort()).toEqual(intents.map((i) => i.id).sort()); // each exactly once
  const listed = await parent.store.listOutbox({ topic: "jobs" });
  expect(listed.every((item) => item.attempts === 1)).toBe(true);
  await parent.close();
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
}, 30_000);

test("a killed worker's expired lease is recoverable by another process", async () => {
  const schema = freshSchema();
  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  await parent.store.commit({ appends: [], outbox: [{ id: "orphan-1", topic: "jobs", payload: null }, { id: "orphan-2", topic: "jobs", payload: null }] });
  const holder = spawnWorker(schema, "claim-and-hold", { topic: "jobs", limit: 10, leaseMs: 400 });
  const held = await holder.next();
  expect(held.claimed).toHaveLength(2);
  await holder.kill(); // worker dies holding the lease
  // Before expiry: nothing claimable. After expiry: both items are recoverable.
  expect(await parent.store.claimOutbox({ topic: "jobs", now: Date.now(), limit: 10, leaseMs: 1000 })).toHaveLength(0);
  await Bun.sleep(450);
  const recovered = await parent.store.claimOutbox({ topic: "jobs", now: Date.now(), limit: 10, leaseMs: 1000 });
  expect(recovered.map((i) => i.id).sort()).toEqual(["orphan-1", "orphan-2"]);
  await parent.close();
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
}, 30_000);

test("a reader in another process observes foreign commits through the notification fan-out", async () => {
  const schema = freshSchema();
  const reader = spawnWorker(schema, "listen", { expect: 3, timeoutMs: 5000 });
  const ready = await reader.next();
  expect(ready.listening).toBe(true);
  const writer = spawnWorker(schema, "commit-burst", { stream: "w", count: 3 });
  await writer.next();
  const received = await reader.next();
  expect(received.received).toHaveLength(3);
  expect(received.race).toBeUndefined();
  await reader.kill();
  const dropper = postgres(url, { max: 1, onnotice: () => {} });
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
}, 30_000);

test("a worker killed mid-commit leaves all-or-nothing state, and the next writer continues densely", async () => {
  const schema = freshSchema();
  const victim = spawnWorker(schema, "big-commit", { stream: "big", count: 4000 });
  // Wait for the worker to reach its commit, then kill it inside the transaction window.
  const started = await victim.next();
  expect(started.started).toBe(true);
  await Bun.sleep(60);
  victim.proc.kill(9);
  await victim.proc.exited;
  await Bun.sleep(400); // let the backend roll back

  const parent = await openPostgresStore({ url, schema, pollMs: 0 });
  try {
    const partial = await parent.store.readStream("big");
    // All-or-nothing: a killed commit either never landed or landed whole.
    expect([0, 4000]).toContain(partial.length);
    expect(await parent.store.streamVersion("big")).toBe(partial.length);
    // The store remains writable and positions stay dense.
    const next = await parent.store.commit({ appends: [{ streamId: "after", expectedVersion: 0, events: [{ eventType: "w.after", schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: null }] }] });
    expect(next.kind).toBe("committed");
    const all = await parent.store.readAll();
    expect(all.map((e) => e.position)).toEqual(Array.from({ length: all.length }, (_, i) => i + 1));
  } finally {
    await parent.close();
    const dropper = postgres(url, { max: 1, onnotice: () => {} });
    await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dropper.end({ timeout: 1 });
  }
}, 30_000);

test("a restarted process reconstructs the same authoritative state", async () => {
  const schema = freshSchema();
  const first = spawnWorker(schema, "write-and-exit", { stream: "s", n: 7 });
  const done = await first.next();
  expect(done.done).toBe(true);

  // A brand-new store instance (fresh pools, like a restarted process) sees everything,
  // and the idempotency record replays the recorded result across the restart.
  const restarted = await openPostgresStore({ url, schema, pollMs: 0 });
  try {
    const events = await restarted.store.readStream("s");
    expect(events.map((e) => e.eventType)).toEqual(["w.7"]);
    const record = await restarted.store.getRecord("state", "keeper");
    expect(record).toMatchObject({ version: 1 });
    const replay = await restarted.store.commit({
      idempotency: { scope: "after-restart", key: "k", fingerprint: "f" },
      appends: [{ streamId: "r", expectedVersion: 0, events: [{ eventType: "r.first", schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: null }] }],
      result: { n: 1 },
    });
    expect(replay.kind).toBe("committed");
    const replayAgain = await restarted.store.commit({
      idempotency: { scope: "after-restart", key: "k", fingerprint: "f" },
      appends: [{ streamId: "r", expectedVersion: 1, events: [{ eventType: "r.second", schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: null }] }],
      result: { n: 2 },
    });
    expect(replayAgain).toMatchObject({ kind: "duplicate", result: { n: 1 } });
    expect((await restarted.store.readStream("r")).map((e) => e.eventType)).toEqual(["r.first"]);
  } finally {
    await restarted.close();
    const dropper = postgres(url, { max: 1, onnotice: () => {} });
    await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dropper.end({ timeout: 1 });
  }
}, 30_000);
