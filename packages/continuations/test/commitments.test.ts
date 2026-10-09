// CG-CMT-001: external commitments are explicit records, never reversible effects (spec §9.3).
import { afterEach, describe, expect, test } from "bun:test";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { storeCases } from "../../../tests/support/stores.ts";
import { CommitmentRejectedError, CommitmentService, type CommitmentTarget, type IntendCommitment } from "../src/index.ts";

type Behaviour = "ok" | "reject" | "timeout";

function target(id: string, idempotent: boolean, script: Behaviour[]): CommitmentTarget & { calls: { key: string; attempt: number }[]; remote: Map<string, string> } {
  const calls: { key: string; attempt: number }[] = [];
  const remote = new Map<string, string>();
  return {
    id,
    idempotent,
    dedupRetentionMs: idempotent ? 86_400_000 : undefined,
    calls,
    remote,
    async dispatch(request) {
      calls.push({ key: request.idempotencyKey, attempt: request.attempt });
      const behaviour = script.shift() ?? "ok";
      if (behaviour === "reject") throw new CommitmentRejectedError("card declined");
      if (behaviour === "timeout") {
        remote.set(request.idempotencyKey, `ch_${request.idempotencyKey}`); // the effect happened; the response was lost
        throw new Error("socket timeout");
      }
      const ref = remote.get(request.idempotencyKey) ?? `ch_${request.idempotencyKey}`;
      remote.set(request.idempotencyKey, ref);
      return { remoteRef: ref, result: { charged: true } as Json };
    },
    async status(request) {
      const ref = remote.get(request.idempotencyKey);
      return ref ? { state: "succeeded", remoteRef: ref, result: { charged: true } } : { state: "unknown" };
    },
  };
}

const charge = (key: string, targetId = "payments"): IntendCommitment => ({ targetId, operation: "charge", idempotencyKey: key, payload: { amount: 42 }, tenant: "tenant-a", scopeId: "root", correlationId: "corr-1" });

