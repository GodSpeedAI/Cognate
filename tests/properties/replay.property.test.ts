// CG-PRJ-003 (spec §34.2): the same authoritative events and projection version replay to equivalent state.
import { expect, test } from "bun:test";
import fc from "fast-check";
import { event } from "@cognate/events/conformance";
import type { DurableStore } from "@cognate/events";
import { ProjectionRunner, type Projection } from "@cognate/projections";
import { storeCases } from "../support/stores.ts";

const balances: Projection = {
  name: "balances",
  version: "1",
  apply: (e, state) => {
    const { account, delta } = e.payload as { account: string; delta: number };
    return [{ key: account, value: ((state.get(account) as number | undefined) ?? 0) + delta }, { key: `last:${account}`, value: e.streamSequence }];
  },
};

const opArb = fc.array(fc.record({ stream: fc.constantFrom("s1", "s2", "s3"), account: fc.constantFrom("a", "b", "c", "d"), delta: fc.integer({ min: -100, max: 100 }) }), { minLength: 1, maxLength: 40 });

async function project(store: DurableStore, ops: { stream: string; account: string; delta: number }[], batchSize: number) {
  for (const op of ops) await store.commit({ appends: [{ streamId: op.stream, expectedVersion: await store.streamVersion(op.stream), events: [event("ledger.posted", { account: op.account, delta: op.delta })] }] });
  const runner = new ProjectionRunner(store, balances, { batchSize });
  await runner.catchUp();
  const first = await store.listProjection("balances");
  await runner.rebuild();
  return { first, rebuilt: await store.listProjection("balances") };
}

test("replay is deterministic across stores, batch sizes, and rebuilds", async () => {
  await fc.assert(
    fc.asyncProperty(opArb, fc.integer({ min: 1, max: 7 }), async (ops, batchSize) => {
      const results = [];
      for (const storeCase of storeCases) {
        const handle = await storeCase.open();
        try {
          results.push(await project(handle.store, ops, batchSize));
        } finally {
          await handle.dispose();
        }
      }
      for (const r of results) expect(r.rebuilt).toEqual(r.first);
      expect(results[1]!.first).toEqual(results[0]!.first);
    }),
    { numRuns: 60 },
  );
}, 60_000);
