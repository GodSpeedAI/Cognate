// SQLite → PostgreSQL migration proof (mission §1.6): rich state in, dry-run writes nothing, real
// migration preserves identifiers/positions/order, verification passes, refused re-import, and the
// SQLite source plus its backup remain intact and readable.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { openPostgresStore } from "../src/index.ts";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { migrateSqliteToPostgres } from "../src/migrate-from-sqlite.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const dir = mkdtempSync(join(tmpdir(), "cognate-sqlite-migration-"));
const sqlitePath = join(dir, "app.sqlite");
const schema = `cognate_migration_${Date.now().toString(36)}`;
const dropper = postgres(url, { max: 1, onnotice: () => {} });
afterAll(async () => {
  await dropper.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropper.end({ timeout: 1 });
  rmSync(dir, { recursive: true, force: true });
});

import type { NewEvent } from "@godspeedai/cognate-events";

function event(eventType: string, payload: import("@godspeedai/cognate-events").Json, n: number): NewEvent {
  return { eventType, schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "tenant-a", correlationId: "corr-1", causationId: null, runId: null, scopeId: "root", payload, ...(n % 2 === 0 ? { metadata: { index: n } } : {}) };
}

// ── Build a rich SQLite source ──
{
  const store = openSqliteStore({ path: sqlitePath });
  await store.commit
  // Events across two streams, one atomic multi-stream decision, one idempotent decision.
  store.commit({ appends: [{ streamId: "runs", expectedVersion: 0, events: [event("run.started", { input: { name: "Zebulon" } }, 0)] }] });
  await store.commit({
    idempotency: { scope: "tenant-a:alice:run.start", key: "k1", fingerprint: "fp1" },
    appends: [
      { streamId: "runs", expectedVersion: 1, events: [event("run.step.completed", { result: { ok: true } }, 1)] },
      { streamId: "run-state", expectedVersion: 0, events: [event("state.changed", { snapshot: { count: 1 } }, 2)] },
    ],
    records: [{ collection: "runs", id: "run-1", expectedVersion: 0, value: { tenant: "tenant-a", agent: "agent.intake" } }],
    outbox: [{ id: "ob-1", topic: "run.execute", payload: { runId: "run-1" } }],
    result: { runId: "run-1" },
  });
  await store.commit({ appends: [{ streamId: "runs", expectedVersion: 2, events: [event("run.completed", { output: { done: true } }, 3)] }] });
  // Erasure tombstone: envelope survives, payload deleted.
  const events = await store.readStream("runs");
  const pii = events[0]!;
  await store.erasePayload(pii.eventId, "gdpr-art-17", "dpo");
  // Records in a second collection, versions advanced.
  await store.commit({ appends: [], records: [{ collection: "continuations", id: "c-1", expectedVersion: 0, value: { status: "OPEN" } }, { collection: "continuations", id: "c-2", expectedVersion: 0, value: { status: "OPEN" } }] });
  await store.commit({ appends: [], records: [{ collection: "continuations", id: "c-1", expectedVersion: 1, value: { status: "RESUMED" } }] });
  // Outbox in every status, insertion order meaningful.
  await store.commit({ appends: [], outbox: [{ id: "ob-2", topic: "run.execute", payload: { runId: "run-2" } }, { id: "ob-3", topic: "email", payload: { to: "x" } }] });
  const claimed = await store.claimOutbox({ topic: "run.execute", now: 1000, limit: 10, leaseMs: 50_000 });
  await store.settleOutbox(claimed[0]!.id, { kind: "delivered", receipt: { id: "rcpt" } });
  await store.settleOutbox(claimed[1]!.id, { kind: "retry", error: "timeout", retryAt: 9000 });
  await store.claimOutbox({ topic: "email", now: 1000, limit: 10, leaseMs: 50_000 });
  await store.settleOutbox("ob-3", { kind: "poisoned", error: "schema rejected" });
  // Projections: one healthy, one in error (must be rebuilt, not imported).
  await store.commitProjection({ name: "healthy", version: "1", fromPosition: 0, toPosition: 4, writes: [{ key: "a", value: 1 }, { key: "b", value: { nested: [1, 2, { deep: true }] } }] });
  await store.commitProjection({ name: "broken", version: "1", fromPosition: 0, toPosition: 2, writes: [{ key: "x", value: 1 }] });
  await store.failProjection("broken", { position: 3, eventId: "e3", message: "bad payload" });
  // A blob.
  await store.putBlob(new TextEncoder().encode("migration blob content"));
  await store.close();
}

