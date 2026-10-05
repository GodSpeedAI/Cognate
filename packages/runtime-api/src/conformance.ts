// Runtime service conformance kit (ADR-0011). Runs unchanged in-process and over every transport.
import { afterEach, describe, expect, test } from "bun:test";
import type { Json, StoredEvent } from "@cognate/events";
import type { Principal } from "@cognate/kernel-api";
import { type AgentDefinition, type Caller, type RunStatus, type RuntimeService, ServiceError } from "./types.ts";

export const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
export const mallory: Caller = { actor: { id: "mallory", kind: "user" }, tenant: "tenant-a" };
export const bob: Caller = { actor: { id: "bob", kind: "user" }, tenant: "tenant-b" };

/** Observable side-effect counters shared with test agents, to prove replay does not repeat work. */
export interface Counters {
  quotes: number;
  lookups: number;
}

export interface KitSetup {
  readonly agents: readonly AgentDefinition[];
  /** A capability `tool.lookup` v1 the runtime must mount as a component. */
  readonly lookup: (input: { key: string }) => { key: string; value: string };
  /** Policy: allow invocations by anyone except principal `mallory`; continuation and `run.state.*` actions likewise. */
  readonly deniedPrincipal: Principal["id"];
}

export interface RuntimeHandle {
  readonly service: RuntimeService;
  /** Stop and start the runtime on the same durable store (persistent runtimes only). */
  readonly restart?: () => Promise<RuntimeService>;
  close(): Promise<void>;
}

export type RuntimeFactory = (setup: KitSetup) => Promise<RuntimeHandle>;

export function kitAgents(counters: Counters): AgentDefinition[] {
  return [
    { id: "agent.echo", version: "1.0.0", run: async (input) => ({ echo: input }) },
    {
      id: "agent.approval",
      version: "1.0.0",
      async run(input, ctx): Promise<Json> {
        const { amount } = input as { amount: number };
        const quote = await ctx.step("quote", () => (counters.quotes++, { total: amount * 2 }));
        for (const chunk of ["Reviewing ", "refund ", "request"]) await ctx.emit("message.delta", { text: chunk });
        const decision = (await ctx.waitFor("approval", { type: "refund-approval", condition: { kind: "human_approval" }, payload: { amount, total: quote.total } })) as { approved: boolean };
        if (!decision.approved) return { approved: false };
        const artifactId = await ctx.artifact({ name: "refund.md", mediaType: "text/markdown", bytes: new TextEncoder().encode(`# Refund\n${quote.total}`), readers: ["alice"] });
        return { approved: true, total: quote.total, artifactId };
      },
    },
    {
      id: "agent.tooluser",
      version: "1.0.0",
      async run(input, ctx) {
        return { found: await ctx.invoke("tool.lookup", input) };
      },
    },
    {
      id: "agent.fails",
      version: "1.0.0",
      async run() {
        throw new Error("model provider exploded");
      },
    },
    {
      // D1 regression: a step whose fn itself emits must not leave the run's emit counter behind on
      // replay (spec §11, §12) — a waitFor after it forces the whole agent to re-enter from the top.
      id: "agent.replayEmits",
      version: "1.0.0",
      async run(_input, ctx): Promise<Json> {
        await ctx.step("burst", async () => {
          await ctx.emit("burst.one", { n: 1 });
          await ctx.emit("burst.two", { n: 2 });
          await ctx.emit("burst.three", { n: 3 });
          return { ok: true };
        });
        // Reached only on the replayed (post-resume) execution, so it proves the step's replay
        // advances the shared emit counter: without that, this draws an id already used inside the
        // step and is silently dropped instead of recorded (the D1 defect).
        await ctx.waitFor("gate", { type: "replay-gate", condition: {}, payload: {} });
        await ctx.emit("burst.four", { n: 4 });
        return { done: true };
      },
    },
    {
      // G1 regression: a capability handler publishing progress into the invoking run; the waitFor
      // after the invoke forces a second, replayed execution that must not repeat the handler's calls.
      id: "agent.progressUser",
      version: "1.0.0",
      async run(input, ctx): Promise<Json> {
        const result = await ctx.invoke("tool.progress", input);
        await ctx.waitFor("gate", { type: "progress-gate", condition: {}, payload: {} });
        return { result };
      },
    },
    {
      id: "agent.stateReader",
      version: "1.0.0",
      async run(_input, ctx): Promise<Json> {
        const before = await ctx.state("before");
        await ctx.waitFor("go", { type: "state-check", condition: {}, payload: {} });
        const after = await ctx.state("after");
        return { before, after };
      },
    },
    {
      id: "agent.threadStateReader",
      version: "1.0.0",
      async run(_input, ctx): Promise<Json> {
        return ctx.sharedState("thread");
      },
    },
    {
      id: "agent.threadStateWriter",
      version: "1.0.0",
      async run(_input, ctx): Promise<Json> {
        const updated = await ctx.updateSharedState("thread", { snapshot: { agent: true } });
        await ctx.waitFor("replay", { type: "thread-state-replay", condition: {}, payload: {} });
        return updated;
      },
    },
  ];
}

