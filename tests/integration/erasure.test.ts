// CG-SEC-001 (spec §32) + DEBT-014: erasure reaches every derived copy — continuation records and
// their transition events, idempotency result snapshots, run.resumed resolution copies, recorded
// run.recall results, derived views, and the cognitive index — replay reports redacted gaps and
// never resurrects erased content, and propagation survives restarts and interruption.
import { expect, test } from "bun:test";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";
import { fingerprint, type Json } from "@godspeedai/cognate-events";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";

const intake: AgentDefinition = { id: "agent.intake", version: "1.0.0", run: async (input) => ({ summary: `patient ${(input as { name: string }).name} admitted` }) };

test("erasing a run's payloads removes content everywhere derived and keeps causal envelopes", async () => {
  const index = createMemoryIndex({ dimension: 64 });
  const runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents: [intake], cognition: { index, embedder: hashingEmbedder(64), persistent: false } });
  const { runId } = await runtime.service.startRun(alice, { agent: "agent.intake", input: { name: "Zebulon Quartz" }, idempotencyKey: "i1" });
  await runtime.idle();
  const events = await runtime.store.readStream(`run-${runId}`);
  expect(JSON.stringify(events)).toContain("Zebulon Quartz");
  expect(await index.count()).toBeGreaterThan(0);
  for (const e of events) if (JSON.stringify(e.payload).includes("Zebulon")) await runtime.erase(e.eventId, "patient-request", { id: "dpo", kind: "user" });
  await runtime.idle();
  const after = await runtime.store.readStream(`run-${runId}`);
  expect(after.map((e) => e.eventId)).toEqual(events.map((e) => e.eventId));
  expect(JSON.stringify(after)).not.toContain("Zebulon");
  expect(after.filter((e) => e.erasure).every((e) => e.erasure!.reason === "patient-request")).toBe(true);
  expect(JSON.stringify(await runtime.service.getRun(alice, { runId }))).not.toContain("Zebulon");
  const hits = await index.similar({ vector: (await hashingEmbedder(64).embed(["patient Zebulon Quartz admitted"]))[0]!, k: 5, tenant: "tenant-a" });
  for (const hit of hits) expect(JSON.stringify(await index.get(hit.id))).not.toContain("Zebulon");
  expect((await runtime.store.readStream("$erasures")).length).toBeGreaterThan(0);
  await runtime.close();
});

// The DEBT-014 adversarial scenario, on PostgreSQL-backed storage: a suspension whose continuation
// carries sensitive payload and resolution, a later run that recalls the first run's view, idempotent
// resolution replay, runtime restart, repeated erasure, and an interrupted propagation job.
const URL = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const SECRET_PHRASE = "Zebulon-Quartz-SSN-444-LEAK";
const RESOLUTION_SECRET = "approval-note-DO-NOT-RETAIN-9931";

const suspendingAgent: AgentDefinition = {
  id: "agent.suspending",
  version: "1.0.0",
  async run(input, ctx): Promise<Json> {
    const decision = (await ctx.waitFor("approval", {
      type: "leaky-approval",
      condition: { kind: "human_approval" },
      // The continuation payload copies run input content — the DEBT-014 copy site.
      payload: { about: (input as { name: string }).name, kind: "human_approval" },
    })) as { approved: boolean; note?: string };
    // The resolution input is echoed into the run output — another content path.
    return { approved: decision.approved, note: decision.note ?? null };
  },
};

const recallingAgent: AgentDefinition = {
  id: "agent.recall",
  version: "1.0.0",
  async run(_input, ctx): Promise<Json> {
    const recalled = await ctx.recall("prior", { text: "patient admission", k: 3 });
    return JSON.parse(JSON.stringify({ recalled })) as Json;
  },
};

async function completedRun(runtime: Runtime, runId: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if ((await runtime.service.getRun(alice, { runId })).status === "completed") return;
    await Bun.sleep(10);
  }
  throw new Error(`run ${runId} did not complete`);
}

