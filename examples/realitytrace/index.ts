// Example: realitytrace — committed-outbox observation delivery; receipts are recorded, never evidence.
// Docs: docs/evidence.md (ADR-0007; spec §20: observation delivery survives target failures without rollback).
import { event } from "@cognate/events/conformance";
import { createMemoryStore } from "@cognate/store-memory";
import { ObservationDelivery, observationIntent, OBSERVATION_TOPIC, type Observation, type ObservationPort } from "@cognate/realitytrace";

/** An in-memory observation target standing in for an external ledger (SxrCliPort, when SXR_BIN is configured). */
function memoryPort(): ObservationPort & { readonly seen: Observation[] } {
  const seen: Observation[] = [];
  const recorded = new Set<string>();
  return {
    id: "memory",
    seen,
    async record(observation) {
      seen.push(observation);
      const duplicate = recorded.has(observation.observationId);
      recorded.add(observation.observationId);
      return { status: duplicate ? "duplicate" : "accepted", observationId: observation.observationId, targetRef: `memory:${observation.observationId}`, detail: {} };
    },
  };
}

const usingSxrCli = Boolean(process.env.SXR_BIN);

async function main() {
  const store = createMemoryStore();
  const { events } = await store.commit({
    appends: [{ streamId: "case-1", expectedVersion: 0, events: [event("refund.approved", { amount: 5 }, { correlationId: "corr-rt", runId: "run-1" })] }],
  });
  const committed = events[0]!;
  // The runtime includes this in the same decision as the event; done as a second commit here for clarity.
  await store.commit({ appends: [], outbox: [observationIntent(committed, { classification: "durable_fact", capabilityId: "refund.approve" })] });

  // This example always exercises the in-memory port: SXR_BIN is a real external binary and the contract
  // for these examples forbids external services, so we only report whether it was configured.
  const port = memoryPort();
  const delivery = new ObservationDelivery(store, { port, backoff: { baseMs: 5, maxMs: 5, maxAttempts: 3 }, now: () => 0 });

  if (await delivery.isRecorded(committed.eventId)) throw new Error("expected the observation to start unrecorded");
  const drained = await delivery.drain();
  if (!drained.delivered.includes(committed.eventId)) throw new Error(`expected the observation to be delivered, got: ${JSON.stringify(drained)}`);
  const status = await delivery.status(committed.eventId);
  if (status?.state !== "accepted") throw new Error(`expected an accepted receipt, got: ${JSON.stringify(status)}`);

  console.log(`ok: observation for event ${committed.eventId} delivered and accepted via an in-memory ObservationPort (SXR_BIN configured: ${usingSxrCli})`);
}

await main();
