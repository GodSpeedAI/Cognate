// Durable store conformance kit. Every DurableStore implementation must pass it unchanged.
import { afterEach, describe, expect, test } from "bun:test";
import { CheckpointConflictError, ConcurrencyError, EnvelopeValidationError, IdempotencyMismatchError, RecordConflictError } from "./errors.ts";
import type { DurableStore, NewEvent, StoreFactory, StoreHandle, StoredEvent } from "./types.ts";

export function event(eventType: string, payload: NewEvent["payload"] = {}, overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    eventType,
    schemaVersion: 1,
    occurredAt: "2026-09-24T12:00:00.000Z",
    tenant: "tenant-a",
    correlationId: "corr-1",
    causationId: null,
    runId: "run-1",
    scopeId: "root",
    payload,
    ...overrides,
  };
}

export interface StoreKitOptions {
  /** Persistent stores must also pass reopen/durability tests. */
  readonly persistent: boolean;
}

export function storeConformance(name: string, factory: StoreFactory, options: StoreKitOptions): void {
  const handles: StoreHandle[] = [];
  const open = async (): Promise<DurableStore> => {
    const handle = await factory();
    handles.push(handle);
    return handle.store;
  };
  afterEach(async () => {
    for (const handle of handles.splice(0)) await handle.dispose();
  });

  describe(`${name}: streams (§10)`, () => {
    test("append assigns gap-free stream sequences, store positions, ids, and recorded time", async () => {
      const store = await open();
      const outcome = await store.commit({ appends: [{ streamId: "run-1", expectedVersion: 0, events: [event("run.started"), event("run.step")] }] });
      expect(outcome.kind).toBe("committed");
      const events = await store.readStream("run-1");
      expect(events.map((e) => e.streamSequence)).toEqual([1, 2]);
      expect(events[0]!.position).toBeLessThan(events[1]!.position);
      expect(events[0]!.eventId).toBeString();
      expect(Date.parse(events[0]!.recordedAt)).not.toBeNaN();
      expect(events[0]).toMatchObject({ streamId: "run-1", eventType: "run.started", tenant: "tenant-a", correlationId: "corr-1", runId: "run-1", scopeId: "root" });
      expect(await store.streamVersion("run-1")).toBe(2);
      expect(await store.streamVersion("absent")).toBe(0);
    });

    test("a stale expected version fails explicitly and appends nothing", async () => {
      const store = await open();
      await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [event("a.one")] }] });
      const error = await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [event("a.two")] }] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConcurrencyError);
      expect(error).toMatchObject({ streamId: "s", expectedVersion: 0, actualVersion: 1 });
      expect((await store.readStream("s")).map((e) => e.eventType)).toEqual(["a.one"]);
    });

    test("concurrent writers against the same version: exactly one wins", async () => {
      const store = await open();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => store.commit({ appends: [{ streamId: "hot", expectedVersion: 0, events: [event("w.write", { i })] }] })),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof ConcurrencyError)).toBe(true);
      expect(await store.streamVersion("hot")).toBe(1);
    });

    test("readStream and readAll page by sequence and position; order is not taken from timestamps", async () => {
      const store = await open();
      await store.commit({ appends: [{ streamId: "a", expectedVersion: 0, events: [event("x.a", {}, { occurredAt: "2030-01-01T00:00:00Z" })] }] });
      await store.commit({ appends: [{ streamId: "b", expectedVersion: 0, events: [event("x.b", {}, { occurredAt: "2001-01-01T00:00:00Z" })] }] });
      await store.commit({ appends: [{ streamId: "a", expectedVersion: 1, events: [event("x.c")] }] });
      const all = await store.readAll();
      expect(all.map((e) => e.eventType)).toEqual(["x.a", "x.b", "x.c"]);
      expect((await store.readAll({ afterPosition: all[0]!.position, limit: 1 })).map((e) => e.eventType)).toEqual(["x.b"]);
      expect((await store.readStream("a", { afterSequence: 1 })).map((e) => e.eventType)).toEqual(["x.c"]);
      expect(await store.getEvent(all[1]!.eventId)).toMatchObject({ eventType: "x.b" });
    });

    test("invalid envelopes are rejected before anything is written", async () => {
      const store = await open();
      const bad = { ...event("ok.event"), correlationId: "" };
      const error = await store.commit({ appends: [{ streamId: "v", expectedVersion: 0, events: [event("ok.event"), bad] }] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EnvelopeValidationError);
      expect(await store.streamVersion("v")).toBe(0);
    });

    test("envelope carries semantic reference, component, fiber, and metadata through storage", async () => {
      const store = await open();
      const semanticRef = { namespace: "billing", id: "billing::Refund", kind: "Flow", source: { uri: "file:///domain/billing.sea", digest: "sha256:abc" }, projectionVersion: "1" };
      await store.commit({ appends: [{ streamId: "p", expectedVersion: 0, events: [event("refund.approved", { amount: 5 }, { semanticRef, componentId: "approver", fiberId: "f-1", causationId: "evt-0", metadata: { actor: "alice" } })] }] });
      const [stored] = await store.readStream("p");
      expect(stored).toMatchObject({ semanticRef, componentId: "approver", fiberId: "f-1", causationId: "evt-0", metadata: { actor: "alice" }, payload: { amount: 5 } });
    });
  });

  describe(`${name}: atomic decisions and idempotency (§10, §13.1)`, () => {
    test("events, records, outbox intents, and result commit together", async () => {
      const store = await open();
      const outcome = await store.commit({
        idempotency: { scope: "alice:approve", key: "k1", fingerprint: "f1" },
        appends: [{ streamId: "case-1", expectedVersion: 0, events: [event("case.approved")] }],
        records: [{ collection: "continuations", id: "c1", expectedVersion: 0, value: { status: "RESUMED" } }],
        outbox: [{ id: "ob-1", topic: "email", payload: { to: "x" } }],
        result: { approved: true },
      });
      expect(outcome).toMatchObject({ kind: "committed", result: { approved: true } });
      expect(await store.getRecord("continuations", "c1")).toMatchObject({ version: 1, value: { status: "RESUMED" } });
      expect(await store.listOutbox({ topic: "email" })).toHaveLength(1);
    });

    test("a failure in any part of a decision leaves none of it visible", async () => {
      const store = await open();
      await store.commit({ appends: [], records: [{ collection: "runs", id: "r1", expectedVersion: 0, value: { state: "running" } }] });
      const error = await store
        .commit({
          idempotency: { scope: "s", key: "k", fingerprint: "f" },
          appends: [{ streamId: "atomic", expectedVersion: 0, events: [event("a.one")] }],
          records: [{ collection: "runs", id: "r1", expectedVersion: 0, value: { state: "conflict" } }],
          outbox: [{ id: "ob-x", topic: "t", payload: null }],
          result: "never",
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RecordConflictError);
      expect(await store.streamVersion("atomic")).toBe(0);
      expect(await store.listOutbox()).toHaveLength(0);
      expect((await store.getRecord("runs", "r1"))!.value).toEqual({ state: "running" });
      const retry = await store.commit({ idempotency: { scope: "s", key: "k", fingerprint: "f" }, appends: [], result: "fresh" });
      expect(retry).toMatchObject({ kind: "committed", result: "fresh" });
    });

    test("repeating a committed idempotency key returns the recorded result without a new fact", async () => {
      const store = await open();
      const request = { idempotency: { scope: "alice:pay", key: "pay-1", fingerprint: "fp" }, appends: [{ streamId: "pay", expectedVersion: 0, events: [event("pay.requested")] }], result: { receipt: "r-1" } };
      const first = await store.commit(request);
      const second = await store.commit(request);
      expect(second.kind).toBe("duplicate");
      expect(second.result).toEqual({ receipt: "r-1" });
      expect(second.events.map((e) => e.eventId)).toEqual(first.events.map((e) => e.eventId));
      expect(await store.streamVersion("pay")).toBe(1);
    });

    test("reusing a key for a different request is rejected", async () => {
      const store = await open();
      await store.commit({ idempotency: { scope: "a", key: "k", fingerprint: "one" }, appends: [] });
      await expect(store.commit({ idempotency: { scope: "a", key: "k", fingerprint: "two" }, appends: [] })).rejects.toBeInstanceOf(IdempotencyMismatchError);
      const other = await store.commit({ idempotency: { scope: "b", key: "k", fingerprint: "two" }, appends: [] });
      expect(other.kind).toBe("committed");
    });

    test("listeners see events only after commit, in commit order, and never for failed decisions", async () => {
      const store = await open();
      const seen: StoredEvent[] = [];
      const stop = store.onCommitted((events) => seen.push(...events));
      await store.commit({ appends: [{ streamId: "l", expectedVersion: 0, events: [event("l.one"), event("l.two")] }] });
      await store.commit({ appends: [{ streamId: "l", expectedVersion: 0, events: [event("l.bad")] }] }).catch(() => {});
      stop();
      await store.commit({ appends: [{ streamId: "l", expectedVersion: 2, events: [event("l.after")] }] });
      expect(seen.map((e) => e.eventType)).toEqual(["l.one", "l.two"]);
    });
  });

  describe(`${name}: records`, () => {
    test("records are versioned by compare-and-swap and filterable by top-level fields", async () => {
      const store = await open();
      await store.commit({ appends: [], records: [{ collection: "c", id: "1", expectedVersion: 0, value: { status: "OPEN", run: "r" } }, { collection: "c", id: "2", expectedVersion: 0, value: { status: "RESUMED", run: "r" } }] });
      await store.commit({ appends: [], records: [{ collection: "c", id: "1", expectedVersion: 1, value: { status: "CANCELLED", run: "r" } }] });
      await expect(store.commit({ appends: [], records: [{ collection: "c", id: "1", expectedVersion: 1, value: { status: "X", run: "r" } }] })).rejects.toBeInstanceOf(RecordConflictError);
      await expect(store.commit({ appends: [], records: [{ collection: "c", id: "2", expectedVersion: 0, value: {} }] })).rejects.toBeInstanceOf(RecordConflictError);
      expect(await store.getRecord("c", "1")).toMatchObject({ version: 2, value: { status: "CANCELLED" } });
      expect((await store.listRecords("c", { status: "RESUMED" })).map((r) => r.id)).toEqual(["2"]);
      expect((await store.listRecords("c")).map((r) => r.id).sort()).toEqual(["1", "2"]);
      expect(await store.getRecord("c", "missing")).toBeUndefined();
    });
  });

  describe(`${name}: outbox (§11, §13.1)`, () => {
    test("claim, retry with backoff, deliver, and never re-deliver a delivered item", async () => {
      const store = await open();
      await store.commit({ appends: [], outbox: [{ id: "o1", topic: "rt", payload: { n: 1 } }, { id: "o2", topic: "rt", payload: { n: 2 } }, { id: "o3", topic: "other", payload: null }] });
      const claimed = await store.claimOutbox({ topic: "rt", now: 1000, limit: 10, leaseMs: 5000 });
      expect(claimed.map((i) => i.id)).toEqual(["o1", "o2"]);
      expect(claimed[0]!.attempts).toBe(1);
      expect(await store.claimOutbox({ topic: "rt", now: 1001, limit: 10, leaseMs: 5000 })).toHaveLength(0);
      await store.settleOutbox("o1", { kind: "delivered", receipt: { id: "rcpt" } });
      await store.settleOutbox("o2", { kind: "retry", error: "timeout", retryAt: 2000 });
      expect(await store.claimOutbox({ topic: "rt", now: 1500, limit: 10, leaseMs: 5000 })).toHaveLength(0);
      const again = await store.claimOutbox({ topic: "rt", now: 2000, limit: 10, leaseMs: 5000 });
      expect(again.map((i) => [i.id, i.attempts, i.lastError])).toEqual([["o2", 2, "timeout"]]);
      expect((await store.listOutbox({ status: "delivered" })).map((i) => [i.id, i.receipt])).toEqual([["o1", { id: "rcpt" }]]);
    });

    test("an expired claim lease makes the item claimable again", async () => {
      const store = await open();
      await store.commit({ appends: [], outbox: [{ id: "o1", topic: "t", payload: null }] });
      await store.claimOutbox({ topic: "t", now: 0, limit: 1, leaseMs: 100 });
      expect(await store.claimOutbox({ topic: "t", now: 50, limit: 1, leaseMs: 100 })).toHaveLength(0);
      expect(await store.claimOutbox({ topic: "t", now: 101, limit: 1, leaseMs: 100 })).toHaveLength(1);
    });

    test("poisoned items stay visible until an operator requeues them", async () => {
      const store = await open();
      await store.commit({ appends: [], outbox: [{ id: "p1", topic: "t", payload: null }] });
      await store.claimOutbox({ topic: "t", now: 0, limit: 1, leaseMs: 10 });
      await store.settleOutbox("p1", { kind: "poisoned", error: "schema rejected" });
      expect(await store.claimOutbox({ topic: "t", now: 10_000, limit: 1, leaseMs: 10 })).toHaveLength(0);
      expect((await store.listOutbox({ status: "poisoned" }))[0]).toMatchObject({ id: "p1", lastError: "schema rejected" });
      await store.requeueOutbox("p1", 20_000);
      expect(await store.claimOutbox({ topic: "t", now: 20_000, limit: 1, leaseMs: 10 })).toHaveLength(1);
    });

    test("an outbox id is unique: re-adding it in a later decision is rejected", async () => {
      const store = await open();
      await store.commit({ appends: [], outbox: [{ id: "u1", topic: "t", payload: null }] });
      await expect(store.commit({ appends: [], outbox: [{ id: "u1", topic: "t", payload: null }] })).rejects.toThrow();
    });
  });

  describe(`${name}: projection checkpoints (§11)`, () => {
    test("state and checkpoint commit together; a stale fromPosition is rejected", async () => {
      const store = await open();
      expect(await store.getProjection("p")).toBeUndefined();
      await store.commitProjection({ name: "p", version: "1", fromPosition: 0, toPosition: 3, writes: [{ key: "a", value: 1 }, { key: "b", value: 2 }] });
      expect(await store.getProjection("p")).toMatchObject({ position: 3, version: "1", status: "ok", error: null });
      await expect(store.commitProjection({ name: "p", version: "1", fromPosition: 0, toPosition: 4, writes: [{ key: "a", value: 99 }] })).rejects.toBeInstanceOf(CheckpointConflictError);
      expect(await store.readProjection("p", "a")).toBe(1);
      await store.commitProjection({ name: "p", version: "1", fromPosition: 3, toPosition: 5, writes: [{ key: "b", value: null }] });
      expect(await store.listProjection("p")).toEqual([{ key: "a", value: 1 }]);
    });

    test("listProjection and listRecords are ordered by key and id regardless of write order", async () => {
      const store = await open();
      await store.commitProjection({ name: "o", version: "1", fromPosition: 0, toPosition: 1, writes: [{ key: "zeta", value: 1 }, { key: "Alpha", value: 2 }, { key: "\u{1F600}", value: 3 }, { key: "alpha", value: 4 }, { key: "\uFF21", value: 5 }] });
      expect((await store.listProjection("o")).map((e) => e.key)).toEqual(["Alpha", "alpha", "zeta", "\uFF21", "\u{1F600}"]);
      await store.commit({ appends: [], records: ["z", "B", "a"].map((id) => ({ collection: "ord", id, expectedVersion: 0, value: {} })) });
      expect((await store.listRecords("ord")).map((r) => r.id)).toEqual(["B", "a", "z"]);
    });

    test("failure records an error without advancing; reset removes derived state", async () => {
      const store = await open();
      await store.commitProjection({ name: "p", version: "1", fromPosition: 0, toPosition: 2, writes: [{ key: "k", value: "v" }] });
      await store.failProjection("p", { position: 3, eventId: "e3", message: "bad payload" });
      expect(await store.getProjection("p")).toMatchObject({ position: 2, status: "error", error: { position: 3, eventId: "e3", message: "bad payload" } });
      await store.resetProjection("p");
      expect(await store.getProjection("p")).toBeUndefined();
      expect(await store.listProjection("p")).toEqual([]);
    });
  });

  describe(`${name}: blobs and erasure (§13.1, §32)`, () => {
    test("blobs are content addressed and idempotent", async () => {
      const store = await open();
      const bytes = new TextEncoder().encode("hello artifact");
      const hash = await store.putBlob(bytes);
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(await store.putBlob(bytes)).toBe(hash);
      expect(new TextDecoder().decode(await store.getBlob(hash))).toBe("hello artifact");
      await store.deleteBlob(hash);
      expect(await store.getBlob(hash)).toBeUndefined();
    });

    test("erasure removes payload content, keeps the envelope, and records a tombstone event", async () => {
      const store = await open();
      const { events } = await store.commit({ appends: [{ streamId: "pii", expectedVersion: 0, events: [event("user.registered", { email: "a@example.com" })] }] });
      const id = events[0]!.eventId;
      await store.erasePayload(id, "gdpr-art-17", "operator-1");
      const erased = await store.getEvent(id);
      expect(erased).toMatchObject({ eventId: id, eventType: "user.registered", streamSequence: 1, payload: null, erasure: { reason: "gdpr-art-17" } });
      const tombstones = await store.readStream("$erasures");
      expect(tombstones.map((e) => [e.eventType, e.payload])).toEqual([["erasure.recorded", { eventId: id, reason: "gdpr-art-17", actorId: "operator-1" }]]);
      expect(JSON.stringify(await store.readAll())).not.toContain("a@example.com");
    });

    test("erasure redacts idempotency result snapshots derived from the erased event or its stream", async () => {
      const store = await open();
      // Two decisions whose recorded results copy event content: a transition snapshot (the
      // continuation shape) and a fold snapshot taken on the same stream (the updateState shape —
      // its result folds the stream's earlier events, including the soon-to-be-erased one).
      const { events } = await store.commit({
        idempotency: { scope: "actor:continuation.resume", key: "k1", fingerprint: "f1" },
        appends: [{ streamId: "cont-1", expectedVersion: 0, events: [event("continuation.resumed", { input: { secret: "s3cr3t" } })] }],
        result: { id: "cont-1", payload: { secret: "s3cr3t" } },
      });
      await store.commit({
        idempotency: { scope: "actor:run.state.update", key: "k2", fingerprint: "f2" },
        appends: [{ streamId: "cont-1", expectedVersion: 1, events: [event("state.changed", { snapshot: { v: 2 } })] }],
        result: { state: { v: 2, prior: "s3cr3t" }, version: 2 },
      });
      // An unrelated row that references nothing erased.
      await store.commit({ idempotency: { scope: "other", key: "k3", fingerprint: "f3" }, appends: [], result: { keep: true } });

      expect(await store.commit({ idempotency: { scope: "actor:continuation.resume", key: "k1", fingerprint: "f1" }, appends: [] })).toMatchObject({ kind: "duplicate", result: { payload: { secret: "s3cr3t" } } });

      await store.erasePayload(events[0]!.eventId, "dsar", "operator-1");

      // Replay after erasure returns the tombstone, never the recorded content; re-replaying the
      // request is deterministic (the same tombstone), and nothing discloses the secret.
      const replayAfter = await store.commit({ idempotency: { scope: "actor:continuation.resume", key: "k1", fingerprint: "f1" }, appends: [] });
      expect(replayAfter.kind).toBe("duplicate");
      expect(JSON.stringify(replayAfter.result)).toContain("__erased");
      expect(JSON.stringify(replayAfter)).not.toContain("s3cr3t");
      // The fold-shaped snapshot on the same stream is redacted too: erasure of any event on the
      // stream makes a stored fold a derived copy of erased content.
      const foldReplay = await store.commit({ idempotency: { scope: "actor:run.state.update", key: "k2", fingerprint: "f2" }, appends: [] });
      expect(JSON.stringify(foldReplay.result)).toContain("__erased");
      expect(JSON.stringify(foldReplay)).not.toContain("s3cr3t");
      // Unrelated idempotency rows are untouched.
      const unrelated = await store.commit({ idempotency: { scope: "other", key: "k3", fingerprint: "f3" }, appends: [] });
      expect(unrelated).toMatchObject({ kind: "duplicate", result: { keep: true } });
    });
  });

  if (options.persistent) {
    describe(`${name}: durability (§13.1, §31.2)`, () => {
      test("everything committed survives reopen; nothing uncommitted appears", async () => {
        const handle = await factory();
        handles.push(handle);
        await handle.store.commit({
          idempotency: { scope: "s", key: "k", fingerprint: "f" },
          appends: [{ streamId: "d", expectedVersion: 0, events: [event("d.one")] }],
          records: [{ collection: "runs", id: "r", expectedVersion: 0, value: { ok: true } }],
          outbox: [{ id: "o", topic: "t", payload: 1 }],
          result: "done",
        });
        await handle.store.commit({ appends: [{ streamId: "d", expectedVersion: 0, events: [event("d.lost")] }] }).catch(() => {});
        await handle.store.commitProjection({ name: "p", version: "1", fromPosition: 0, toPosition: 1, writes: [{ key: "x", value: 1 }] });
        const reopened = await handle.reopen!();
        expect((await reopened.readStream("d")).map((e) => e.eventType)).toEqual(["d.one"]);
        expect(await reopened.getRecord("runs", "r")).toMatchObject({ version: 1 });
        expect(await reopened.listOutbox()).toHaveLength(1);
        expect(await reopened.getProjection("p")).toMatchObject({ position: 1 });
        const replay = await reopened.commit({ idempotency: { scope: "s", key: "k", fingerprint: "f" }, appends: [{ streamId: "d", expectedVersion: 0, events: [event("d.one")] }], result: "done" });
        expect(replay).toMatchObject({ kind: "duplicate", result: "done" });
      });
    });
  }
}
