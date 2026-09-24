// CG-CMT-002: outbox delivery is at least once, bounded, deduplicated by stable id, and never silently drops (spec §11, §13.1).
import { afterEach, describe, expect, test } from "bun:test";
import type { DurableStore, OutboxItem } from "../src/index.ts";
import { OutboxDispatcher, PermanentDeliveryError } from "../src/index.ts";
import { storeCases } from "../../../tests/support/stores.ts";

for (const storeCase of storeCases) {
  describe(`outbox dispatcher on ${storeCase.name}`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });
    const open = async () => {
      const handle = await storeCase.open();
      cleanups.push(handle.dispose);
      return handle;
    };
    const intents = (store: DurableStore, ...ids: string[]) => store.commit({ appends: [], outbox: ids.map((id) => ({ id, topic: "mail", payload: { id } })) });

    test("delivers committed intents once and records receipts", async () => {
      const { store } = await open();
      await intents(store, "m1", "m2");
      const seen: string[] = [];
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, now: () => 0, deliver: async (item) => (seen.push(item.id), { accepted: item.id }) });
      expect(await dispatcher.drain()).toEqual({ delivered: ["m1", "m2"], retried: [], poisoned: [] });
      expect(await dispatcher.drain()).toEqual({ delivered: [], retried: [], poisoned: [] });
      expect(seen).toEqual(["m1", "m2"]);
      expect((await store.listOutbox({ status: "delivered" })).map((i) => i.receipt)).toEqual([{ accepted: "m1" }, { accepted: "m2" }]);
    });

    test("transient failures retry with bounded exponential backoff, then poison", async () => {
      const { store } = await open();
      await intents(store, "flaky");
      let clock = 0;
      const attempts: number[] = [];
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", backoff: { baseMs: 100, maxMs: 250, maxAttempts: 4 }, now: () => clock, deliver: async (item: OutboxItem) => { attempts.push(item.attempts); throw new Error("503"); } });
      expect((await dispatcher.drain()).retried).toEqual([{ id: "flaky", retryAt: 100 }]);
      expect((await dispatcher.drain()).retried).toEqual([]);
      clock = 100;
      expect((await dispatcher.drain()).retried).toEqual([{ id: "flaky", retryAt: 300 }]);
      clock = 300;
      expect((await dispatcher.drain()).retried).toEqual([{ id: "flaky", retryAt: 550 }]);
      clock = 550;
      expect(await dispatcher.drain()).toEqual({ delivered: [], retried: [], poisoned: ["flaky"] });
      expect(attempts).toEqual([1, 2, 3, 4]);
      expect((await store.listOutbox({ status: "poisoned" }))[0]).toMatchObject({ id: "flaky", lastError: "503" });
    });

    test("a permanent failure poisons immediately and waits for operator replay", async () => {
      const { store } = await open();
      await intents(store, "bad");
      let reject = true;
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", backoff: { baseMs: 1, maxMs: 1, maxAttempts: 10 }, now: () => 0, deliver: async () => { if (reject) throw new PermanentDeliveryError("schema"); return "ok"; } });
      expect((await dispatcher.drain()).poisoned).toEqual(["bad"]);
      reject = false;
      expect((await dispatcher.drain()).delivered).toEqual([]);
      await store.requeueOutbox("bad", 0);
      expect((await dispatcher.drain()).delivered).toEqual(["bad"]);
    });

    test("an item delivered by a crashed dispatcher is redelivered with the same id (at least once)", async () => {
      const { store } = await open();
      await intents(store, "once");
      const received: string[] = [];
      await store.claimOutbox({ topic: "mail", now: 0, limit: 10, leaseMs: 50 });
      received.push("once");
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", leaseMs: 50, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 3 }, now: () => 51, deliver: async (item) => (received.push(item.id), "ok") });
      expect((await dispatcher.drain()).delivered).toEqual(["once"]);
      expect(received).toEqual(["once", "once"]);
    });
  });
}
