import { describe, expect, test } from "bun:test";
import { event } from "@godspeedai/cognate-events/conformance";
import { createMemoryStore } from "../src/index.ts";

// The store must never let a caller's mutation of a returned object reach internal state:
// every read (and every commit outcome) must hand back a copy, not a live reference.
describe("store-memory: result isolation", () => {
  test("mutating a commit outcome's events/records does not affect the store", async () => {
    const store = createMemoryStore();
    const outcome = await store.commit({
      appends: [{ streamId: "s", expectedVersion: 0, events: [event("a.one", { n: 1 })] }],
      records: [{ collection: "c", id: "1", expectedVersion: 0, value: { n: 1 } }],
    });
    if (outcome.kind !== "committed") throw new Error("expected committed outcome");
    // Mutate everything mutable on the returned objects.
    (outcome.events[0] as { payload: unknown }).payload = { n: 999 };
    (outcome.events as unknown[]).push("intruder");
    (outcome.records[0] as { value: unknown }).value = { n: 999 };

    const [stored] = await store.readStream("s");
    expect(stored!.payload).toEqual({ n: 1 });
    expect((await store.readStream("s")).length).toBe(1);
    const record = await store.getRecord("c", "1");
    expect(record!.value).toEqual({ n: 1 });

    await store.close();
  });

  test("mutating a readStream/readAll/getEvent/getRecord result does not affect later reads", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [event("a.one", { n: 1 })] }] });

    const events = await store.readStream("s");
    (events[0] as { payload: unknown }).payload = { hacked: true };
    events.push({ ...events[0]! });

    const all = await store.readAll();
    (all[0] as { payload: unknown }).payload = { hacked: true };

    const one = await store.getEvent(events[0]!.eventId);
    (one as { payload: unknown }).payload = { hacked: true };

    expect((await store.readStream("s")).length).toBe(1);
    expect((await store.readStream("s"))[0]!.payload).toEqual({ n: 1 });
    expect((await store.readAll())[0]!.payload).toEqual({ n: 1 });
    expect((await store.getEvent(events[0]!.eventId))!.payload).toEqual({ n: 1 });

    await store.close();
  });

  test("mutating a listOutbox/claimOutbox result does not affect the store", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], outbox: [{ id: "o1", topic: "t", payload: { n: 1 } }] });
    const claimed = await store.claimOutbox({ topic: "t", now: 0, limit: 1, leaseMs: 1000 });
    (claimed[0] as { payload: unknown }).payload = { hacked: true };

    const listed = await store.listOutbox();
    (listed[0] as { payload: unknown }).payload = { hacked: true };

    expect((await store.listOutbox())[0]!.payload).toEqual({ n: 1 });

    await store.close();
  });
});
