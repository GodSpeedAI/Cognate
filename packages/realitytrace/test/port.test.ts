// CG-RT-001 (spec §20): committed-outbox observation delivery; receipts are not evidence; failures never roll back history.
import { afterEach, describe, expect, test } from "bun:test";
import { event } from "@godspeedai/cognate-events/conformance";
import type { DurableStore } from "@godspeedai/cognate-events";
import { storeCases } from "../../../tests/support/stores.ts";
import { ObservationDelivery, observationIntent, OBSERVATION_TOPIC, type Observation, type ObservationPort } from "../src/index.ts";

function scriptedPort(script: ("ok" | "fail")[]): ObservationPort & { seen: Observation[]; recorded: Set<string> } {
  const seen: Observation[] = [];
  const recorded = new Set<string>();
  return {
    id: "scripted",
    seen,
    recorded,
    async record(observation) {
      seen.push(observation);
      if ((script.shift() ?? "ok") === "fail") throw new Error("sxr unavailable");
      const duplicate = recorded.has(observation.observationId);
      recorded.add(observation.observationId);
      return { status: duplicate ? "duplicate" : "accepted", observationId: observation.observationId, targetRef: `ledger:${observation.observationId}`, detail: { already_committed: duplicate } };
    },
  };
}

async function commitObserved(store: DurableStore, stream: string) {
  const { events } = await store.commit({ appends: [{ streamId: stream, expectedVersion: 0, events: [event("refund.approved", { amount: 5 }, { correlationId: "corr-rt", runId: "run-1", componentId: "refunds", fiberId: "f-1" })] }] });
  const e = events[0]!;
  // The observation intent is committed in a second decision here only for test brevity; the runtime includes it in the same decision.
  await store.commit({ appends: [], outbox: [observationIntent(e, { classification: "durable_fact", capabilityId: "refund.approve" })] });
  return e;
}

for (const storeCase of storeCases) {
  describe(`observation delivery on ${storeCase.name} (§20)`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const c of cleanups.splice(0)) await c();
    });
    const open = async () => {
      const h = await storeCase.open();
      cleanups.push(h.dispose);
      return h.store;
    };

    test("the intent carries stable identity and every available correlation field", async () => {
      const store = await open();
      const e = await commitObserved(store, "s1");
      const [item] = await store.listOutbox({ topic: OBSERVATION_TOPIC });
      const observation = item!.payload as unknown as Observation;
      expect(item!.id).toBe(`observation:${e.eventId}`);
      expect(observation).toMatchObject({ eventId: e.eventId, correlationId: "corr-rt", runId: "run-1", componentId: "refunds", fiberId: "f-1", capabilityId: "refund.approve", classification: "durable_fact", tenant: "tenant-a" });
      expect(observation.observationId).toBe(observationIntent(e, { classification: "durable_fact" }).id.replace("observation:", "obs-"));
    });

    test("accepted receipts are persisted and the strict gate opens only after acceptance", async () => {
      const store = await open();
      const e = await commitObserved(store, "s2");
      const delivery = new ObservationDelivery(store, { port: scriptedPort([]), backoff: { baseMs: 10, maxMs: 10, maxAttempts: 3 }, now: () => 0 });
      expect(await delivery.isRecorded(e.eventId)).toBe(false);
      expect((await delivery.status(e.eventId))?.state ?? "queued").toBe("queued");
      expect((await delivery.drain()).delivered).toEqual([e.eventId]);
      expect(await delivery.status(e.eventId)).toMatchObject({ state: "accepted", attempts: 1, targetRef: expect.stringContaining("ledger:") });
      expect(await delivery.isRecorded(e.eventId)).toBe(true);
    });

    test("an unavailable target leaves the event committed, retries with the same observation id, then reconciles", async () => {
      let clock = 0;
      const store = await open();
      const e = await commitObserved(store, "s3");
      const port = scriptedPort(["fail", "fail", "ok"]);
      const delivery = new ObservationDelivery(store, { port, backoff: { baseMs: 10, maxMs: 40, maxAttempts: 5 }, now: () => clock });
      expect((await delivery.drain()).retried).toEqual([e.eventId]);
      expect(await store.getEvent(e.eventId)).toBeDefined();
      expect(await delivery.status(e.eventId)).toMatchObject({ state: "retrying", lastError: "sxr unavailable" });
      clock = 10;
      await delivery.drain();
      clock = 100;
      expect((await delivery.drain()).delivered).toEqual([e.eventId]);
      expect(new Set(port.seen.map((o) => o.observationId)).size).toBe(1);
    });

    test("redelivery after a lost receipt reconciles as duplicate, not a second observation", async () => {
      const store = await open();
      const e = await commitObserved(store, "s4");
      const port = scriptedPort([]);
      await port.record((await store.listOutbox({ topic: OBSERVATION_TOPIC }))[0]!.payload as unknown as Observation);
      const delivery = new ObservationDelivery(store, { port, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 3 }, now: () => 0 });
      await delivery.drain();
      expect(await delivery.status(e.eventId)).toMatchObject({ state: "duplicate" });
      expect(await delivery.isRecorded(e.eventId)).toBe(true);
    });

    test("exhausted retries surface for operator reconciliation; receipts never claim evidence", async () => {
      let clock = 0;
      const store = await open();
      const e = await commitObserved(store, "s5");
      const delivery = new ObservationDelivery(store, { port: scriptedPort(["fail", "fail"]), backoff: { baseMs: 1, maxMs: 1, maxAttempts: 2 }, now: () => clock });
      await delivery.drain();
      clock = 10;
      expect((await delivery.drain()).failed).toEqual([e.eventId]);
      expect((await delivery.unreconciled()).map((s) => s.eventId)).toEqual([e.eventId]);
      expect(JSON.stringify(await delivery.status(e.eventId))).not.toMatch(/evidence|settle/i);
    });
  });
}
