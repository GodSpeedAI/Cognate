// CG-CLT-001 (spec §25.1, §31.8): headless client over the runtime service; reconnect from cursor; frontend capabilities.
import { afterEach, describe, expect, test } from "bun:test";
import type { Json, StoredEvent } from "@godspeedai/cognate-events";
import { type AgentDefinition, type Caller, invokeFrontend, type RuntimeService } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime, type Runtime } from "@godspeedai/cognate-runtime-bun";
import { createClient, type CognateClient, type RunState } from "../src/index.ts";

const agents: AgentDefinition[] = [
  {
    id: "agent.chat",
    version: "1.0.0",
    async run(input, ctx) {
      for (const word of ["Looking ", "into ", "it"]) await ctx.emit("message.delta", { text: word });
      await ctx.emit("state.changed", { snapshot: { order: { id: "o-1", status: "open" } } });
      await ctx.emit("state.changed", { patch: [{ op: "replace", path: "/order/status", value: "refunding" }] });
      const approval = (await ctx.waitFor("approve", { type: "refund-approval", condition: { kind: "human_approval" }, payload: input })) as { approved: boolean };
      const focus = await invokeFrontend(ctx, "focus", "map.focus", { lat: 51.5, lng: -0.12 });
      const artifactId = await ctx.artifact({ name: "note.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("done") });
      const readBack = await ctx.state("readBack");
      return { approved: approval.approved, focus, artifactId, readBack };
    },
  },
  {
    id: "agent.waitsForCallerState",
    version: "1.0.0",
    async run(_input, ctx) {
      await ctx.waitFor("go", { type: "state-check", condition: {}, payload: {} });
      return { seen: await ctx.state("seen") };
    },
  },
  {
    id: "agent.threadStateWriter",
    version: "1.0.0",
    async run(_input, ctx) {
      return await ctx.updateSharedState("write", { snapshot: { source: "agent" } });
    },
  },
];

/** Wraps a service so the event stream can be severed on demand, simulating network loss. */
function flaky(service: RuntimeService) {
  const sever = new Set<AbortController>();
  const wrapped: RuntimeService = {
    ...service,
    events(caller: Caller, request) {
      const local = new AbortController();
      sever.add(local);
      const signal = request.signal ? AbortSignal.any([request.signal, local.signal]) : local.signal;
      const inner = service.events(caller, { ...request, signal });
      return (async function* () {
        try {
          for await (const e of inner) {
            if (local.signal.aborted) throw new Error("network lost");
            yield e;
          }
          if (local.signal.aborted) throw new Error("network lost");
        } finally {
          sever.delete(local);
        }
      })();
    },
  };
  return { service: wrapped, cut: () => { for (const c of sever) c.abort(); } };
}

const until = async <T>(read: () => T, ok: (v: T) => boolean, what: string, ms = 5000) => {
  const start = Date.now();
  while (!ok(read())) {
    if (Date.now() - start > ms) throw new Error(`timed out: ${what} (last ${JSON.stringify(read())})`);
    await Bun.sleep(10);
  }
  return read();
};

describe("headless client (§25.1)", () => {
  let runtime: Runtime;
  let client: CognateClient;
  afterEach(async () => {
    await client?.close();
    await runtime?.close();
  });
  const setup = async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const f = flaky(runtime.service);
    client = createClient({ service: f.service, caller: alice, reconnect: { baseMs: 10, maxMs: 50 } });
    return f;
  };

  test("run state is derived from events: streamed text, shared state patches, open continuations", async () => {
    await setup();
    const { runId } = await client.startRun("agent.chat", { amount: 3 });
    const state = client.run(runId);
    const waiting = await until(() => state.get(), (s) => s.status === "waiting", "waiting");
    expect(waiting.text).toBe("Looking into it");
    expect(waiting.state).toEqual({ order: { id: "o-1", status: "refunding" } });
    expect(waiting.openContinuations.map((c) => c.type)).toEqual(["refund-approval"]);
  });

  test("client.updateState writes shared state a waiting agent reads via ctx.state, and the client observes the write", async () => {
    await setup();
    const { runId } = await client.startRun("agent.waitsForCallerState", null);
    const state = client.run(runId);
    await until(() => state.get(), (s) => s.openContinuations.length === 1, "waiting for go");
    const updated = await client.updateState(runId, { snapshot: { flag: true } });
    expect(updated).toEqual({ state: { flag: true }, version: 1 });
    await until(() => state.get(), (s) => (s.state as { flag?: boolean } | null)?.flag === true, "client observes caller state write");
    await client.resolveContinuation(state.get().openContinuations[0]!.id, "resume");
    const done = await until(() => state.get(), (s) => s.status === "completed", "completed");
    expect(done.output).toEqual({ seen: { flag: true } });
  });

  test("thread shared state observes caller and agent writes and hydrates a new client from the canonical snapshot", async () => {
    await setup();
    const threadId = "thread-shared-client";
    const shared = client.threadSharedState(threadId);
    const callerWrite = await client.updateThreadSharedState(threadId, { snapshot: { source: "caller" } }, { expectedVersion: 0 });
    expect(callerWrite).toEqual({ state: { source: "caller" }, version: 1 });
    await until(() => shared.get(), (value) => value.version === 1, "caller thread state event");

    const run = await client.startRun("agent.threadStateWriter", null, { correlationId: threadId });
    await until(() => shared.get(), (value) => value.version === 2 && (value.state as { source?: string }).source === "agent", "agent thread state event");
    expect((await runtime.service.getRun(alice, { runId: run.runId })).runId).toBe(run.runId);

    const reloaded = createClient({ service: runtime.service, caller: alice, reconnect: { baseMs: 10, maxMs: 50 } });
    try {
      const reloadedState = reloaded.threadSharedState(threadId);
      await until(() => reloadedState.get(), (value) => value.version === 2, "canonical thread state after reload");
      expect(reloadedState.get().state).toEqual({ source: "agent" });
    } finally {
      await reloaded.close();
    }
  });

  test("thread state catches durable updates made while the client event stream reconnects", async () => {
    const f = await setup();
    const threadId = "thread-shared-reconnect";
    const shared = client.threadSharedState(threadId);
    const statuses: string[] = [];
    client.status.subscribe((status) => statuses.push(status));
    await until(() => client.status.get(), (status) => status === "live", "client live");
    f.cut();
    await until(() => statuses, (seen) => seen.includes("reconnecting"), "client reconnecting");
    await runtime.service.updateSharedState(alice, { threadId, update: { snapshot: { afterReconnect: true } }, idempotencyKey: "thread-reconnect" });
    await until(() => shared.get(), (value) => value.version === 1, "replayed thread update");
    expect(shared.get().state).toEqual({ afterReconnect: true });
  });

  test("frontend capabilities are served by the client and the run resumes; unregistered ones stay open", async () => {
    await setup();
    const { runId } = await client.startRun("agent.chat", { amount: 1 });
    const state = client.run(runId);
    const [approval] = (await until(() => state.get(), (s) => s.openContinuations.length === 1, "approval")).openContinuations;
    await client.resolveContinuation(approval!.id, "resume", { approved: true });
    await until(() => state.get(), (s) => s.openContinuations.some((c) => c.type === "frontend:map.focus"), "frontend continuation");
    await Bun.sleep(50);
    expect(state.get().status).toBe("waiting");
    const seen: Json[] = [];
    const stop = client.provideCapability("map.focus", (input) => (seen.push(input), { centered: true }));
    const done = await until(() => state.get(), (s) => s.status === "completed", "completed");
    stop();
    expect(seen).toEqual([{ lat: 51.5, lng: -0.12 }]);
    expect(done.output).toMatchObject({ approved: true, focus: { centered: true } });
    expect(done.artifacts).toHaveLength(1);
    expect(new TextDecoder().decode((await client.artifact(done.artifacts[0]!)).bytes)).toBe("done");
  });

  test("a mounted remote offer renews its lease and close revokes it", async () => {
    await setup();
    const stop = await client.offerCapability({
      leaseId: "editor-mounted", agent: "agent.chat", contract: { id: "editor.focus", version: "1.0.0" },
      description: "Focus an open editor", inputSchema: { type: "object" }, ttlMs: 20,
    }, () => ({ focused: true }));
    const first = (await runtime.service.listRemoteOffers(alice, { agent: "agent.chat" }))[0]!;
    await Bun.sleep(70);
    const renewed = (await runtime.service.listRemoteOffers(alice, { agent: "agent.chat" }))[0]!;
    expect(renewed.id).toBe(first.id);
    expect(renewed.expiresAt).toBeGreaterThan(first.expiresAt);
    await stop();
    expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.chat" })).toEqual([]);
    await client.offerCapability({
      leaseId: "editor-remounted", agent: "agent.chat", contract: { id: "editor.focus", version: "1.0.0" },
      description: "Focus an open editor", inputSchema: { type: "object" }, ttlMs: 20,
    }, () => ({ focused: true }));
    await client.close();
    expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.chat" })).toEqual([]);
  });

  test("subscriptions resume from the last position after a network cut, without gaps or duplicates", async () => {
    const f = await setup();
    const seen: StoredEvent[] = [];
    const statuses: string[] = [];
    client.status.subscribe((s) => statuses.push(s));
    client.subscribe({}, (e) => seen.push(e));
    const { runId } = await client.startRun("agent.chat", { amount: 2 });
    await until(() => seen.length, (n) => n >= 3, "first events");
    f.cut();
    await until(() => statuses, (s) => s.includes("reconnecting"), "reconnecting status");
    const [c] = await runtime.service.listContinuations(alice, { runId });
    await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: { approved: false }, idempotencyKey: "x" });
    await until(() => seen.map((e) => e.eventType), (types) => types.includes("run.waiting") && types.filter((t) => t === "run.waiting").length >= 2, "second wait after reconnect");
    const positions = seen.map((e) => e.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const all = (await Array.fromAsync(runtime.service.events(alice, {}))).map((e) => e.position);
    expect(positions).toEqual(all.slice(0, positions.length));
    expect(statuses.at(-1)).toBe("live");
  });

  test("the client has no React dependency", async () => {
    const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
    expect(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })).not.toContain("react");
  });

  test("RunState exposes only derived data", async () => {
    await setup();
    const { runId } = await client.startRun("agent.chat", { amount: 9 });
    const s: RunState = await until(() => client.run(runId).get(), (v) => v.position > 0, "position");
    expect(Object.keys(s).sort()).toEqual(["artifacts", "error", "openContinuations", "output", "position", "runId", "state", "status", "text"]);
  });

  test("projection store refresh() re-reads without a new event (a fold can land after the event-triggered read)", async () => {
    // A store refresh is scheduled per delivered event, but the runtime's projection fold can
    // complete just after that read — and a run that then waits commits no further events. The
    // public refresh() lets a consumer re-read once durable state changes without waiting for a
    // stream event that may never come.
    let rows: { key: string; value: Json }[] = [];
    let checkpoint: { position: number; status: "ok" | "error" } | null = null;
    const stub = {
      readProjection: () => Promise.resolve({ rows, checkpoint }),
      events: (_caller: unknown, request: { signal?: AbortSignal }) => (async function* () {
        const signal = request?.signal;
        if (signal?.aborted) return;
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      })(),
    } as unknown as RuntimeService;
    const probe = createClient({ service: stub, caller: alice });
    const store = probe.projection("p");
    await until(() => store.get(), (v) => v !== undefined, "initial read");
    expect(store.get()).toEqual([]);
    rows = [{ key: "run/1", value: { renders: 1 } }];
    store.refresh();
    await until(() => store.get(), (v) => (v?.length ?? 0) === 1, "refreshed row");
    expect(store.get()).toEqual([{ key: "run/1", value: { renders: 1 } }]);
    await probe.close();
  });
});