test("dry-run reports the plan, takes the backup, and writes nothing to PostgreSQL", async () => {
  const report = await migrateSqliteToPostgres({ sqlitePath, url, schema, dryRun: true, backupTo: join(dir, "dry-backup.db") });
  expect(report.dryRun).toBe(true);
  expect(report.counts.events).toBe(5); // 4 original + 1 erasure tombstone
  expect(report.counts.records).toBe(3);
  expect(report.counts.outbox).toBe(3);
  expect(statSync(report.backupPath).size).toBeGreaterThan(0);
  const probe = new Database(report.backupPath, { readonly: true });
  expect((probe.query("SELECT count(*) AS n FROM events").get() as { n: number }).n).toBe(5);
  probe.close();
  const tables = await dropper`SELECT to_regclass(${`${schema}.events`}) AS t`;
  expect(tables[0]!.t).toBeNull(); // nothing was created on PostgreSQL
}, 30_000);

test("the real migration preserves everything and verifies", async () => {
  const report = await migrateSqliteToPostgres({ sqlitePath, url, schema });
  expect(report.dryRun).toBe(false);
  expect(report.projectionsToRebuild).toEqual(["broken"]);
  expect(report.verified.idempotencyReplays).toBe(1);
  expect(report.verified.eventLogDigest).not.toBe("");

  const source = openSqliteStore({ path: sqlitePath });
  const target = await openPostgresStore({ url, schema, pollMs: 0 });
  try {
    // Identical public reads: events (order, envelopes, erasure), stream versions.
    const sourceEvents = await source.readAll();
    const targetEvents = await target.store.readAll();
    expect(targetEvents.map((e) => [e.position, e.eventId, e.eventType, e.streamSequence, e.payload === null ? null : e.payload, e.erasure?.reason ?? null])).toEqual(
      sourceEvents.map((e) => [e.position, e.eventId, e.eventType, e.streamSequence, e.payload === null ? null : e.payload, e.erasure?.reason ?? null]),
    );
    expect(await target.store.streamVersion("runs")).toBe(await source.streamVersion("runs"));
    // Idempotent replay returns the recorded result from PostgreSQL.
    const replay = await target.store.commit({ idempotency: { scope: "tenant-a:alice:run.start", key: "k1", fingerprint: "fp1" }, appends: [] });
    expect(replay).toMatchObject({ kind: "duplicate", result: { runId: "run-1" } });
    // Records across collections.
    expect((await target.store.getRecord("runs", "run-1"))!.value).toEqual({ tenant: "tenant-a", agent: "agent.intake" });
    expect((await target.store.listRecords("continuations", { status: "RESUMED" })).map((r) => r.id)).toEqual(["c-1"]);
    // Outbox order and statuses survive (claim order continues from seq).
    const targetOutbox = await target.store.listOutbox();
    expect(targetOutbox.map((i) => [i.id, i.status, i.attempts, i.lastError])).toEqual([
      ["ob-1", "delivered", 1, null],
      ["ob-2", "pending", 1, "timeout"],
      ["ob-3", "poisoned", 1, "schema rejected"],
    ]);
    // Projections: healthy imported, broken excluded.
    expect(await target.store.getProjection("healthy")).toMatchObject({ position: 4, status: "ok" });
    expect(await target.store.listProjection("healthy")).toEqual([{ key: "a", value: 1 }, { key: "b", value: { nested: [1, 2, { deep: true }] } }]);
    expect(await target.store.getProjection("broken")).toBeUndefined();
    // Blobs.
    const hash = await target.store.putBlob(new TextEncoder().encode("migration blob content"));
    expect(hash).toMatch(/^sha256:/);
    // New writes continue past the imported positions without collision.
    const next = await target.store.commit({ appends: [{ streamId: "post-migration", expectedVersion: 0, events: [event("post.migration", { ok: true }, 9)] }] });
    expect(next.kind).toBe("committed");
    const afterMigration = await target.store.readAll();
    expect(afterMigration.at(-1)!.position).toBe(sourceEvents.length + 1);
  } finally {
    await target.store.close();
    source.close();
  }
}, 60_000);

test("a second import into the same schema is refused", async () => {
  await expect(migrateSqliteToPostgres({ sqlitePath, url, schema })).rejects.toThrow(/refusing to import twice/);
}, 30_000);

test("the SQLite source is untouched after migration", () => {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    expect((db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");
    expect((db.query("SELECT count(*) AS n FROM events").get() as { n: number }).n).toBe(5);
  } finally {
    db.close();
  }
});
