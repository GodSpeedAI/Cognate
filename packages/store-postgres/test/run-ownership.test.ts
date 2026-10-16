// Fenced run-write ownership (docs/contracts/run-write-ownership.md). RED/GREEN regressions:
// these journeys define the two-process contract — an authoritative store-time owner per
// enrolled run, generation fencing for every run-scoped append, refused uncredited writes to
// enrolled runs, legacy behavior for unenrolled runs, and crash recovery where a reclaimed
// owner fences the killed owner's late writes. They fail until the store implements the
// extension, and must never pass by skipping.
import { expect, test } from "bun:test";
import { openPostgresStore } from "../src/index.ts";
import { RunOwnershipHeldError, StaleRunOwnerError, type CommitRequest, type NewEvent } from "@godspeedai/cognate-events";

const URL = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

let clock = 1_000;
const tick = (ms: number) => (clock += ms);

function runEvent(runId: string, ordinal: number): NewEvent {
  return {
    eventType: "ownership.test",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    tenant: "test",
    correlationId: `run:${runId}`,
    causationId: null,
    runId,
    scopeId: "root",
    payload: { ordinal },
  };
}

function runAppend(runId: string, ordinal: number, ownership?: { readonly runId: string; readonly ownerId: string; readonly generation: number }) {
  return { streamId: `run-${runId}`, expectedVersion: ordinal - 1, events: [runEvent(runId, ordinal)], ...(ownership ? { runOwnership: ownership } : {}) };
}

async function openStore(schema: string) {
  return openPostgresStore({ url: URL, schema, maxConnections: 4, pollMs: 0 });
}

test("run ownership is exclusive, reclaims only after expiry, and fences generations", async () => {
  const schema = `cognate_own_${crypto.randomUUID().replaceAll("-", "")}`;
  const handle = await openStore(schema);
  const { store } = handle;
  try {
    expect(store.claimRunOwnership).toBeDefined();
    expect(store.renewRunOwnership).toBeDefined();
    expect(store.releaseRunOwnership).toBeDefined();
    const claim = store.claimRunOwnership!;
    const renew = store.renewRunOwnership!;
    const release = store.releaseRunOwnership!;

    // First claim enrolls the run at generation 1.
    const nowOne = tick(0);
    const first = await claim({ runId: "run-A", ownerId: "worker-1", now: nowOne, leaseMs: 5_000 });
    expect(first).toMatchObject({ runId: "run-A", ownerId: "worker-1", generation: 1, expiresAt: nowOne + 5_000 });

    // A different owner is refused while the lease is unexpired, with the current lease as truth.
    await expect(claim({ runId: "run-A", ownerId: "worker-2", now: tick(1), leaseMs: 5_000 })).rejects.toBeInstanceOf(RunOwnershipHeldError);

    // The same owner refreshes without advancing the generation.
    const refresh = await claim({ runId: "run-A", ownerId: "worker-1", now: tick(1), leaseMs: 10_000 });
    expect(refresh.generation).toBe(1);

    // Renewal requires the exact identity and an unexpired lease.
    expect(await renew({ runId: "run-A", ownerId: "worker-1", generation: 1, now: clock, leaseMs: 5_000 })).toBe(true);
    expect(await renew({ runId: "run-A", ownerId: "worker-1", generation: 99, now: clock, leaseMs: 5_000 })).toBe(false);
    expect(await renew({ runId: "run-A", ownerId: "worker-2", generation: 1, now: clock, leaseMs: 5_000 })).toBe(false);

    // Reclaim after expiry advances the generation and replaces the owner.
    const late = tick(30_000);
    const reclaimed = await claim({ runId: "run-A", ownerId: "worker-2", now: late, leaseMs: 5_000 });
    expect(reclaimed).toMatchObject({ runId: "run-A", ownerId: "worker-2", generation: 2 });

    // Release clears the owner, advances the generation and keeps the run enrolled.
    expect(await release({ runId: "run-A", ownerId: "worker-2", generation: 2 })).toBe(true);
    expect(await renew({ runId: "run-A", ownerId: "worker-2", generation: 2, now: clock, leaseMs: 5_000 })).toBe(false);
    // A post-release claim reclaims through the expired, ownerless row: the release advanced the
    // generation to 3 and the reclaim advances it again to 4 — every earlier worker stays fenced.
    const reopened = await claim({ runId: "run-A", ownerId: "worker-3", now: tick(1), leaseMs: 5_000 });
    expect(reopened.generation).toBe(4);
  } finally {
    await handle.close();
    await handle.dropSchema();
  }
});