async function until(service: RuntimeService, caller: Caller, runId: string, status: RunStatus, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const run = await service.getRun(caller, { runId });
    if (run.status === status) return run;
    if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} is ${run.status}, expected ${status}`);
    await Bun.sleep(10);
  }
}

async function collect(iterable: AsyncIterable<StoredEvent>, limit = 10_000): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for await (const e of iterable) {
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof ServiceError ? error.code : `untyped: ${String(error)}`;
  }
}

export function runtimeServiceConformance(name: string, factory: RuntimeFactory, options: { readonly persistent: boolean }): void {
  describe(`${name}: runtime service conformance`, () => {
    const handles: RuntimeHandle[] = [];
    let counters: Counters;
    afterEach(async () => {
      for (const handle of handles.splice(0)) await handle.close();
    });
    const open = async () => {
      counters = { quotes: 0, lookups: 0 };
      const handle = await factory({ agents: kitAgents(counters), lookup: ({ key }) => (counters.lookups++, { key, value: key.toUpperCase() }), deniedPrincipal: "mallory" });
      handles.push(handle);
      return handle;
    };

    test("a run completes with output and a durable lifecycle in its event stream", async () => {
      const { service } = await open();
      const started = await service.startRun(alice, { agent: "agent.echo", input: { hi: 1 }, idempotencyKey: "s1", correlationId: "corr-echo" });
      const done = await until(service, alice, started.runId, "completed");
      expect(done).toMatchObject({ agent: "agent.echo", tenant: "tenant-a", output: { echo: { hi: 1 } }, error: null, correlationId: "corr-echo", startedBy: "alice", waitingOn: [] });
      const types = (await collect(service.events(alice, { runId: started.runId }))).map((e) => e.eventType);
      expect(types[0]).toBe("run.started");
      expect(types.at(-1)).toBe("run.completed");
    });

    test("starting a run is idempotent by key", async () => {
      const { service } = await open();
      const a = await service.startRun(alice, { agent: "agent.echo", input: {}, idempotencyKey: "same" });
      const b = await service.startRun(alice, { agent: "agent.echo", input: {}, idempotencyKey: "same" });
      expect(b.runId).toBe(a.runId);
    });

    test("a run suspends on a continuation, resumes after resolution, and never repeats recorded steps", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.approval", input: { amount: 21 }, idempotencyKey: "r1" });
      const waiting = await until(service, alice, runId, "waiting");
      expect(waiting.waitingOn).toHaveLength(1);
      const [continuation] = await service.listContinuations(alice, { runId, status: "OPEN" });
      expect(continuation).toMatchObject({ type: "refund-approval", status: "OPEN", payload: { amount: 21, total: 42 }, condition: { kind: "human_approval" } });
      const resolved = await service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: { approved: true }, idempotencyKey: "approve-1", expectedVersion: continuation!.version });
      expect(resolved.outcome).toBe("transitioned");
      const done = await until(service, alice, runId, "completed");
      expect(done.output).toMatchObject({ approved: true, total: 42 });
      expect(counters.quotes).toBe(1);
      const events = await collect(service.events(alice, { runId }));
      expect(events.filter((e) => e.eventType === "message.delta").map((e) => (e.payload as { text: string }).text).join("")).toBe("Reviewing refund request");
      const artifact = await service.getArtifact(alice, { artifactId: (done.output as { artifactId: string }).artifactId });
      expect(new TextDecoder().decode(artifact.bytes)).toBe("# Refund\n42");
      expect(await service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: { approved: true }, idempotencyKey: "approve-1" })).toMatchObject({ outcome: "duplicate" });
    });

    test("a step's internal emits survive replay: no collision, no drop, correct order (D1)", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.replayEmits", input: null, idempotencyKey: "d1" });
      await until(service, alice, runId, "waiting");
      const [c] = await service.listContinuations(alice, { runId, status: "OPEN" });
      await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: {}, idempotencyKey: "d1-go" });
      expect((await until(service, alice, runId, "completed")).output).toEqual({ done: true });
      const events = await collect(service.events(alice, { runId }));
      const emitted = events.filter((e) => e.eventType.startsWith("burst."));
      expect(emitted.map((e) => e.eventType)).toEqual(["burst.one", "burst.two", "burst.three", "burst.four"]);
      expect(emitted.map((e) => e.payload)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
    });

    test("a handler's progress calls are durable, ordered, and never repeated on replay (G1)", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.progressUser", input: { key: "p" }, idempotencyKey: "g1" });
      await until(service, alice, runId, "waiting");
      const [c] = await service.listContinuations(alice, { runId, status: "OPEN" });
      await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: {}, idempotencyKey: "g1-go" });
      await until(service, alice, runId, "completed");
      const events = await collect(service.events(alice, { runId }));
      const progressEvents = events.filter((e) => e.eventType === "run.invocation.progress");
      expect(progressEvents).toHaveLength(3);
      expect(progressEvents.map((e) => e.metadata?.seq)).toEqual([0, 1, 2]);
      expect(progressEvents.map((e) => e.payload)).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
      expect(progressEvents.every((e) => e.metadata?.stepId === "invoke:1")).toBe(true);
      const invocationIndex = events.findIndex((e) => e.eventType === "run.invocation");
      expect(progressEvents.every((e) => e.position < events[invocationIndex]!.position)).toBe(true);
    });

    test("a rejected continuation ends the run on the agent's own terms", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.approval", input: { amount: 1 }, idempotencyKey: "r2" });
      await until(service, alice, runId, "waiting");
      const [c] = await service.listContinuations(alice, { runId });
      await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: { approved: false }, idempotencyKey: "no" });
      expect((await until(service, alice, runId, "completed")).output).toEqual({ approved: false });
    });

    test("cancelling a waiting run cancels its open continuation", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.approval", input: { amount: 3 }, idempotencyKey: "r3" });
      await until(service, alice, runId, "waiting");
      const cancelled = await service.cancelRun(alice, { runId, reason: "customer withdrew", idempotencyKey: "cx" });
      expect(cancelled.status).toBe("cancelled");
      expect((await service.listContinuations(alice, { runId }))[0]!.status).toBe("CANCELLED");
    });

    test("an agent failure is a failed run with its error recorded", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.fails", input: null, idempotencyKey: "f" });
      expect(await until(service, alice, runId, "failed")).toMatchObject({ error: "model provider exploded" });
    });

    test("agents invoke capabilities through kernel policy; results are recorded", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.tooluser", input: { key: "abc" }, idempotencyKey: "t1" });
      expect((await until(service, alice, runId, "completed")).output).toEqual({ found: { key: "abc", value: "ABC" } });
      const denied = await service.startRun(mallory, { agent: "agent.tooluser", input: { key: "x" }, idempotencyKey: "t2" });
      expect((await until(service, mallory, denied.runId, "failed")).error).toContain("denied");
    });

    test("direct invocation is authorized per caller and typed on failure", async () => {
      const { service } = await open();
      expect(await service.invoke(alice, { capability: "tool.lookup", input: { key: "q" } })).toEqual({ key: "q", value: "Q" });
      expect(await code(service.invoke(mallory, { capability: "tool.lookup", input: { key: "q" } }))).toBe("permission_denied");
      expect(await code(service.invoke(alice, { capability: "tool.absent", input: null }))).toBe("unavailable");
    });

    test("tenants are isolated: runs, events, continuations, and artifacts", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.approval", input: { amount: 5 }, idempotencyKey: "iso" });
      await until(service, alice, runId, "waiting");
      expect(await code(service.getRun(bob, { runId }))).toBe("not_found");
      expect(await service.listContinuations(bob, {})).toEqual([]);
      const [c] = await service.listContinuations(alice, { runId });
      expect(await code(service.resolveContinuation(bob, { continuationId: c!.id, action: "resume", input: { approved: true }, idempotencyKey: "steal" }))).toBe("not_found");
      expect(await collect(service.events(bob, {}))).toEqual([]);
      expect(await code(service.resolveContinuation(mallory, { continuationId: c!.id, action: "resume", input: { approved: true }, idempotencyKey: "m" }))).toBe("permission_denied");
    });

    test("the event stream resumes from a known position without gaps or duplicates", async () => {
      const { service } = await open();
      for (let i = 0; i < 3; i++) await until(service, alice, (await service.startRun(alice, { agent: "agent.echo", input: i, idempotencyKey: `e${i}` })).runId, "completed");
      const all = await collect(service.events(alice, {}));
      const cut = all[Math.floor(all.length / 2)]!.position;
      const resumed = await collect(service.events(alice, { afterPosition: cut }));
      expect(resumed.map((e) => e.eventId)).toEqual(all.filter((e) => e.position > cut).map((e) => e.eventId));
    });

    test("a following stream delivers new commits live and stops on abort", async () => {
      const { service } = await open();
      const controller = new AbortController();
      const seen: string[] = [];
      const reader = (async () => {
        for await (const e of service.events(alice, { follow: true, signal: controller.signal })) {
          seen.push(e.eventType);
          if (e.eventType === "run.completed") controller.abort();
        }
      })();
      await Bun.sleep(20);
      await service.startRun(alice, { agent: "agent.echo", input: "live", idempotencyKey: "live" });
      await Promise.race([reader, Bun.sleep(5000).then(() => { throw new Error("stream did not deliver"); })]);
      expect(seen).toContain("run.started");
      expect(seen).toContain("run.completed");
    });

    test("a caller updates a waiting run's state and the agent reads it after resume", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st1" });
      await until(service, alice, runId, "waiting");
      const updated = await service.updateState(alice, { runId, update: { snapshot: { count: 1 } }, idempotencyKey: "u1" });
      expect(updated).toEqual({ state: { count: 1 }, version: 1 });
      const [c] = await service.listContinuations(alice, { runId, status: "OPEN" });
      await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: {}, idempotencyKey: "go1" });
      const done = await until(service, alice, runId, "completed");
      expect(done.output).toEqual({ before: {}, after: { count: 1 } });
    });

    test("startRun seeds shared state that the agent reads via ctx.state", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st2", state: { seeded: true } });
      await until(service, alice, runId, "waiting");
      const [c] = await service.listContinuations(alice, { runId, status: "OPEN" });
      await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: {}, idempotencyKey: "go2" });
      const done = await until(service, alice, runId, "completed");
      expect(done.output).toEqual({ before: { seeded: true }, after: { seeded: true } });
    });

    test("updateState is idempotent by key", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st3" });
      await until(service, alice, runId, "waiting");
      const a = await service.updateState(alice, { runId, update: { snapshot: { n: 1 } }, idempotencyKey: "same-u" });
      const b = await service.updateState(alice, { runId, update: { snapshot: { n: 1 } }, idempotencyKey: "same-u" });
      expect(b).toEqual(a);
    });

    test("updateState enforces expectedVersion", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st4" });
      await until(service, alice, runId, "waiting");
      await service.updateState(alice, { runId, update: { snapshot: { n: 1 } }, idempotencyKey: "u4a" });
      expect(await code(service.updateState(alice, { runId, update: { snapshot: { n: 2 } }, idempotencyKey: "u4b", expectedVersion: 0 }))).toBe("failed_precondition");
      const ok = await service.updateState(alice, { runId, update: { snapshot: { n: 2 } }, idempotencyKey: "u4c", expectedVersion: 1 });
      expect(ok).toEqual({ state: { n: 2 }, version: 2 });
    });

    test("updateState rejects a patch that does not apply", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st5" });
      await until(service, alice, runId, "waiting");
      expect(await code(service.updateState(alice, { runId, update: { patch: [{ op: "replace", path: "/missing", value: 1 }] }, idempotencyKey: "u5" }))).toBe("invalid_argument");
    });

    test("updateState rejects a terminal run", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.echo", input: {}, idempotencyKey: "st6" });
      await until(service, alice, runId, "completed");
      expect(await code(service.updateState(alice, { runId, update: { snapshot: {} }, idempotencyKey: "u6" }))).toBe("failed_precondition");
    });

    test("updateState is tenant-isolated", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st7" });
      await until(service, alice, runId, "waiting");
      expect(await code(service.updateState(bob, { runId, update: { snapshot: {} }, idempotencyKey: "u7" }))).toBe("not_found");
    });

    test("updateState is authorized: mallory is denied", async () => {
      const { service } = await open();
      const { runId } = await service.startRun(alice, { agent: "agent.stateReader", input: null, idempotencyKey: "st8" });
      await until(service, alice, runId, "waiting");
      expect(await code(service.updateState(mallory, { runId, update: { snapshot: {} }, idempotencyKey: "u8" }))).toBe("permission_denied");
    });

    test("thread shared state survives completed runs, is CAS guarded and tenant-isolated", async () => {
      const { service } = await open();
      const threadId = "thread-shared-state";
      const first = await service.startRun(alice, { agent: "agent.threadStateReader", input: null, idempotencyKey: "thread-1", correlationId: threadId });
      expect((await until(service, alice, first.runId, "completed")).output).toEqual({});

      const changed = await service.updateSharedState(alice, { threadId, update: { snapshot: { edited: true } }, idempotencyKey: "thread-edit", expectedVersion: 0 });
      expect(changed).toEqual({ state: { edited: true }, version: 1 });
      expect(await service.updateSharedState(alice, { threadId, update: { snapshot: { edited: true } }, idempotencyKey: "thread-edit", expectedVersion: 0 })).toEqual(changed);
      expect(await code(service.updateSharedState(alice, { threadId, update: { snapshot: { edited: false } }, idempotencyKey: "thread-stale", expectedVersion: 0 }))).toBe("failed_precondition");
      expect(await code(service.readSharedState(mallory, { threadId }))).toBe("permission_denied");
      expect(await service.readSharedState(bob, { threadId })).toEqual({ state: {}, version: 0 });
      await service.updateSharedState(alice, { threadId: "other-thread", update: { snapshot: { separate: true } }, idempotencyKey: "thread-other" });

      const second = await service.startRun(alice, { agent: "agent.threadStateReader", input: null, idempotencyKey: "thread-2", correlationId: threadId });
      expect((await until(service, alice, second.runId, "completed")).output).toEqual({ edited: true });

      const [event] = (await collect(service.events(alice, {}))).filter((candidate) => candidate.eventType === "state.changed" && candidate.metadata?.threadId === threadId && candidate.metadata?.source === "caller");
      expect(event).toMatchObject({ correlationId: threadId, runId: null, metadata: { threadId, source: "caller" } });
      expect((await collect(service.events(alice, { correlationId: threadId }))).every((candidate) => candidate.correlationId === threadId)).toBe(true);
    });

    test("agent thread shared-state writes are replay-safe and durable", async () => {
      const { service } = await open();
      const threadId = "thread-agent-replay";
      const { runId } = await service.startRun(alice, { agent: "agent.threadStateWriter", input: null, idempotencyKey: "thread-agent", correlationId: threadId });
      await until(service, alice, runId, "waiting");
      const [continuation] = await service.listContinuations(alice, { runId, status: "OPEN" });
      await service.resolveContinuation(alice, { continuationId: continuation!.id, action: "resume", input: {}, idempotencyKey: "thread-agent-go" });
      expect((await until(service, alice, runId, "completed")).output).toEqual({ state: { agent: true }, version: 1 });
      expect(await service.readSharedState(alice, { threadId })).toEqual({ state: { agent: true }, version: 1 });
      const events = await collect(service.events(alice, {}));
      const changes = events.filter((event) => event.eventType === "state.changed" && event.metadata?.threadId === threadId);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ correlationId: threadId, runId, metadata: { threadId, source: "agent" } });
    });

    test("listRuns returns the caller's tenant runs oldest-first, filterable by correlationId and agent", async () => {
      const { service } = await open();
      const a = await service.startRun(alice, { agent: "agent.echo", input: 1, idempotencyKey: "l1", correlationId: "corr-x" });
      await until(service, alice, a.runId, "completed");
      const b = await service.startRun(alice, { agent: "agent.tooluser", input: { key: "k" }, idempotencyKey: "l2", correlationId: "corr-x" });
      await until(service, alice, b.runId, "completed");
      const c = await service.startRun(alice, { agent: "agent.echo", input: 2, idempotencyKey: "l3", correlationId: "corr-y" });
      await until(service, alice, c.runId, "completed");
      const all = await service.listRuns(alice, {});
      expect(all.map((r) => r.runId)).toEqual([a.runId, b.runId, c.runId]);
      expect((await service.listRuns(alice, { correlationId: "corr-x" })).map((r) => r.runId)).toEqual([a.runId, b.runId]);
      expect((await service.listRuns(alice, { agent: "agent.echo" })).map((r) => r.runId)).toEqual([a.runId, c.runId]);
      expect(await service.listRuns(bob, {})).toEqual([]);
    });

    test("50 concurrent startRun calls all succeed and listRuns returns them in start order", async () => {
      const { service } = await open();
      const correlationId = "corr-concurrent";
      const started = await Promise.all(
        Array.from({ length: 50 }, (_, i) => service.startRun(alice, { agent: "agent.echo", input: i, idempotencyKey: `concurrent-${i}`, correlationId })),
      );
      const positions = new Map<string, number>();
      for (const event of await collect(service.events(alice, {}))) {
        if (event.eventType === "run.started" && event.runId) positions.set(event.runId, event.position);
      }
      const expectedOrder = [...new Set(started.map((r) => r.runId))].sort((a, b) => positions.get(a)! - positions.get(b)!);
      const listed = await service.listRuns(alice, { correlationId });
      expect(listed.map((r) => r.runId)).toEqual(expectedOrder);
      expect(listed).toHaveLength(50);
    });

    test("unknown agents and unknown runs are typed errors", async () => {
      const { service } = await open();
      expect(await code(service.startRun(alice, { agent: "agent.nope", input: null, idempotencyKey: "n" }))).toBe("not_found");
      expect(await code(service.getRun(alice, { runId: "missing" }))).toBe("not_found");
      expect(await code(service.readProjection(alice, { name: "no-such-projection" }))).toBe("not_found");
    });

    if (options.persistent) {
      test("a waiting run survives a runtime restart and completes after resolution", async () => {
        const handle = await open();
        const { runId } = await handle.service.startRun(alice, { agent: "agent.approval", input: { amount: 50 }, idempotencyKey: "restart" });
        await until(handle.service, alice, runId, "waiting");
        const service = await handle.restart!();
        const [c] = await service.listContinuations(alice, { runId, status: "OPEN" });
        await service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: { approved: true }, idempotencyKey: "after-restart" });
        expect((await until(service, alice, runId, "completed")).output).toMatchObject({ approved: true, total: 100 });
        expect(counters.quotes).toBe(1);
      });
    }
  });
}
