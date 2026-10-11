// Commit-order and causal integrity under concurrency (DEBT-011, mission §1.3): PostgreSQL sequence
// allocation is not commit order, so the store allocates positions under a counter-row lock held to
// commit. These tests prove the invariants that single-process conformance cannot: interleaved
// multi-stream transactions, aborted allocations leaving no gaps, and idempotency races.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { afterEach, expect, test } from "bun:test";
import postgres from "postgres";
import { ConcurrencyError, IdempotencyMismatchError, RecordConflictError } from "@godspeedai/cognate-events";
import type { DurableStore, NewEvent } from "@godspeedai/cognate-events";
import { openPostgresStore, type PostgresStoreHandle } from "../src/index.ts";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const handles: PostgresStoreHandle[] = [];
let counter = 0;
async function open(): Promise<{ store: DurableStore; schema: string }> {
  const schema = `cognate_order_${Date.now().toString(36)}_${counter++}`;
  const handle = await openPostgresStore({ url, schema, pollMs: 0 });
  handles.push(handle);
  return { store: handle.store, schema };
}
afterEach(async () => {
  for (const handle of handles.splice(0)) {
    await handle.close();
    await handle.dropSchema();
  }
});

function event(n: number, overrides: Partial<NewEvent> = {}): NewEvent {
  return { eventType: `w.${n}`, schemaVersion: 1, occurredAt: "2026-10-09T12:00:00.000Z", tenant: "tenant-a", correlationId: "corr-1", causationId: null, runId: null, scopeId: "root", payload: { n }, ...overrides };
}

test("concurrent multi-event commits: positions are unique, dense, and contiguous per decision", async () => {
  const { store } = await open();
  const writers = 16;
  const perCommit = 5;
  const outcomes = await Promise.all(
    Array.from({ length: writers }, (_, w) => store.commit({ idempotency: { scope: "w", key: `k${w}`, fingerprint: `f${w}` }, appends: [{ streamId: `s${w}`, expectedVersion: 0, events: Array.from({ length: perCommit }, (_, i) => event(w * perCommit + i)) }] })),
  );
  expect(outcomes.every((o) => o.kind === "committed")).toBe(true);

  const all = await store.readAll();
  expect(all).toHaveLength(writers * perCommit);
  // Dense: with no aborts, positions must be exactly 1..N.
  expect(all.map((e) => e.position)).toEqual(Array.from({ length: writers * perCommit }, (_, i) => i + 1));
  // One decision's events occupy one contiguous position block, so a stream's causally ordered
  // events are never interleaved with another decision's events.
  const blocks = new Map<string, number[]>();
  for (const e of all) blocks.set(e.streamId, [...(blocks.get(e.streamId) ?? []), e.position]);
  for (const [, positions] of blocks) {
    expect(positions).toEqual(Array.from({ length: perCommit }, (_, i) => positions[0]! + i));
  }
});

test("a transaction that aborts after allocating positions leaves no gap", async () => {
  const { store } = await open();
  await store.commit({ appends: [{ streamId: "a", expectedVersion: 0, events: [event(1)] }] });
  // The loser allocates event positions, then dies on the record CAS: the conditional upsert aborts
  // the whole transaction after the event inserts, like a mid-decision failure.
  const loser = store.commit({
    appends: [{ streamId: "b", expectedVersion: 0, events: [event(2), event(3)] }],
    records: [{ collection: "r", id: "x", expectedVersion: 7, value: { v: 1 } }],
  });
  const winner = store.commit({ appends: [], records: [{ collection: "r", id: "x", expectedVersion: 0, value: { v: 0 } }] });
  const results = await Promise.allSettled([loser, winner]);
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(RecordConflictError) });

  // Nothing from the aborted decision is visible, and the next commit reuses its positions densely.
  expect((await store.readStream("b")).length).toBe(0);
  const next = await store.commit({ appends: [{ streamId: "c", expectedVersion: 0, events: [event(4)] }] });
  expect(next.kind).toBe("committed");
  const all = await store.readAll();
  expect(all.map((e) => e.position)).toEqual([1, 2]);
  expect(all[1]!.eventType).toBe("w.4");
});