test("enrolled runs fence run-scoped appends by owner and generation; unenrolled runs stay legacy", async () => {
  const schema = `cognate_own_${crypto.randomUUID().replaceAll("-", "")}`;
  const handle = await openStore(schema);
  const { store } = handle;
  try {
    const claim = store.claimRunOwnership!;
    const now = tick(0);
    await claim({ runId: "run-B", ownerId: "worker-1", now, leaseMs: 60_000 });
    const ownership = { runId: "run-B", ownerId: "worker-1", generation: 1 };

    // Credited append commits.
    const credited: CommitRequest = { appends: [runAppend("run-B", 1, ownership)] };
    expect((await store.commit(credited)).kind).toBe("committed");

    // A stale generation is refused with nothing appended.
    const stale: CommitRequest = { appends: [runAppend("run-B", 2, { ...ownership, generation: 0 })] };
    await expect(store.commit(stale)).rejects.toBeInstanceOf(StaleRunOwnerError);
    expect((await store.readStream("run-run-B"))).toHaveLength(1);

    // A missing credential on an enrolled run is refused fail-closed.
    const uncredited: CommitRequest = { appends: [runAppend("run-B", 2)] };
    await expect(store.commit(uncredited)).rejects.toBeInstanceOf(StaleRunOwnerError);
    expect((await store.readStream("run-run-B"))).toHaveLength(1);

    // A wrong owner is refused even with the right generation.
    const wrongOwner: CommitRequest = { appends: [runAppend("run-B", 2, { ...ownership, ownerId: "worker-2" })] };
    await expect(store.commit(wrongOwner)).rejects.toBeInstanceOf(StaleRunOwnerError);
    expect((await store.readStream("run-run-B"))).toHaveLength(1);

    // Events carrying an enrolled runId are fenced even when the credential names another run.
    const smuggled: CommitRequest = { appends: [{ ...runAppend("run-C", 1, { runId: "run-C", ownerId: "worker-1", generation: 1 }), events: [runEvent("run-B", 2)] }] };
    await expect(store.commit(smuggled)).rejects.toBeInstanceOf(StaleRunOwnerError);
    expect((await store.readStream("run-run-B"))).toHaveLength(1);

    // Unenrolled runs keep the exact legacy write behavior.
    const legacy: CommitRequest = { appends: [runAppend("run-C", 1)] };
    expect((await store.commit(legacy)).kind).toBe("committed");

    // Presenting a credential for a run that never claimed ownership is refused.
    const neverClaimed: CommitRequest = { appends: [runAppend("run-D", 1, { runId: "run-D", ownerId: "worker-1", generation: 1 })] };
    await expect(store.commit(neverClaimed)).rejects.toBeInstanceOf(StaleRunOwnerError);
  } finally {
    await handle.close();
    await handle.dropSchema();
  }
});

test("a killed owner's late writes are fenced after another process reclaims the run", async () => {
  const schema = `cognate_own_${crypto.randomUUID().replaceAll("-", "")}`;
  // Two store handles against one schema model two OS processes sharing one database.
  const handleA = await openStore(schema);
  const handleB = await openStore(schema);
  try {
    const claimA = handleA.store.claimRunOwnership!;
    const claimB = handleB.store.claimRunOwnership!;
    const now = tick(0);
    const lease = await claimA({ runId: "run-K", ownerId: "process-A", now, leaseMs: 1_000 });
    const ownershipA = { runId: "run-K", ownerId: "process-A", generation: lease.generation };

    // The owner records its started step.
    const started: CommitRequest = { appends: [runAppend("run-K", 1, ownershipA)] };
    expect((await handleA.store.commit(started)).kind).toBe("committed");

    // The owner dies. After lease expiry, a second process reclaims with a fresh generation.
    const late = tick(10_000);
    const recovered = await claimB({ runId: "run-K", ownerId: "process-B", now: late, leaseMs: 10_000 });
    expect(recovered.generation).toBeGreaterThan(lease.generation);
    const ownershipB = { runId: "run-K", ownerId: "process-B", generation: recovered.generation };

    // The recovered process writes its outcome.
    const outcome: CommitRequest = { appends: [runAppend("run-K", 2, ownershipB)] };
    expect((await handleA.store.commit(outcome)).kind).toBe("committed");

    // The killed owner's late write — its next append after a long external effect — is refused,
    // and the run stream holds only the two authoritative events.
    const lateWrite: CommitRequest = { appends: [runAppend("run-K", 3, ownershipA)] };
    await expect(handleA.store.commit(lateWrite)).rejects.toBeInstanceOf(StaleRunOwnerError);
    // The stale owner's stream version also cannot advance through the recovered stream.
    expect((await handleA.store.readStream("run-run-K"))).toHaveLength(2);
    // The recovered owner's subsequent writes still commit.
    const followUp: CommitRequest = { appends: [{ ...runAppend("run-K", 3, ownershipB), expectedVersion: 2 }] };
    expect((await handleB.store.commit(followUp)).kind).toBe("committed");
    expect((await handleB.store.readStream("run-run-K"))).toHaveLength(3);
  } finally {
    await handleA.close();
    await handleB.close();
    await handleA.dropSchema();
  }
});
