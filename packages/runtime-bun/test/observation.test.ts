// First-class observation ingestion (RuntimeService.observe). A fact noticed about reality is
// recorded as a run-less `observation.recorded` event with observation provenance — distinct from an
// action/run (intent) and from a caller state edit (mutation) — with truthful attribution: causation
// is cited only when established and never invented. World-scoped identity: (worldId, resource).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredEvent } from "@cognate/events";
import type { AgentDefinition, Caller, RuntimeService } from "@cognate/runtime-api";
import { type ActionPolicy, createRuntime } from "../src/index.ts";

const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const mallory: Caller = { actor: { id: "mallory", kind: "user" }, tenant: "tenant-a" };
const bob: Caller = { actor: { id: "bob", kind: "user" }, tenant: "tenant-b" };

const policy = { authorize: () => ({ allow: true, policyId: "test", reason: "allowed" }) };
// Authority: everyone may record observations except mallory (so we can prove the gate exists).
const actions: ActionPolicy = {
  authorize({ caller, action }) {
    if (action === "observation.record" && caller.actor.id === "mallory") return { allow: false, reason: "mallory may not record observations" };
    return { allow: true, reason: "allowed" };
  },
};

async function collect(iterable: AsyncIterable<StoredEvent>, limit = 1000): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for await (const event of iterable) {
    out.push(event);
    if (out.length >= limit) break;
  }
  return out;
}

async function withRuntime<T>(fn: (service: RuntimeService) => Promise<T>): Promise<T> {
  const runtime = await createRuntime({ store: ":memory:", agents: [], policy, actions });
  try {
    return await fn(runtime.service);
  } finally {
    await runtime.close();
  }
}

const observedAt = "2026-01-01T00:00:00Z";