test("concurrent same-stream writers: exactly one wins per version, sequences stay gap-free", async () => {
  const { store } = await open();
  const rounds = 5;
  for (let round = 0; round < rounds; round++) {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => store.commit({ appends: [{ streamId: "hot", expectedVersion: round, events: [event(round * 10 + i)] }] })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof ConcurrencyError)).toBe(true);
  }
  const stream = await store.readStream("hot");
  expect(stream.map((e) => e.streamSequence)).toEqual([1, 2, 3, 4, 5]);
});

test("a multi-stream atomic commit fails and writes nothing when one stream is stale", async () => {
  const { store } = await open();
  await store.commit({ appends: [{ streamId: "s1", expectedVersion: 0, events: [event(1)] }] });
  const error = await store
    .commit({
      appends: [
        { streamId: "s2", expectedVersion: 0, events: [event(2)] },
        { streamId: "s1", expectedVersion: 0, events: [event(3)] }, // stale: s1 is at version 1
      ],
    })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConcurrencyError);
  expect(await store.streamVersion("s2")).toBe(0);
  expect((await store.readAll()).map((e) => e.position)).toEqual([1]);
});

test("idempotency races across concurrent writers: one commit, the rest replay or mismatch", async () => {
  const { store } = await open();
  const attempts = 10;
  const results = await Promise.allSettled(
    Array.from({ length: attempts }, (_, i) =>
      store.commit({
        idempotency: { scope: "race", key: "k", fingerprint: i % 3 === 0 ? "same" : `other-${i}` },
        appends: [{ streamId: "idem", expectedVersion: 0, events: [event(i)] }],
        result: { from: i },
      }),
    ),
  );
  const committed = results.filter((r) => r.status === "fulfilled" && r.value.kind === "committed");
  const duplicates = results.filter((r) => r.status === "fulfilled" && r.value.kind === "duplicate");
  const mismatches = results.filter((r) => r.status === "rejected" && r.reason instanceof IdempotencyMismatchError);
  expect(committed).toHaveLength(1);
  expect(duplicates.length + mismatches.length).toBe(attempts - 1);
  // Duplicates all replay the winner's recorded result, never their own request's.
  for (const duplicate of duplicates) {
    expect((duplicate as PromiseFulfilledResult<{ result: unknown }>).value.result).toEqual((committed[0] as PromiseFulfilledResult<{ result: unknown }>).value.result);
  }
  expect((await store.readStream("idem")).length).toBe(1);
});

test("a hard connection drop mid-transaction rolls back cleanly and the store continues densely", async () => {
  const { store, schema } = await open();
  const crasher = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Simulate a crashed writer at SQL level: allocate a position, insert an event, then vanish
    // without committing. PostgreSQL rolls the transaction back when the backend connection drops.
    await crasher.unsafe("BEGIN");
    await crasher.unsafe(`INSERT INTO ${schema}.streams (stream_id, version) VALUES ('ghost', 1)`);
    await crasher.unsafe(`UPDATE ${schema}.store_meta SET next_position = next_position + 1 WHERE id = 'positions'`);
    await crasher.unsafe(`INSERT INTO ${schema}.events (position, event_id, stream_id, stream_sequence, event_type, schema_version, occurred_at, recorded_at, tenant, correlation_id, causation_id, run_id, scope_id)
      VALUES (1, 'ghost', 'ghost', 1, 'ghost.event', 1, '2026-10-09T12:00:00.000Z', '2026-10-09T12:00:00.000Z', 'tenant-a', 'corr-1', NULL, NULL, 'root')`);
    // Hard-drop the connection with the transaction still open — the client never commits.
  } finally {
    await crasher.end({ timeout: 0 });
  }

  const next = await store.commit({ appends: [{ streamId: "c", expectedVersion: 0, events: [event(1)] }] });
  expect(next.kind).toBe("committed");
  const all = await store.readAll();
  expect(all.map((e) => [e.position, e.eventType])).toEqual([[1, "w.1"]]);
});
