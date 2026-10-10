// DEBT-021 convergence: the client's ProjectionStore re-reads until the returned checkpoint covers
// the position of the event that triggered the refresh. A mounted useProjection reader converges
// after a projection-materialising write with no second event and no fixed sleep — the first read is
// deterministically held stale by gating the projection runner's fold commit.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { DurableStore, ProjectionCommit } from "@godspeedai/cognate-events";
import { createClient, type CognateClient } from "@godspeedai/cognate-client";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import type { Projection } from "@godspeedai/cognate-projections";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";

// A store wrapper whose commitProjection blocks while the gate is closed: the runtime's runner folds
// eagerly, but the fold cannot land until the test opens the gate — so a client read issued in that
// window deterministically returns the stale materialization with a behind checkpoint.
function gatedStore(inner: DurableStore) {
  let open = true;
  let releases: (() => void)[] = [];
  const gate = {
    close(): void {
      open = false;
    },
    open(): void {
      open = true;
      for (const release of releases.splice(0)) release();
    },
  };
  const store: DurableStore = Object.assign(Object.create(Object.getPrototypeOf(inner)) as DurableStore, inner, {
    async commitProjection(commit: ProjectionCommit): Promise<void> {
      if (!open) await new Promise<void>((resolve) => releases.push(resolve));
      await inner.commitProjection(commit);
    },
  });
  return { store, gate };
}

// Public projections are tenant-partitioned by key prefix (spec §32), like every real one.
const items: Projection = {
  name: "items",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "item.added") return [];
    const key = `${event.tenant}/list`;
    const current = (state.get(key) as readonly string[] | undefined) ?? [];
    return [{ key, value: [...current, (event.payload as { name: string }).name] }];
  },
};

async function runtimeWithClient(store: DurableStore): Promise<{ runtime: Runtime; client: CognateClient }> {
  const runtime = await createRuntime({
    store: { store },
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [],
    projections: [{ projection: items, public: true }],
  });
  const client = createClient({ service: runtime.service, caller: alice });
  return { runtime, client };
}

// A materialising write through the runtime service (a caller-sourced event the projection folds).
async function addItem(runtime: Runtime, name: string): Promise<number> {
  const outcome = await runtime.store.commit({
    appends: [{ streamId: "catalog", expectedVersion: await runtime.store.streamVersion("catalog"), events: [{ eventType: "item.added", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: alice.tenant, correlationId: "corr", causationId: null, runId: null, scopeId: "root", payload: { name } }] }],
  });
  return outcome.events[0]!.position;
}

test("the projection store re-reads until its checkpoint covers the triggering event", async () => {
  const { store, gate } = gatedStore(createMemoryStore());
  const { runtime, client } = await runtimeWithClient(store);
  try {
    await addItem(runtime, "a");
    const projection = client.projection("items");
    // Initial read: folds are up to date, so the first value covers everything so far.
    for (let i = 0; i < 500 && JSON.stringify(projection.get()) !== JSON.stringify([{ key: "list", value: ["a"] }]); i++) await Bun.sleep(10);
    expect(projection.get()).toEqual([{ key: "list", value: ["a"] }]);

    // Hold the runner's fold back, then commit the final materialising event. The client observes it
    // (its event stream), schedules a refresh for that position, and reads a STALE value.
    gate.close();
    const position = await addItem(runtime, "b");
    await Bun.sleep(100); // let the dispatch + the (stale) first read land; not a correctness device
    expect(projection.get()).toEqual([{ key: "list", value: ["a"] }]); // stale, checkpoint behind

    // Release the fold: the bounded, checkpoint-aware retry converges with no second event.
    gate.open();
    for (let i = 0; i < 1000 && JSON.stringify(projection.get()) !== JSON.stringify([{ key: "list", value: ["a", "b"] }]); i++) await Bun.sleep(10);
    expect(projection.get()).toEqual([{ key: "list", value: ["a", "b"] }]);
    void position;
  } finally {
    await client.close();
    await runtime.close();
  }
}, 30_000);
