// WP-15 / AT-05 (runtime part): every consequential event of a case run carries the godspeed.interaction_event v1
// extension, valid against the vendored CEP schema; non-case runs are unchanged; source.record_id is stable
// across redelivery.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { DurableStore, StoredEvent } from "@godspeedai/cognate-events";
import { createExecutionWorldRegistry, localExecutionWorld, programExecutorComponent, sha256Hex } from "@godspeedai/cognate-execution";
import type { Component } from "@godspeedai/cognate-kernel-api";
import type { AgentDefinition, CaseContext, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { declarationKey, interactionEventFor, interactionOutboxFor, ObservationDelivery, OBSERVATION_TOPIC, uuidV5, type DeliveryReceipt, type Observation, type ObservationPort } from "../src/index.ts";

const SCHEMA_PATH = join(import.meta.dir, "..", "schemas", "godspeed.interaction_event.v1.json");
// Vendored from the CEP integration worktree (schemas/extensions/godspeed.interaction_event.v1.json). A change must be a deliberate re-vendor.
const SCHEMA_SHA256 = "edc73a14eb665bd1300dbf61245511b7cc180805cfc848ffc8478035d52fbbc2";
const schemaText = readFileSync(SCHEMA_PATH, "utf8");
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(JSON.parse(schemaText));
const check = (value: unknown): string[] => (validate(value) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`));

const REQUIRED = ["world_ref", "semantic_ref", "declaration_key", "actor", "operation", "resource", "context", "correlation", "authority", "outcome", "source", "executor_provenance", "kind"];
const WORLD = `world:fde-sop@sha256:${"a".repeat(64)}`;
const EPISODE = `episode:case-1:item-2:1@sha256:${"b".repeat(64)}`;
const evaluated: CaseContext = { worldRef: WORLD, semanticRef: "fde-sop.work::Task", caseId: "case-1", planItemId: "item-2", role: "executor", kind: "evaluated", episodeRef: EPISODE, assignmentId: "assign:case-1:item-2:1:1", expectationRefs: ["question:q1"] };
const exploratory: CaseContext = { worldRef: WORLD, semanticRef: "fde-sop.work::Task", caseId: "case-1", planItemId: "item-2", role: "executor", kind: "exploratory" };
const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "t" };

let dir: string;
let runtime: Runtime | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cognate-ie-"));
});
afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const PATCH = "--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n";
const pingContract = { id: "tool.ping", version: "1.0.0", semanticRef: { namespace: "fde-sop.tools", id: "Ping", source: { uri: "x", digest: "d" }, projectionVersion: "1" } };
const ping: Component = { id: "ping", provides: [pingContract], activate: (f) => f.provide(pingContract, () => ({ pong: true })) };
const agents: AgentDefinition[] = [
  { id: "agent.ping", version: "1", run: async (_i, ctx) => { await ctx.invoke("tool.ping", {}); return { done: true }; } },
  { id: "agent.program", version: "1", run: async (_i, ctx) => ctx.invoke("program.run", { worldId: "w", workspace: dir, patch: PATCH, patchSha256: sha256Hex(PATCH), argv: ["cat", "f.txt"] }) },
  { id: "agent.fails", version: "1", run: async () => { throw new Error("boom"); } },
];

async function start(caseContext: CaseContext | undefined, withObservation = true) {
  const store = createMemoryStore();
  await Bun.write(join(dir, "f.txt"), "old\n");
  const registry = createExecutionWorldRegistry([localExecutionWorld({ worldId: "w" })]);
  runtime = await createRuntime({
    store: { store },
    agents,
    components: [ping, programExecutorComponent(registry)],
    policy: { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    ...(withObservation ? { outboxFor: (e) => interactionOutboxFor(e as never) } : {}),
  });
  return { store, run: async (agent: string, key: string) => {
    const v = await runtime!.service.startRun(alice, { agent, input: {}, idempotencyKey: key, ...(caseContext ? { caseContext } : {}) });
    for (let i = 0; i < 200; i++) {
      const view = await runtime!.service.getRun(alice, { runId: v.runId });
      if (view.status === "completed" || view.status === "failed") return view;
      await Bun.sleep(25);
    }
    throw new Error("run did not finish");
  } };
}
const observations = async (store: DurableStore) => (await store.listOutbox({ topic: OBSERVATION_TOPIC })).map((i) => ({ id: i.id, observation: i.payload as unknown as Observation }));

describe("godspeed.interaction_event v1 vendoring", () => {
  test("the vendored schema is the pinned one", () => {
    expect(createHash("sha256").update(schemaText).digest("hex")).toBe(SCHEMA_SHA256);
  });
  test("declaration_key is UUIDv5 of namespace::name under the DomainForge ConceptId namespace", () => {
    expect(uuidV5("www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2"); // python uuid.uuid5(NAMESPACE_DNS, ...) reference value
    expect(declarationKey("godspeed-fde-sop.evidence::Settlement")).toBe("concept:11fc582b-b054-5386-b245-5a358e3c9327"); // CEP fixture value
  });
});

describe("case runs emit the extension on every consequential event", () => {
  test("evaluated run: every observation validates, carries all required fields, and has an anchored source record", async () => {
    const { store, run } = await start(evaluated);
    await run("agent.ping", "k1");
    await run("agent.program", "k2");
    await run("agent.fails", "k3");
    const rows = await observations(store);
    expect(rows.length).toBeGreaterThanOrEqual(5); // 2 invocations + 3 terminal events
    const events = await runtime!.service.events(alice, {});
    const ids = new Set<string>();
    for await (const e of events as AsyncIterable<StoredEvent>) ids.add(e.eventId);
    for (const { observation } of rows) {
      const ext = observation.interactionEvent as Record<string, any>;
      expect(check(ext)).toEqual([]);
      for (const key of REQUIRED) expect(ext[key]).toBeDefined();
      expect(ext.emitter).toBeUndefined(); // unsigned in S1, never faked
      expect(ext.source.record_id).toBe(observation.eventId);
      expect(ids.has(ext.source.record_id)).toBe(true); // resolves to a record in the owning system
      expect(typeof ext.correlation).toBe("object");
      expect(ext.correlation).toMatchObject({ case_id: "case-1", episode_ref: EPISODE, assignment_id: "assign:case-1:item-2:1:1" });
      expect(ext.correlation.run_id).toBe(observation.runId);
      expect(ext.world_ref).toBe(WORLD);
      expect(ext.authority.decision_id).toBeDefined();
    }
    const sequences = rows.map((r) => (r.observation.interactionEvent as any).source.sequence);
    expect(sequences.every((s) => Number.isInteger(s) && s >= 1)).toBe(true);
    const ping1 = rows.find((r) => (r.observation.interactionEvent as any).operation === "tool.ping")!.observation.interactionEvent as any;
    expect(ping1).toMatchObject({ semantic_ref: "fde-sop.tools::Ping", outcome: { status: "succeeded" }, executor_provenance: "live", actor: { principal: "alice", role: "executor" } });
    const program = rows.find((r) => (r.observation.interactionEvent as any).operation === "program.run")!.observation.interactionEvent as any;
    expect(program.executor_provenance).toBe("program");
    const failed = rows.find((r) => (r.observation.interactionEvent as any).operation === "run.failed")!.observation.interactionEvent as any;
    expect(failed.outcome.status).toBe("failed");
  });

  test("exploratory run validates without a frozen reference", async () => {
    const { store, run } = await start(exploratory);
    await run("agent.ping", "k1");
    const rows = await observations(store);
    expect(rows.length).toBe(2);
    for (const { observation } of rows) {
      expect(check(observation.interactionEvent)).toEqual([]);
      expect((observation.interactionEvent as any).context.episode_ref).toBeUndefined();
    }
  });

  test("program.run records patch hash, command, exit code and output digest in the invocation event", async () => {
    const { run } = await start(evaluated);
    const view = await run("agent.program", "k2");
    expect(view.status).toBe("completed");
    const events = [] as StoredEvent[];
    for await (const e of runtime!.service.events(alice, { runId: view.runId })) events.push(e);
    const inv = events.find((e) => e.eventType === "run.invocation")!;
    expect(inv.payload).toMatchObject({ result: { patchSha256: sha256Hex(PATCH), command: ["cat", "f.txt"], exitCode: 0 } });
    expect((inv.payload as any).result.outputDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an invalid case context is refused at start", async () => {
    const { run } = await start({ ...evaluated, episodeRef: undefined } as CaseContext);
    await expect(run("agent.ping", "k1")).rejects.toThrow(/episodeRef/);
  });
});

describe("non-case runs are unchanged", () => {
  test("no case context: no interaction event, and the hook adds no outbox intent", async () => {
    const { store, run } = await start(undefined);
    await run("agent.ping", "k1");
    expect(await observations(store)).toEqual([]);
    const events = [] as StoredEvent[];
    for await (const e of runtime!.service.events(alice, {})) events.push(e);
    for (const e of events) {
      expect((e.metadata as any)?.caseContext).toBeUndefined();
      expect(interactionEventFor({ ...(e as any), metadata: e.metadata } as never)).toBeUndefined();
    }
  });
});

describe("authority and redelivery", () => {
  const base = { eventId: "e1", eventType: "run.invocation", runId: "r1", causationId: "e0", occurredAt: "2026-11-13T10:00:00.000Z", recordedAt: "2026-11-13T10:00:00.000Z", streamSequence: 3, tenant: "t", correlationId: "c", scopeId: "s", componentId: "x", fiberId: "f" };
  const caseCtx = { ...exploratory, principal: "alice" };

  test("a governed invocation carries the SEA-Forge decision id and the extension rides the execution_trace", () => {
    const e = { ...base, metadata: { capability: "tool.ping", ok: true, decision: { authority: { operationId: "op-1", decisionEnvelopeId: "env-authority_decision-op-1", worldRef: WORLD } }, caseContext: caseCtx } };
    const [intent] = interactionOutboxFor(e as never);
    const o = intent!.payload as unknown as Observation;
    expect((o.interactionEvent as any).authority.decision_id).toBe("env-authority_decision-op-1");
    expect((o.trace as any).extensions["godspeed.interaction_event"]).toEqual(o.interactionEvent);
    expect(check(o.interactionEvent)).toEqual([]);
  });

  test("an invocation with no recorded decision says unknown, never not_required", () => {
    const ext = interactionEventFor({ ...base, metadata: { capability: "tool.ping", ok: true, caseContext: caseCtx } } as never) as any;
    expect(ext.authority.decision_id).toBe("unknown");
    expect(check(ext)).toEqual([]);
  });

  test("a denied invocation is outcome denied", () => {
    const ext = interactionEventFor({ ...base, metadata: { capability: "tool.ping", ok: false, failureKind: "denied", decision: { allow: false }, caseContext: caseCtx } } as never) as any;
    expect(ext.outcome.status).toBe("denied");
    expect(check(ext)).toEqual([]);
  });

  test("redelivery: the same record id and byte-identical extension on every attempt; the target counts the record once", async () => {
    const { store, run } = await start(evaluated);
    await run("agent.ping", "k1");
    const before = await observations(store);
    const seen: Observation[] = [];
    const recorded = new Map<string, Observation>();
    let calls = 0;
    const port: ObservationPort = {
      id: "t",
      async record(o): Promise<DeliveryReceipt> {
        seen.push(o);
        const rid = (o.interactionEvent as any).source.record_id as string;
        const dup = recorded.has(rid);
        recorded.set(rid, o);
        if (++calls % 2 === 1) throw new Error("transient"); // recorded, but the receipt is lost: the outbox must redeliver
        return { status: dup ? "duplicate" : "accepted", observationId: o.observationId, targetRef: rid, detail: {} };
      },
    };
    let t = 0;
    const delivery = new ObservationDelivery(store, { port, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 10 }, now: () => (t += 1000) });
    for (let i = 0; i < 6; i++) await delivery.drain();
    expect(calls).toBeGreaterThan(before.length); // there were redeliveries
    expect(recorded.size).toBe(before.length); // but no duplicate records
    const byRecord = new Map<string, string>();
    for (const o of seen) {
      const rid = (o.interactionEvent as any).source.record_id;
      const bytes = JSON.stringify(o.interactionEvent);
      expect(byRecord.get(rid) ?? bytes).toBe(bytes);
      byRecord.set(rid, bytes);
    }
    // The committed outbox itself holds one intent per event: ids are unique and match the record ids.
    const after = await observations(store);
    expect(new Set(after.map((r) => r.id)).size).toBe(after.length);
    for (const r of after) expect(r.id).toBe(`observation:${(r.observation.interactionEvent as any).source.record_id}`);
  });
});
