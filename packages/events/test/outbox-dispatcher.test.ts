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

    test("retains serial delivery with an older adapter that lacks fenced methods", async () => {
      const { store } = await open();
      await intents(store, "legacy");
      const legacy = new Proxy(store, { get(target, key) {
        if (key === "claimOutboxLeased" || key === "renewOutboxLease" || key === "settleOutboxLease") return undefined;
        return Reflect.get(target, key, target);
      } }) as DurableStore;
      const dispatcher = new OutboxDispatcher(legacy, { topic: "mail", backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, now: () => 0, deliver: async (item) => ({ accepted: item.id }) });
      expect(await dispatcher.drain()).toEqual({ delivered: ["legacy"], retried: [], poisoned: [] });
      await intents(store, "legacy-parallel");
      const parallel = new OutboxDispatcher(legacy, { topic: "mail", concurrency: 2, backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, now: () => 0, deliver: async () => null });
      await expect(parallel.drain()).rejects.toThrow("requires fenced lease support");
    });

    test("uses fenced leases, renews active deliveries, and bounds parallel work", async () => {
      const { store } = await open();
      await intents(store, "m1", "m2");
      let active = 0;
      let maximum = 0;
      let renewals = 0;
      const renew = store.renewOutboxLease!.bind(store);
      const instrumented = new Proxy(store, { get(target, key) { if (key === "renewOutboxLease") return async (...args: Parameters<typeof renew>) => { renewals++; return renew(...args); }; return Reflect.get(target, key, target); } });
      const dispatcher = new OutboxDispatcher(instrumented, { topic: "mail", concurrency: 2, leaseMs: 15, backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, now: () => 0, deliver: async (item) => {
        active++;
        maximum = Math.max(maximum, active);
        await Bun.sleep(40);
        active--;
        return { accepted: item.id };
      } });
      expect(await dispatcher.drain()).toMatchObject({ delivered: ["m1", "m2"] });
      expect(maximum).toBe(2);
      expect(renewals).toBeGreaterThan(0);
      expect((await store.listOutbox({ status: "delivered" })).map((item) => item.receipt)).toEqual([{ accepted: "m1" }, { accepted: "m2" }]);
    });

    test("overlapping drains share capacity and admit newly queued work", async () => {
      const { store } = await open();
      await intents(store, "slow");
      const started: string[] = [];
      const releases = new Map<string, () => void>();
      const entered = new Map<string, () => void>();
      const waitFor = (id: string) => new Promise<void>((resolve) => entered.set(id, resolve));
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", concurrency: 2, batchSize: 1, leaseMs: 1_000, backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, deliver: async (item) => {
        started.push(item.id);
        entered.get(item.id)?.();
        await new Promise<void>((resolve) => releases.set(item.id, resolve));
        return item.id;
      } });

      const slowStarted = waitFor("slow");
      const firstDrain = dispatcher.drain();
      await slowStarted;
      await intents(store, "queued");
      const queuedStarted = waitFor("queued");
      const secondDrain = dispatcher.drain();
      await queuedStarted;
      expect(started).toEqual(["slow", "queued"]);
      releases.get("slow")?.();
      releases.get("queued")?.();
      expect(await firstDrain).toMatchObject({ delivered: ["slow"] });
      expect(await secondDrain).toMatchObject({ delivered: ["queued"] });
    });

    test("a completed slot refills before another delivery finishes", async () => {
      const { store } = await open();
      await intents(store, "first", "second", "third");
      const started: string[] = [];
      const releases = new Map<string, () => void>();
      const entered = new Map<string, () => void>();
      const waitFor = (id: string) => new Promise<void>((resolve) => entered.set(id, resolve));
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", concurrency: 2, leaseMs: 1_000, backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, deliver: async (item) => {
        started.push(item.id);
        entered.get(item.id)?.();
        await new Promise<void>((resolve) => releases.set(item.id, resolve));
        return item.id;
      } });

      const firstStarted = waitFor("first");
      const secondStarted = waitFor("second");
      const thirdStarted = waitFor("third");
      const draining = dispatcher.drain();
      await firstStarted;
      await secondStarted;
      releases.get("first")?.();
      await thirdStarted;
      expect(started).toEqual(["first", "second", "third"]);
      releases.get("second")?.();
      releases.get("third")?.();
      expect(await draining).toMatchObject({ delivered: ["first", "second", "third"] });
    });

    test("aborts and reports delivery when a fenced claim is superseded", async () => {
      const { store } = await open();
      if (!store.requeueOutbox || !store.claimOutboxLeased) throw new Error("store lacks fenced outbox leases");
      await intents(store, "lost");
      let started!: () => void;
      const didStart = new Promise<void>((resolve) => { started = resolve; });
      let signal: AbortSignal | undefined;
      const dispatcher = new OutboxDispatcher(store, { topic: "mail", concurrency: 1, batchSize: 1, leaseMs: 150, backoff: { baseMs: 10, maxMs: 100, maxAttempts: 3 }, now: () => Date.now(), deliver: async (_item, deliverySignal) => {
        signal = deliverySignal;
        started();
        await new Promise<void>((resolve) => {
          if (deliverySignal.aborted) resolve();
          else deliverySignal.addEventListener("abort", () => resolve(), { once: true });
        });
        return "late";
      } });
      const draining = dispatcher.drain();
      await didStart;
      await store.requeueOutbox("lost", Date.now());
      await Bun.sleep(100);
      expect(signal?.aborted).toBe(true);
      expect(await draining).toMatchObject({ lost: ["lost"] });
      expect((await store.listOutbox({ status: "delivered" }))).toHaveLength(0);
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