test("erasure cascades to continuations, resolution copies, idempotency replays, and recorded recalls on PostgreSQL", async () => {
  const schema = `cognate_erasure_${Date.now().toString(36)}`;
  const index = createMemoryIndex({ dimension: 64 });
  const runtime = await createRuntime({
    store: { postgres: { url: URL, schema } },
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [suspendingAgent, recallingAgent],
    cognition: { index, embedder: hashingEmbedder(64), persistent: false },
  });
  const dpo = { id: "dpo", kind: "user" as const };
  try {
    // Run A: suspends with a sensitive continuation payload, is resolved with a sensitive note.
    const a = await runtime.service.startRun(alice, { agent: "agent.suspending", input: { name: SECRET_PHRASE }, idempotencyKey: "a1" });
    for (let i = 0; i < 500 && (await runtime.service.getRun(alice, { runId: a.runId })).status !== "waiting"; i++) await Bun.sleep(10);
    const [continuation] = await runtime.service.listContinuations(alice, { runId: a.runId, status: "OPEN" });
    expect(JSON.stringify(continuation)).toContain(SECRET_PHRASE);
    await runtime.service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: { approved: true, note: RESOLUTION_SECRET }, idempotencyKey: "resolve-1", expectedVersion: continuation!.version });
    await completedRun(runtime, a.runId);
    expect(JSON.stringify(await runtime.service.getRun(alice, { runId: a.runId }))).toContain(RESOLUTION_SECRET);

    // Run B: recalls A's view; the recorded run.recall copies A's input/output content.
    const b = await runtime.service.startRun(alice, { agent: "agent.recall", input: null, idempotencyKey: "b1" });
    await completedRun(runtime, b.runId);
    const bEvents = await runtime.store.readStream(`run-${b.runId}`);
    const recallEvent = bEvents.find((e) => e.eventType === "run.recall");
    expect(recallEvent).toBeDefined();
    expect(JSON.stringify(recallEvent)).toContain(`run:${a.runId}`);
    expect(JSON.stringify(recallEvent)).toContain(SECRET_PHRASE); // the copy exists before erasure

    // The resolveContinuation replay path: the continuation transition's idempotency snapshot is
    // readable at the store level (the service view never carries resolution input).
    const resumeScope = "alice:continuation.resume";
    const resumeFingerprint = fingerprint({ actor: "alice", idempotencyKey: "resolve-1", input: { approved: true, note: RESOLUTION_SECRET } });
    const storeReplayBefore = await runtime.store.commit({ idempotency: { scope: resumeScope, key: "resolve-1", fingerprint: resumeFingerprint }, appends: [] });
    expect(storeReplayBefore.kind).toBe("duplicate");
    expect(JSON.stringify(storeReplayBefore.result)).toContain(RESOLUTION_SECRET);

    // ── Erase the source events of A's view and content ──
    const aEvents = await runtime.store.readStream(`run-${a.runId}`);
    for (const e of aEvents) {
      if (["run.started", "run.completed", "run.waiting", "run.resumed"].includes(e.eventType)) {
        await runtime.erase(e.eventId, "dsar", dpo);
      }
    }

    // Continuation record redacted in place; matching metadata survives.
    const redactedContinuation = await runtime.service.listContinuations(alice, { runId: a.runId });
    expect(JSON.stringify(redactedContinuation)).not.toContain(SECRET_PHRASE);
    expect(JSON.stringify(redactedContinuation)).not.toContain(RESOLUTION_SECRET);
    expect(redactedContinuation[0]!.status).toBe("RESUMED");
    expect(redactedContinuation[0]!.type).toBe("leaky-approval");

    // The resolution replay is a tombstoned duplicate, never the recorded content — at the store
    // level (the redacted snapshot) and through the service (a duplicate outcome, redacted record).
    const storeReplayAfter = await runtime.store.commit({ idempotency: { scope: resumeScope, key: "resolve-1", fingerprint: resumeFingerprint }, appends: [] });
    expect(storeReplayAfter.kind).toBe("duplicate");
    expect(JSON.stringify(storeReplayAfter.result)).toContain("__erased");
    expect(JSON.stringify(storeReplayAfter)).not.toContain(RESOLUTION_SECRET);
    const replayAfter = await runtime.service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: { approved: true, note: RESOLUTION_SECRET }, idempotencyKey: "resolve-1" });
    expect(replayAfter.outcome).toBe("duplicate");
    expect(JSON.stringify(replayAfter)).not.toContain(RESOLUTION_SECRET);

    // B's recorded run.recall is tombstoned (replay yields a degraded redacted gap).
    const bAfter = await runtime.store.readStream(`run-${b.runId}`);
    const recallAfter = bAfter.find((e) => e.eventType === "run.recall");
    expect(recallAfter!.erasure).toBeDefined();
    expect(recallAfter!.payload).toBeNull();

    // No prohibited content remains on any live or derived surface.
    const everything = JSON.stringify(await runtime.store.readAll()) + JSON.stringify(await runtime.service.getRun(alice, { runId: a.runId }));
    expect(everything).not.toContain(SECRET_PHRASE);
    expect(everything).not.toContain(RESOLUTION_SECRET);

    // The cognitive index drops the content on rebuild (erasure tombstones drove the indexer).
    await runtime.rebuildCognition();
    const hits = await index.similar({ vector: (await hashingEmbedder(64).embed(["patient admission"]))[0]!, k: 5, tenant: "tenant-a" });
    for (const hit of hits) expect(JSON.stringify(await index.get(hit.id))).not.toContain(SECRET_PHRASE);

    // Repeated erasure is idempotent (no second tombstone wave, no failure).
    await runtime.erase(aEvents[0]!.eventId, "dsar", dpo);
    expect(JSON.stringify(await runtime.store.readAll())).not.toContain(SECRET_PHRASE);
  } finally {
    await runtime.close();
    const cleaner = await openPostgresStore({ url: URL, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 60_000);

test("erasure propagation survives a runtime restart and resumes interrupted jobs", async () => {
  const schema = `cognate_erasure_restart_${Date.now().toString(36)}`;
  const make = () =>
    createRuntime({
      store: { postgres: { url: URL, schema } },
      policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
      actions: { authorize: () => ({ allow: true, reason: "ok" }) },
      agents: [suspendingAgent],
    });
  const dpo = { id: "dpo", kind: "user" as const };
  let runtime = await make();
  try {
    const a = await runtime.service.startRun(alice, { agent: "agent.suspending", input: { name: SECRET_PHRASE }, idempotencyKey: "r1" });
    for (let i = 0; i < 500 && (await runtime.service.getRun(alice, { runId: a.runId })).status !== "waiting"; i++) await Bun.sleep(10);
    const [continuation] = await runtime.service.listContinuations(alice, { runId: a.runId, status: "OPEN" });
    await runtime.service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: { approved: false, note: RESOLUTION_SECRET }, idempotencyKey: "resolve-r1" });
    await completedRun(runtime, a.runId);

    // Fabricate an interrupted propagation: a propagating job whose target still holds content.
    const victim = (await runtime.store.readStream(`run-${a.runId}`)).find((e) => e.eventType === "run.completed")!;
    await runtime.store.commit({
      appends: [],
      records: [{ collection: "erasures", id: victim.eventId, expectedVersion: 0, value: { status: "propagating", reason: "dsar", actorId: "dpo", streamId: victim.streamId, runId: victim.runId, eventType: victim.eventType, startedAt: new Date().toISOString() } }],
    });

    // Restart: the new runtime resumes the interrupted job before anything else.
    await runtime.close();
    runtime = await make();
    await runtime.idle();

    const after = await runtime.store.readStream(`run-${a.runId}`);
    expect(JSON.stringify(after)).not.toContain(RESOLUTION_SECRET);
    expect(JSON.stringify(await runtime.service.getRun(alice, { runId: a.runId }))).not.toContain(RESOLUTION_SECRET);
    const continuationAfter = await runtime.service.listContinuations(alice, { runId: a.runId });
    expect(JSON.stringify(continuationAfter)).not.toContain(SECRET_PHRASE);
    expect(JSON.stringify(continuationAfter)).not.toContain(RESOLUTION_SECRET);
    const job = await runtime.store.getRecord("erasures", victim.eventId);
    expect(job).toMatchObject({ value: { status: "complete" } });

    // A run-less event (an observation) erases through the same path without a run cascade.
    const observation = await runtime.service.observe(alice, {
      kind: "temperature",
      subject: { worldId: "w1", resource: "room/12" },
      facts: { note: RESOLUTION_SECRET },
      source: { observer: "sensor" },
      observedAt: "2026-10-09T12:00:00.000Z",
      idempotencyKey: "obs-1",
    });
    await runtime.erase(observation.eventId, "dsar", dpo);
    expect((await runtime.store.getEvent(observation.eventId))!.payload).toBeNull();
    expect(JSON.stringify(await runtime.store.readAll())).not.toContain(RESOLUTION_SECRET);
  } finally {
    await runtime.close();
    const cleaner = await openPostgresStore({ url: URL, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
  }
}, 60_000);
