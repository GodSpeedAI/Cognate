// CG-PRJ-001: idempotent, atomically checkpointed projections that never skip a failure (spec §11).
import { afterEach, describe, expect, test } from "bun:test";
import { event } from "@godspeedai/cognate-events/conformance";
import type { DurableStore, StoredEvent } from "@godspeedai/cognate-events";
import { storeCases } from "../../../tests/support/stores.ts";
import { ProjectionRunner, type Projection } from "../src/index.ts";

/** Counts events per type and sums `amount`; fails on events flagged poison while `poisonEnabled`. */
function ledgerProjection(options: { version?: string; poison?: { enabled: boolean } } = {}): Projection & { calls: number } {
  const projection = {
    name: "ledger",
    version: options.version ?? "1",
    calls: 0,
    apply(e: StoredEvent, state: { get(key: string): unknown }) {
      projection.calls++;
      if (options.poison?.enabled && (e.payload as { poison?: boolean }).poison) throw new Error(`cannot apply ${e.eventId}`);
      const count = (state.get(`count:${e.eventType}`) as number | undefined) ?? 0;
      const total = (state.get("total") as number | undefined) ?? 0;
      return [
        { key: `count:${e.eventType}`, value: count + 1 },
        { key: "total", value: total + ((e.payload as { amount?: number }).amount ?? 0) },
      ];
    },
  };
  return projection;
}

async function append(store: DurableStore, stream: string, ...payloads: Record<string, unknown>[]) {
  const version = await store.streamVersion(stream);
  await store.commit({ appends: [{ streamId: stream, expectedVersion: version, events: payloads.map((p) => event("money.moved", p as never)) }] });
}

for (const storeCase of storeCases) {
  describe(`projections on ${storeCase.name} (§11)`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });
    const open = async () => {
      const handle = await storeCase.open();
      cleanups.push(handle.dispose);
      return handle;
    };

    test("applies events across streams in position order and commits state with the checkpoint", async () => {
      const { store } = await open();
      await append(store, "a", { amount: 5 });
      await append(store, "b", { amount: 7 }, { amount: 1 });
      const runner = new ProjectionRunner(store, ledgerProjection());
      const result = await runner.catchUp();
      const all = await store.readAll();
      expect(result).toEqual({ status: "ok", position: all.at(-1)!.position, applied: 3 });
      expect(await store.readProjection("ledger", "total")).toBe(13);
      expect(await store.getProjection("ledger")).toMatchObject({ position: all.at(-1)!.position, version: "1", status: "ok" });
    });

    test("catching up twice applies each event exactly once", async () => {
      const { store } = await open();
      await append(store, "a", { amount: 2 }, { amount: 3 });
      const projection = ledgerProjection();
      const runner = new ProjectionRunner(store, projection);
      await runner.catchUp();
      await runner.catchUp();
      expect(projection.calls).toBe(2);
      expect(await store.readProjection("ledger", "count:money.moved")).toBe(2);
    });

    test("small batches reach the same state as one large batch", async () => {
      const { store } = await open();
      for (let i = 0; i < 10; i++) await append(store, `s${i % 3}`, { amount: i });
      await new ProjectionRunner(store, ledgerProjection(), { batchSize: 3 }).catchUp();
      expect(await store.readProjection("ledger", "total")).toBe(45);
    });

    test("a poison event stops the checkpoint before it, records an error, and is never skipped", async () => {
      const { store } = await open();
      await append(store, "a", { amount: 1 }, { amount: 2 });
      await append(store, "a", { amount: 100, poison: true });
      await append(store, "a", { amount: 4 });
      const poison = { enabled: true };
      const runner = new ProjectionRunner(store, ledgerProjection({ poison }));
      const all = await store.readAll();
      const result = await runner.catchUp();
      expect(result).toMatchObject({ status: "error", position: all[1]!.position, error: { position: all[2]!.position, eventId: all[2]!.eventId } });
      expect(await store.readProjection("ledger", "total")).toBe(3);
      expect(await runner.catchUp()).toMatchObject({ status: "error", position: all[1]!.position });
      expect(await store.readProjection("ledger", "total")).toBe(3);
      poison.enabled = false;
      expect(await runner.retry()).toMatchObject({ status: "ok", position: all[3]!.position });
      expect(await store.readProjection("ledger", "total")).toBe(107);
    });

    test("a projection version change requires rebuild instead of reinterpreting old state", async () => {
      const { store } = await open();
      await append(store, "a", { amount: 1 });
      await new ProjectionRunner(store, ledgerProjection({ version: "1" })).catchUp();
      const v2 = new ProjectionRunner(store, ledgerProjection({ version: "2" }));
      expect(await v2.catchUp()).toEqual({ status: "rebuild_required", storedVersion: "1" });
      expect(await v2.rebuild()).toMatchObject({ status: "ok", applied: 1 });
      expect(await store.getProjection("ledger")).toMatchObject({ version: "2" });
    });

    test("rebuild after deleting derived state reproduces the same state", async () => {
      const { store } = await open();
      for (let i = 1; i <= 6; i++) await append(store, `s${i % 2}`, { amount: i });
      const runner = new ProjectionRunner(store, ledgerProjection());
      await runner.catchUp();
      const before = await store.listProjection("ledger");
      await store.resetProjection("ledger");
      expect(await store.listProjection("ledger")).toEqual([]);
      await runner.rebuild();
      expect(await store.listProjection("ledger")).toEqual(before);
    });

    test("live mode follows commits and waitFor resolves at the committed position", async () => {
      const { store } = await open();
      const runner = new ProjectionRunner(store, ledgerProjection());
      runner.start();
      await append(store, "live", { amount: 9 });
      const [last] = (await store.readAll()).slice(-1);
      await runner.waitFor(last!.position, 2000);
      expect(await store.readProjection("ledger", "total")).toBe(9);
      await runner.stop();
      await append(store, "live", { amount: 1 });
      await Bun.sleep(20);
      expect(await store.readProjection("ledger", "total")).toBe(9);
    });

    test("two runners on the same projection cannot both advance the checkpoint", async () => {
      const { store } = await open();
      for (let i = 0; i < 20; i++) await append(store, "race", { amount: 1 });
      const results = await Promise.all([new ProjectionRunner(store, ledgerProjection(), { batchSize: 2 }).catchUp(), new ProjectionRunner(store, ledgerProjection(), { batchSize: 2 }).catchUp()]);
      expect(results.every((r) => r.status === "ok")).toBe(true);
      expect(await store.readProjection("ledger", "total")).toBe(20);
    });
  });
}
