// CG-CON-001: continuation lifecycle with exactly one terminal transition under races (spec §12).
import { afterEach, describe, expect, test } from "bun:test";
import type { DurableStore } from "@godspeedai/events";
import type { Principal } from "@godspeedai/kernel-api";
import { storeCases } from "../../../tests/support/stores.ts";
import { ContinuationService, type ContinuationPolicy, type OpenContinuation, type ResumeHandler } from "../src/index.ts";

const alice: Principal = { id: "alice", kind: "user" };
const mallory: Principal = { id: "mallory", kind: "user" };
const policy: ContinuationPolicy = { authorize: ({ actor }) => (actor.id === "mallory" ? { allow: false, reason: "not an approver" } : { allow: true, reason: "approver" }) };

const approval = (overrides: Partial<OpenContinuation> = {}): OpenContinuation => ({
  type: "refund-approval",
  tenant: "tenant-a",
  runId: "run-1",
  scopeId: "root",
  correlationId: "corr-1",
  condition: { kind: "human_approval", role: "manager" },
  payload: { amount: 42, account: "acct-9" },
  handler: { id: "refund.resume", version: "1.0.0" },
  ...overrides,
});

const handler = (version: string, seen: string[]): ResumeHandler => ({
  id: "refund.resume",
  version,
  supports: (stored) => stored.split(".")[0] === version.split(".")[0],
  handle: async (record) => void seen.push(`${record.id}:${JSON.stringify(record.resolution?.input)}`),
});