for (const storeCase of storeCases) {
  describe(`commitments on ${storeCase.name} (§9.3)`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });
    let clock = 0;
    const service = async (): Promise<{ svc: CommitmentService; store: DurableStore }> => {
      clock = 0;
      const handle = await storeCase.open();
      cleanups.push(handle.dispose);
      return { svc: new CommitmentService(handle.store, { now: () => clock, backoff: { baseMs: 10, maxMs: 40, maxAttempts: 4 } }), store: handle.store };
    };

    test("intent is durable before dispatch and idempotent by key", async () => {
      const { svc, store } = await service();
      svc.registerTarget(target("payments", true, []));
      const intent = await svc.intend(charge("order-1"));
      expect(intent).toMatchObject({ state: "INTENDED", attempts: 0, targetId: "payments", operation: "charge", idempotencyKey: "order-1", targetIdempotent: true, dedupRetentionMs: 86_400_000, compensates: null });
      expect((await svc.intend(charge("order-1"))).id).toBe(intent.id);
      expect(await store.listOutbox({ status: "pending" })).toHaveLength(1);
    });

    test("success records remote reference and result", async () => {
      const { svc, store } = await service();
      svc.registerTarget(target("payments", true, ["ok"]));
      const { id } = await svc.intend(charge("order-2"));
      await svc.dispatch();
      expect(await svc.get(id)).toMatchObject({ state: "SUCCEEDED", attempts: 1, remoteRef: "ch_order-2", result: { charged: true } });
      expect((await store.readStream(`commitment-${id}`)).map((e) => e.eventType)).toEqual(["commitment.intended", "commitment.dispatching", "commitment.succeeded"]);
    });

    test("a definite rejection is FAILED, not retried", async () => {
      const { svc } = await service();
      const t = target("payments", true, ["reject"]);
      svc.registerTarget(t);
      const { id } = await svc.intend(charge("order-3"));
      await svc.dispatch();
      clock = 1_000;
      await svc.dispatch();
      expect(await svc.get(id)).toMatchObject({ state: "FAILED", lastError: "card declined" });
      expect(t.calls).toHaveLength(1);
    });

    test("a lost response on a non-idempotent target is UNKNOWN and never blindly retried", async () => {
      const { svc } = await service();
      const t = target("wire", false, ["timeout"]);
      svc.registerTarget(t);
      const { id } = await svc.intend(charge("wire-1", "wire"));
      await svc.dispatch();
      clock = 10_000;
      await svc.dispatch();
      expect(await svc.get(id)).toMatchObject({ state: "UNKNOWN_RECONCILIATION_REQUIRED", attempts: 1 });
      expect(t.calls).toHaveLength(1);
      expect(await svc.reconcile(id)).toMatchObject({ state: "SUCCEEDED", remoteRef: "ch_wire-1" });
    });

    test("a lost response on an idempotent target retries with the same key", async () => {
      const { svc } = await service();
      const t = target("payments", true, ["timeout", "ok"]);
      svc.registerTarget(t);
      const { id } = await svc.intend(charge("order-4"));
      await svc.dispatch();
      expect((await svc.get(id))!.state).toBe("UNKNOWN_RECONCILIATION_REQUIRED");
      clock = 10;
      await svc.dispatch();
      expect(await svc.get(id)).toMatchObject({ state: "SUCCEEDED", attempts: 2, remoteRef: "ch_order-4" });
      expect(t.calls.map((c) => c.key)).toEqual(["order-4", "order-4"]);
    });

    test("a crash after DISPATCHING was committed is treated as unknown for non-idempotent targets", async () => {
      const { svc, store } = await service();
      const t = target("wire", false, []);
      svc.registerTarget(t);
      const { id } = await svc.intend(charge("wire-2", "wire"));
      // Simulate a dispatcher that committed DISPATCHING and died before recording the outcome.
      const [item] = await store.claimOutbox({ topic: "commitment.dispatch", now: 0, limit: 1, leaseMs: 5 });
      const record = await store.getRecord("commitments", id);
      await store.commit({ appends: [], records: [{ collection: "commitments", id, expectedVersion: record!.version, value: { ...record!.value, state: "DISPATCHING", attempts: 1 } }] });
      expect(item).toBeDefined();
      clock = 100;
      await svc.dispatch();
      expect(await svc.get(id)).toMatchObject({ state: "UNKNOWN_RECONCILIATION_REQUIRED" });
      expect(t.calls).toHaveLength(0);
    });

    test("manual reconciliation records actor and reason; compensation is a new record", async () => {
      const { svc, store } = await service();
      svc.registerTarget(target("wire", false, ["timeout", "ok"]));
      const { id } = await svc.intend(charge("wire-3", "wire"));
      await svc.dispatch();
      const resolved = await svc.resolveManually(id, { actor: { id: "ops", kind: "user" }, reason: "bank statement shows charge", outcome: { state: "succeeded", remoteRef: "bank-77", result: null } });
      expect(resolved).toMatchObject({ state: "SUCCEEDED", remoteRef: "bank-77" });
      const reconciled = (await store.readStream(`commitment-${id}`)).at(-1)!;
      expect(reconciled).toMatchObject({ eventType: "commitment.reconciled", payload: { actorId: "ops", reason: "bank statement shows charge" } });
      const refund = await svc.compensate(id, { targetId: "wire", operation: "refund", idempotencyKey: "wire-3-refund", payload: { amount: 42 } });
      expect(refund).toMatchObject({ state: "INTENDED", compensates: id, operation: "refund" });
      expect(await svc.get(id)).toMatchObject({ state: "SUCCEEDED", remoteRef: "bank-77" });
    });

    test("compensation of a commitment that did not succeed is refused", async () => {
      const { svc } = await service();
      svc.registerTarget(target("payments", true, ["reject"]));
      const { id } = await svc.intend(charge("order-5"));
      await svc.dispatch();
      await expect(svc.compensate(id, { targetId: "payments", operation: "refund", idempotencyKey: "r", payload: null })).rejects.toThrow();
    });
  });
}
