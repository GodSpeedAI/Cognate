import { describe, expect, test, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bindCapabilities, loadSemanticProjection } from "@godspeedai/cognate-domainforge";
import { createRefundDesk } from "../src/refund-desk.ts";

async function until<T>(read: () => T, ok: (value: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (ok(value)) return value;
    if (Date.now() - start > ms) throw new Error(`timed out; last value: ${JSON.stringify(value)}`);
    await Bun.sleep(10);
  }
}

let desk: Awaited<ReturnType<typeof createRefundDesk>> | undefined;
afterEach(async () => {
  await desk?.close();
  desk = undefined;
});

describe("refund desk", () => {
  test("domain model loads", async () => {
    const source = await Bun.file(new URL("../domain/refund-desk.sea", import.meta.url)).text();
    const loaded = loadSemanticProjection(source, { uri: "refund-desk:///domain/refund-desk.sea" });
    if (!loaded.ok) throw new Error(`model did not load: ${JSON.stringify(loaded.error)}`);

    const ids = loaded.projection.objects.map((o) => o.ref.id);
    expect(ids).toEqual(expect.arrayContaining(["refunds::Order", "refunds::Refund", "refunds::refund_over_50_needs_approval"]));
    // Only explicitly bound semantic ids become capabilities.
    const [lookup, issue] = bindCapabilities(loaded.projection, [
      { semanticId: "refunds::Order", capability: { id: "orders.lookup", version: "1.0.0" } },
      { semanticId: "refunds::Refund", capability: { id: "refunds.issue", version: "1.0.0" } },
    ]);
    expect(lookup!.semanticRef?.id).toBe("refunds::Order");
    expect(issue!.semanticRef?.id).toBe("refunds::Refund");
    expect(() => bindCapabilities(loaded.projection, [{ semanticId: "refunds::Nope", capability: { id: "x", version: "1.0.0" } }])).toThrow(/unknown semantic id/);
  });

  test("small refund completes", async () => {
    desk = await createRefundDesk();
    const runId = await desk.propose(1002, 3000); // $30 on a $30 order
    const done = await until(() => desk!.status(runId), (s) => s.status === "completed");

    expect(done.openContinuations).toHaveLength(0);
    expect(done.output).toMatchObject({ status: "refunded", amountCents: 3000 });
    expect(desk.ledger).toEqual([{ refundId: `RF-${runId}`, orderId: 1002, amountCents: 3000 }]);
    // Extension: the receipt is sent once the refund is issued.
    expect(desk.receipts).toEqual([{ refundId: `RF-${runId}`, orderId: 1002, amountCents: 3000, customer: "Grace" }]);
  });

  test("large refund waits for approval", async () => {
    desk = await createRefundDesk();
    const runId = await desk.propose(1003, 7500); // $75
    const waiting = await until(() => desk!.status(runId), (s) => s.openContinuations.length === 1);

    expect(waiting.status).not.toBe("completed");
    expect(waiting.openContinuations[0]!.type).toBe("refund-approval");
    expect(desk.ledger).toHaveLength(0);
    expect(desk.orders.get(1003)!.refundedCents).toBe(0);
  });

  test("approval completes it", async () => {
    desk = await createRefundDesk();
    const runId = await desk.propose(1003, 7500);
    const waiting = await until(() => desk!.status(runId), (s) => s.openContinuations.length === 1);
    await desk.decide(waiting.openContinuations[0]!.id, true, "manager-1");

    const done = await until(() => desk!.status(runId), (s) => s.status === "completed");
    expect(done.output).toMatchObject({ status: "refunded", amountCents: 7500 });
    expect(desk.ledger).toEqual([{ refundId: `RF-${runId}`, orderId: 1003, amountCents: 7500 }]);
    expect(desk.orders.get(1003)!.refundedCents).toBe(7500);
  });

  test("denial refunds nothing", async () => {
    desk = await createRefundDesk();
    const runId = await desk.propose(1001, 6000); // $60
    const waiting = await until(() => desk!.status(runId), (s) => s.openContinuations.length === 1);
    await desk.decide(waiting.openContinuations[0]!.id, false, "manager-1");

    const done = await until(() => desk!.status(runId), (s) => s.status === "completed");
    expect(done.output).toMatchObject({ status: "denied", amountCents: 6000 });
    expect(desk.ledger).toHaveLength(0);
    expect(desk.orders.get(1001)!.refundedCents).toBe(0);
    expect(desk.receipts).toHaveLength(0);

    const types = (await desk.history(runId)).map((e) => e.type);
    expect(types).toContain("refund.denied");
    expect(types).not.toContain("refund.issued");
  });

  test("history records each step", async () => {
    desk = await createRefundDesk();
    const runId = await desk.propose(1003, 7500);
    const waiting = await until(() => desk!.status(runId), (s) => s.openContinuations.length === 1);
    await desk.decide(waiting.openContinuations[0]!.id, true, "manager-1");
    await until(() => desk!.status(runId), (s) => s.status === "completed");

    const types = (await desk.history(runId)).map((e) => e.type);
    const expected = [
      "run.started",
      "refund.proposed",
      "refund.awaiting_approval",
      "refund.approved",
      "refund.issued",
      "run.completed",
    ];
    // Subsequence check: each expected type appears, in this order.
    let cursor = 0;
    for (const t of types) if (t === expected[cursor]) cursor++;
    expect(cursor).toBe(expected.length);
    // The refund must not be recorded as issued before approval was recorded.
    expect(types.indexOf("refund.issued")).toBeGreaterThan(types.indexOf("refund.approved"));
  });

  test("(f) refunds survive a restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "refund-desk-"));
    const storePath = join(dir, "nested", "store.sqlite");
    try {
      // The SQLite store does not create its parent directory (friction F-3).
      await mkdir(dirname(storePath), { recursive: true });

      desk = await createRefundDesk({ store: storePath });
      const runId = await desk.propose(1001, 6000); // $60 needs approval
      const waiting = await until(() => desk!.status(runId), (s) => s.openContinuations.length === 1);
      await desk.decide(waiting.openContinuations[0]!.id, true, "manager-1");
      await until(() => desk!.status(runId), (s) => s.status === "completed");
      await desk.close();
      desk = undefined;

      // Reopen the same store: business state must come back from the refund.issued events.
      desk = await createRefundDesk({ store: storePath });
      expect(desk.orders.get(1001)!.refundedCents).toBe(6000);
      expect(desk.ledger).toEqual([{ refundId: `RF-${runId}`, orderId: 1001, amountCents: 6000 }]);

      // $60 of the $120 order is still refundable; $70 must be rejected after the restart.
      const second = await desk.propose(1001, 7000);
      const rejected = await until(() => desk!.status(second), (s) => s.status === "completed");
      expect(rejected.output).toMatchObject({ status: "rejected", reason: "exceeds_refundable", refundable: 6000 });
      expect(desk.ledger).toHaveLength(1);
      expect(desk.orders.get(1001)!.refundedCents).toBe(6000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
