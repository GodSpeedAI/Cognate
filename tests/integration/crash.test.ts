// CG-EVT-006: a process killed before commit leaves nothing visible; after commit, retry is safe (spec §10).
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { openSqliteStore } from "../../packages/store-sqlite/src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-crash-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const storeModule = resolve("packages/store-sqlite/src/index.ts");

function child(script: string) {
  const file = join(dir, `child-${crypto.randomUUID()}.ts`);
  writeFileSync(file, `import { openSqliteStore } from ${JSON.stringify(storeModule)};\n${script}`);
  return Bun.spawn(["bun", file], { stdout: "pipe", stderr: "pipe" });
}

const envelope = (i: number) => `{ eventType: "bulk.item", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: { i: ${i}, pad: "x".repeat(2000) } }`;

test("SIGKILL during large decisions leaves each decision all-or-nothing and the database intact", async () => {
  const path = join(dir, "kill.sqlite");
  for (let round = 0; round < 5; round++) {
    const proc = child(`
      const store = openSqliteStore({ path: ${JSON.stringify(path)} });
      let version = await store.streamVersion("bulk");
      console.log("ready");
      for (;;) {
        const events = Array.from({ length: 500 }, (_, i) => (${envelope(0)}));
        await store.commit({ appends: [{ streamId: "bulk", expectedVersion: version, events }], records: [{ collection: "batches", id: String(version), expectedVersion: 0, value: { size: 500 } }] });
        version += 500;
      }
    `);
    const reader = proc.stdout.getReader();
    await reader.read();
    await Bun.sleep(40 + round * 25);
    proc.kill("SIGKILL");
    await proc.exited;
  }
  const db = new Database(path);
  expect(db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  db.close();
  const store = openSqliteStore({ path });
  const version = await store.streamVersion("bulk");
  expect(version % 500).toBe(0);
  expect((await store.listRecords("batches")).length).toBe(version / 500);
  const events = await store.readStream("bulk");
  expect(events.map((e) => e.streamSequence)).toEqual(Array.from({ length: version }, (_, i) => i + 1));
  await store.close();
}, 30_000);

test("a decision committed just before a crash is returned as a duplicate on retry", async () => {
  const path = join(dir, "retry.sqlite");
  const proc = child(`
    const store = openSqliteStore({ path: ${JSON.stringify(path)} });
    await store.commit({ idempotency: { scope: "alice:pay", key: "pay-1", fingerprint: "fp" }, appends: [{ streamId: "pay", expectedVersion: 0, events: [${envelope(1)}] }], outbox: [{ id: "charge-1", topic: "payments", payload: { amount: 5 } }], result: { receipt: "r-1" } });
    console.log("committed");
    await new Promise(() => {});
  `);
  const reader = proc.stdout.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("committed");
  proc.kill("SIGKILL");
  await proc.exited;
  const store = openSqliteStore({ path });
  const retry = await store.commit({ idempotency: { scope: "alice:pay", key: "pay-1", fingerprint: "fp" }, appends: [{ streamId: "pay", expectedVersion: 0, events: [] }], result: { receipt: "other" } });
  expect(retry).toMatchObject({ kind: "duplicate", result: { receipt: "r-1" } });
  expect(await store.streamVersion("pay")).toBe(1);
  expect(await store.listOutbox({ topic: "payments" })).toHaveLength(1);
  await store.close();
}, 30_000);
