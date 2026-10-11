// DEBT-021 (mission §3.3): a mounted useProjection reader converges after a final
// projection-materialising event with NO second event and NO fixed sleep — the first read is made
// deterministically stale by gating the projection runner's fold commit, and the client's
// checkpoint-aware re-read finishes the job once the fold lands.
import { GlobalRegistrator } from "./setup-dom.ts";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { createClient } from "@godspeedai/cognate-client";
import type { DurableStore, ProjectionCommit } from "@godspeedai/cognate-events";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { Projection } from "@godspeedai/cognate-projections";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { createElement } from "react";
import { CognateProvider, useProjection } from "../src/index.tsx";


// Files share one process: hooks.test.tsx unregisters the globals in its own afterAll, so register
// here (before any test of this file) rather than at module load, and unregister when done.
beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

function gatedStore(inner: DurableStore) {
  let open = true;
  let releases: (() => void)[] = [];
  return {
    gate: {
      close(): void {
        open = false;
      },
      open(): void {
        open = true;
        for (const release of releases.splice(0)) release();
      },
    },
    store: Object.assign(Object.create(Object.getPrototypeOf(inner)) as DurableStore, inner, {
      async commitProjection(commit: ProjectionCommit): Promise<void> {
        if (!open) await new Promise<void>((resolve) => releases.push(resolve));
        await inner.commitProjection(commit);
      },
    }),
  };
}

// Public projections are tenant-partitioned by key prefix (spec §32).
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

function Items() {
  const rows = useProjection("items");
  // The service strips the tenant prefix from public projection keys on read (spec §32).
  const list = rows?.find((row) => row.key === "list")?.value as readonly string[] | undefined;
  return createElement("ul", { "data-testid": "items" }, (list ?? []).map((name, i) => createElement("li", { key: i })));
}

test("a mounted useProjection reader converges after the final event, on the checkpoint — not on a sleep", async () => {
  const { store, gate } = gatedStore(createMemoryStore());
  const runtime = await createRuntime({
    store: { store },
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [],
    projections: [{ projection: items, public: true }],
  });
  const client = createClient({ service: runtime.service, caller: alice });
  try {
    const commit = async (name: string): Promise<void> => {
      await runtime.store.commit({
        appends: [{ streamId: "catalog", expectedVersion: await runtime.store.streamVersion("catalog"), events: [{ eventType: "item.added", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: alice.tenant, correlationId: "corr", causationId: null, runId: null, scopeId: "root", payload: { name } }] }],
      });
    };
    await commit("a");
    const container = render(createElement(CognateProvider, { client, children: createElement(Items) })).container;
    const items = () => container.querySelector("ul")!;

    // 1. The projection is initially materialized at the old position.
    for (let i = 0; i < 500 && items()?.children.length !== 1; i++) await Bun.sleep(10);
    expect(items().children).toHaveLength(1);

    // 2-3. The final event commits; the client observes it, but the fold is held back, so the first
    // projection read returns the stale materialization.
    gate.close();
    await commit("b");
    await Bun.sleep(100); // let the stale read land; the correctness mechanism is the checkpoint below
    expect(items().children).toHaveLength(1);

    // 4-7. The runner catches up; the reader notices the inadequate checkpoint and converges.
    gate.open();
    for (let i = 0; i < 1000 && items()?.children.length !== 2; i++) await Bun.sleep(10);
    expect(items().children).toHaveLength(2);

    // 8-9. No second event was committed and convergence did not wait for a fixed sleep: exactly two
    // events exist, and the reader converged while the event log stood still.
    expect(await runtime.store.readAll()).toHaveLength(2);
  } finally {
    await client.close();
    await runtime.close();
  }
}, 30_000);