for (const storeCase of storeCases) {
  describe(`continuations on ${storeCase.name} (§12)`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });
    const service = async (now = () => 1_000): Promise<{ svc: ContinuationService; store: DurableStore }> => {
      const handle = await storeCase.open();
      cleanups.push(handle.dispose);
      return { svc: new ContinuationService(handle.store, { policy, now, delivery: { baseMs: 10, maxMs: 40, maxAttempts: 5 } }), store: handle.store };
    };

    test("open persists every spec field and a creation event", async () => {
      const { svc, store } = await service();
      const semanticRef = { namespace: "billing", id: "billing::Refund", source: { uri: "file:///billing.sea", digest: "sha256:1" }, projectionVersion: "1" };
      const record = await svc.open(approval({ semanticRef, semanticProjectionVersion: "1", expiresAt: 5_000, ownerComponentId: "refunds" }));
      expect(record).toMatchObject({ type: "refund-approval", runId: "run-1", scopeId: "root", status: "OPEN", version: 1, expiresAt: 5_000, semanticRef, semanticProjectionVersion: "1", handler: { id: "refund.resume", version: "1.0.0" }, condition: { kind: "human_approval" }, payload: { amount: 42 }, resolution: null, ownerComponentId: "refunds" });
      const [created] = await store.readStream(`continuation-${record.id}`);
      expect(created).toMatchObject({ eventType: "continuation.opened", eventId: record.createdEventId, runId: "run-1", correlationId: "corr-1" });
      expect(await svc.get(record.id)).toEqual(record);
    });

    test("resume is authorized, records a resolution event, and is idempotent by key", async () => {
      const { svc, store } = await service();
      const { id } = await svc.open(approval());
      expect(await svc.resume(id, { actor: mallory, idempotencyKey: "m-1", input: { approved: true } })).toEqual({ kind: "denied", reason: "not an approver" });
      const first = await svc.resume(id, { actor: alice, idempotencyKey: "a-1", input: { approved: true } });
      expect(first).toMatchObject({ kind: "transitioned", record: { status: "RESUMED", resolution: { actorId: "alice", input: { approved: true } } } });
      const again = await svc.resume(id, { actor: alice, idempotencyKey: "a-1", input: { approved: true } });
      expect(again).toMatchObject({ kind: "duplicate", record: { status: "RESUMED" } });
      expect((await store.readStream(`continuation-${id}`)).map((e) => e.eventType)).toEqual(["continuation.opened", "continuation.resumed"]);
    });

    test("racing resume, cancel, and expiry yield exactly one terminal transition", async () => {
      let clock = 1_000;
      const { svc, store } = await service(() => clock);
      for (let round = 0; round < 10; round++) {
        const { id } = await svc.open(approval({ expiresAt: 2_000 }));
        clock = 2_000;
        const outcomes = await Promise.all([
          svc.resume(id, { actor: alice, idempotencyKey: `r-${round}`, input: {} }),
          svc.cancel(id, { actor: alice, idempotencyKey: `c-${round}`, reason: "changed mind" }),
          svc.expireDue().then((expired) => (expired.some((r) => r.id === id) ? "expired" : "not-expired")),
        ]);
        clock = 1_000;
        const transitions = (await store.readStream(`continuation-${id}`)).filter((e) => e.eventType !== "continuation.opened");
        expect(transitions).toHaveLength(1);
        const won = outcomes.filter((o) => o === "expired" || (typeof o === "object" && o.kind === "transitioned"));
        expect(won).toHaveLength(1);
        for (const o of outcomes) if (typeof o === "object" && o.kind !== "transitioned") expect(o.kind).toBe("already_terminal");
      }
    });

    test("expected version mismatch is reported without transitioning", async () => {
      const { svc } = await service();
      const { id } = await svc.open(approval());
      expect(await svc.resume(id, { actor: alice, idempotencyKey: "k", expectedVersion: 7, input: {} })).toMatchObject({ kind: "version_mismatch", record: { status: "OPEN", version: 1 } });
      expect(await svc.resume("missing", { actor: alice, idempotencyKey: "k2", input: {} })).toEqual({ kind: "not_found" });
    });

    test("only due continuations expire", async () => {
      let clock = 1_000;
      const { svc } = await service(() => clock);
      const due = await svc.open(approval({ expiresAt: 1_500 }));
      const later = await svc.open(approval({ expiresAt: 9_000 }));
      const never = await svc.open(approval());
      clock = 2_000;
      expect((await svc.expireDue()).map((r) => r.id)).toEqual([due.id]);
      expect((await svc.get(later.id))!.status).toBe("OPEN");
      expect((await svc.get(never.id))!.status).toBe("OPEN");
      expect((await svc.list({ status: "EXPIRED" })).map((r) => r.id)).toEqual([due.id]);
    });

    test("resumed continuations are delivered to a compatible handler exactly once", async () => {
      const { svc } = await service();
      const seen: string[] = [];
      svc.registerHandler(handler("1.4.0", seen));
      const { id } = await svc.open(approval());
      await svc.resume(id, { actor: alice, idempotencyKey: "k", input: { approved: true } });
      expect((await svc.dispatchResumes()).delivered).toHaveLength(1);
      expect((await svc.dispatchResumes()).delivered).toHaveLength(0);
      expect(seen).toEqual([`${id}:{"approved":true}`]);
    });

    test("a missing handler delays delivery; a newly registered compatible handler receives it", async () => {
      let clock = 1_000;
      const { svc } = await service(() => clock);
      const { id } = await svc.open(approval());
      await svc.resume(id, { actor: alice, idempotencyKey: "k", input: { approved: true } });
      expect((await svc.dispatchResumes()).retried).toHaveLength(1);
      const seen: string[] = [];
      const unregister = svc.registerHandler(handler("1.0.0", seen));
      clock = 5_000;
      expect((await svc.dispatchResumes()).delivered).toHaveLength(1);
      expect(seen).toHaveLength(1);
      unregister();
    });

    test("an incompatible handler version blocks the continuation instead of misinterpreting it", async () => {
      const { svc } = await service();
      const seen: string[] = [];
      svc.registerHandler(handler("2.0.0", seen));
      const { id } = await svc.open(approval());
      expect(await svc.resume(id, { actor: alice, idempotencyKey: "k", input: {} })).toMatchObject({ kind: "transitioned", record: { status: "BLOCKED" } });
      expect(seen).toEqual([]);
      const unblockBefore = await svc.unblock(id, { actor: alice, idempotencyKey: "u1" });
      expect(unblockBefore.kind).toBe("transitioned");
      expect((await svc.get(id))!.status).toBe("RESUMED");
    });

    test("fail and cancel are terminal and carry their reasons", async () => {
      const { svc } = await service();
      const a = await svc.open(approval());
      const b = await svc.open(approval());
      expect(await svc.fail(a.id, { actor: alice, idempotencyKey: "f", reason: "upstream gone" })).toMatchObject({ kind: "transitioned", record: { status: "FAILED", resolution: { reason: "upstream gone" } } });
      expect(await svc.cancel(b.id, { actor: alice, idempotencyKey: "c", reason: "withdrawn" })).toMatchObject({ kind: "transitioned", record: { status: "CANCELLED" } });
      expect(await svc.resume(a.id, { actor: alice, idempotencyKey: "late", input: {} })).toMatchObject({ kind: "already_terminal", record: { status: "FAILED" } });
    });
  });
}
