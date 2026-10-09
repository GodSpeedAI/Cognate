// CG-EVT-007 (spec §9.2): durable facts are appended, never undone by deleting or rewriting history.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { event } from "@godspeedai/cognate-events/conformance";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";

const dir = mkdtempSync(join(tmpdir(), "cognate-append-only-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("durable facts are append-only (§9.2)", () => {
  test("the store port offers no operation that deletes or rewrites an event", () => {
    for (const store of [createMemoryStore(), openSqliteStore({ path: ":memory:" })]) {
      const methods = Object.keys(store).filter((k) => typeof (store as unknown as Record<string, unknown>)[k] === "function");
      expect(methods.filter((m) => /^(delete|remove|update|rewrite|truncate|replace)(Events?|Streams?)$/i.test(m))).toEqual([]);
    }
  });

  test("committed envelopes never change when later facts are appended; correction is a later fact", async () => {
    const store = openSqliteStore({ path: join(dir, "facts.sqlite") });
    await store.commit({ appends: [{ streamId: "case", expectedVersion: 0, events: [event("case.approved", { amount: 5 })] }] });
    const before = await store.readStream("case");
    await store.commit({ appends: [{ streamId: "case", expectedVersion: 1, events: [event("case.approval_corrected", { amount: 4, corrects: before[0]!.eventId })] }] });
    const after = await store.readStream("case");
    expect(after[0]).toEqual(before[0]!);
    expect(after.map((e) => e.eventType)).toEqual(["case.approved", "case.approval_corrected"]);
    await store.close();
  });

  test("the SQLite file itself refuses to delete events or rewrite envelopes, even through raw SQL", async () => {
    const path = join(dir, "guarded.sqlite");
    const store = openSqliteStore({ path });
    await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [event("fact.recorded", { n: 1 })] }] });
    await store.close();
    const db = new Database(path);
    expect(() => db.exec("DELETE FROM events")).toThrow(/append-only/);
    expect(() => db.exec("UPDATE events SET event_type = 'forged'")).toThrow(/append-only/);
    expect(() => db.exec("UPDATE events SET stream_sequence = 99")).toThrow(/append-only/);
    expect((db.query("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n).toBe(1);
    db.close();
  });

  test("erasure (§32) remains possible: it removes payload content, never the envelope", async () => {
    const store = openSqliteStore({ path: join(dir, "erase.sqlite") });
    const { events } = await store.commit({ appends: [{ streamId: "p", expectedVersion: 0, events: [event("user.registered", { email: "x@example.com" })] }] });
    await store.erasePayload(events[0]!.eventId, "request", "dpo");
    expect(await store.getEvent(events[0]!.eventId)).toMatchObject({ eventType: "user.registered", payload: null, erasure: { reason: "request" } });
    await store.close();
  });
});