describe("observation ingestion (RuntimeService.observe)", () => {
  test("records a fact as a run-less event with observation provenance and evidence", async () => {
    await withRuntime(async (service) => {
      const view = await service.observe(alice, {
        kind: "port.available",
        subject: { worldId: "local", resource: "port/5173", kind: "port" },
        facts: { port: 5173, protocol: "tcp" },
        source: { observer: "ports-observer", provider: "local", method: "ss" },
        evidence: { how: "ss -H -ltnp" },
        attribution: { kind: "unattributed", confidence: "observed" },
        observedAt,
        idempotencyKey: "record-1",
      });
      expect(view.observationId.startsWith("obs_")).toBe(true);
      const events = await collect(service.events(alice, {}));
      const obs = events.find((e) => e.eventId === view.eventId);
      expect(obs).toBeDefined();
      expect(obs!.eventType).toBe("observation.recorded");
      expect(obs!.runId).toBeNull();
      expect(obs!.causationId).toBeNull();
      const meta = obs!.metadata as Record<string, unknown>;
      expect(meta.source).toBe("observation");
      expect(meta.worldId).toBe("local");
      expect(meta.observer).toBe("ports-observer");
      const payload = obs!.payload as Record<string, any>;
      expect(payload.facts.port).toBe(5173);
      expect(payload.evidence.how).toBe("ss -H -ltnp");
    });
  });

  test("observations persist across a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cognate-obs-"));
    const path = join(dir, "app.sqlite");
    const make = () => createRuntime({ store: path, agents: [], policy, actions });
    let runtime = await make();
    const view = await runtime.service.observe(alice, {
      kind: "file.present",
      subject: { worldId: "local", resource: "a.txt" },
      facts: { present: true },
      source: { observer: "fs" },
      observedAt,
      idempotencyKey: "persist-1",
    });
    await runtime.close();
    runtime = await make();
    const events = await collect(runtime.service.events(alice, {}));
    expect(events.some((e) => e.eventId === view.eventId)).toBe(true);
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("a replay returns the recorded observation without a second event", async () => {
    await withRuntime(async (service) => {
      const input = {
        kind: "process.exited",
        subject: { worldId: "local", resource: "process/123" },
        facts: { exitCode: 0 },
        source: { observer: "proc" },
        observedAt,
        idempotencyKey: "idem-1",
      } as const;
      const a = await service.observe(alice, input);
      const b = await service.observe(alice, input);
      expect(b.observationId).toBe(a.observationId);
      expect(b.eventId).toBe(a.eventId);
      const events = await collect(service.events(alice, {}));
      expect(events.filter((e) => e.eventId === a.eventId).length).toBe(1);
    });
  });

  test("reusing a key for a different fact is an error (idempotency mismatch)", async () => {
    await withRuntime(async (service) => {
      await service.observe(alice, {
        kind: "file.present", subject: { worldId: "local", resource: "a.txt" }, facts: { present: true },
        source: { observer: "fs" }, observedAt, idempotencyKey: "idem-2",
      });
      await expect(
        service.observe(alice, {
          kind: "file.present", subject: { worldId: "local", resource: "a.txt" }, facts: { present: false },
          source: { observer: "fs" }, observedAt, idempotencyKey: "idem-2",
        }),
      ).rejects.toThrow(/already|different request/i);
    });
  });

  test("recording is authorized per caller", async () => {
    await withRuntime(async (service) => {
      await expect(
        service.observe(mallory, {
          kind: "file.present", subject: { worldId: "local", resource: "a.txt" }, facts: { present: true },
          source: { observer: "fs" }, observedAt, idempotencyKey: "auth-1",
        }),
      ).rejects.toThrow(/may not record/i);
    });
  });

  test("unknown causation is truthful: observed true, causedBy unknown", async () => {
    await withRuntime(async (service) => {
      const view = await service.observe(alice, {
        kind: "file.exists",
        subject: { worldId: "local", resource: "semantic-world-proof.txt" },
        facts: { present: true },
        source: { observer: "fs-observer", method: "stat" },
        attribution: { kind: "correlated", correlationId: "session:j6", confidence: "unknown" },
        observedAt,
        idempotencyKey: "unknown-1",
      });
      expect(view.attribution.causationEventId).toBeNull();
      expect(view.attribution.confidence).toBe("unknown");
      expect(view.attribution.correlationId).toBe("session:j6");
      const events = await collect(service.events(alice, {}));
      const obs = events.find((e) => e.eventId === view.eventId)!;
      expect(obs.causationId).toBeNull();
      expect(obs.correlationId).toBe("session:j6");
      expect((obs.payload as any).facts.present).toBe(true);
      expect((obs.payload as any).attribution.kind).toBe("correlated");
    });
  });

  test("correlation does not force causation; causation is cited only when established", async () => {
    await withRuntime(async (service) => {
      const correlated = await service.observe(alice, {
        kind: "file.created", subject: { worldId: "local", resource: "b.txt" }, facts: { present: true },
        source: { observer: "fs" }, attribution: { kind: "correlated", correlationId: "exec-1", confidence: "observed" },
        observedAt, idempotencyKey: "corr-1",
      });
      expect(correlated.attribution.correlationId).toBe("exec-1");
      expect(correlated.attribution.causationEventId).toBeNull();

      const caused = await service.observe(alice, {
        kind: "file.created", subject: { worldId: "local", resource: "c.txt" }, facts: { present: true },
        source: { observer: "fs" }, attribution: { kind: "caused", correlationId: "exec-1", causationEventId: "evt-123", confidence: "observed" },
        observedAt, idempotencyKey: "corr-2",
      });
      expect(caused.attribution.causationEventId).toBe("evt-123");

      const events = await collect(service.events(alice, {}));
      expect(events.find((e) => e.eventId === correlated.eventId)!.causationId).toBeNull();
      expect(events.find((e) => e.eventId === caused.eventId)!.causationId).toBe("evt-123");
    });
  });

  test("equal resource strings in different worlds are distinct observations", async () => {
    await withRuntime(async (service) => {
      const local = await service.observe(alice, {
        kind: "file.created", subject: { worldId: "local", resource: "semantic-world-proof.txt" }, facts: { present: true },
        source: { observer: "fs", provider: "local" }, observedAt, idempotencyKey: "world-1",
      });
      const remote = await service.observe(alice, {
        kind: "file.created", subject: { worldId: "ssh-test", resource: "semantic-world-proof.txt" }, facts: { present: true },
        source: { observer: "sftp", provider: "ssh" }, observedAt, idempotencyKey: "world-2",
      });
      expect(local.eventId).not.toBe(remote.eventId);
      expect(local.subject.worldId).toBe("local");
      expect(remote.subject.worldId).toBe("ssh-test");
      const events = await collect(service.events(alice, {}));
      expect((events.find((e) => e.eventId === local.eventId)!.metadata as any).worldId).toBe("local");
      expect((events.find((e) => e.eventId === remote.eventId)!.metadata as any).worldId).toBe("ssh-test");
    });
  });

  test("observations are tenant-isolated", async () => {
    await withRuntime(async (service) => {
      await service.observe(alice, {
        kind: "file.present", subject: { worldId: "local", resource: "a.txt" }, facts: { present: true },
        source: { observer: "a-observer" }, observedAt, idempotencyKey: "ten-1",
      });
      await service.observe(bob, {
        kind: "file.present", subject: { worldId: "local", resource: "a.txt" }, facts: { present: true },
        source: { observer: "b-observer" }, observedAt, idempotencyKey: "ten-2",
      });
      const a = await collect(service.events(alice, {}));
      const b = await collect(service.events(bob, {}));
      expect(a.every((e) => e.tenant === "tenant-a")).toBe(true);
      expect(b.every((e) => e.tenant === "tenant-b")).toBe(true);
      expect(a.some((e) => (e.metadata as any)?.observer === "b-observer")).toBe(false);
    });
  });

  test("observations drive normal reduction (foldable into derived state)", async () => {
    await withRuntime(async (service) => {
      await service.observe(alice, {
        kind: "file.absent", subject: { worldId: "local", resource: "f.txt" }, facts: { present: false },
        source: { observer: "fs" }, observedAt, idempotencyKey: "proj-1",
      });
      await service.observe(alice, {
        kind: "file.present", subject: { worldId: "local", resource: "f.txt" }, facts: { present: true },
        source: { observer: "fs" }, observedAt, idempotencyKey: "proj-2",
      });
      const events = await collect(service.events(alice, {}));
      const facts = events.filter((e) => e.eventType === "observation.recorded" && (e.payload as any)?.subject?.resource === "f.txt");
      const derived = facts.reduce((acc, e) => ({ present: (e.payload as any).facts.present }), { present: false });
      expect(derived.present).toBe(true);
    });
  });
});

// The action/run door cannot fabricate an observation (the honesty invariant at the event level).
const smuggleAgent: AgentDefinition = {
  id: "agent.smuggle",
  version: "1.0.0",
  async run(_input, ctx) {
    await ctx.emit("observation.recorded", { fake: true });
    return null;
  },
};

describe("observation honesty boundary", () => {
  test("a run cannot smuggle a fabricated observation through emit", async () => {
    const runtime = await createRuntime({ store: ":memory:", agents: [smuggleAgent], policy, actions });
    try {
      const run = await runtime.service.startRun(alice, { agent: "agent.smuggle", input: null, idempotencyKey: "smuggle-1" });
      let status = run.status;
      for (let i = 0; i < 100 && status === "running"; i++) {
        await new Promise((r) => setTimeout(r, 10));
        status = (await runtime.service.getRun(alice, { runId: run.runId })).status;
      }
      expect(status).toBe("failed");
      const events = await collect(runtime.service.events(alice, {}));
      expect(events.some((e) => e.eventType === "observation.recorded")).toBe(false);
    } finally {
      await runtime.close();
    }
  });
});
