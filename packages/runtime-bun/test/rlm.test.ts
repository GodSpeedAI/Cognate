// RLM component lifecycle (CognitiveOS convergence I1, design D1/D4/D5). Exercises the whole
// provider-neutral surface through the normal Invoker and the runtime's own run/continuation machinery:
// one `agent.rlm` child run per invocation, stable parent identity, and no second scheduler.
import { afterEach, describe, expect, test } from "bun:test";
import type { Json } from "@godspeedai/cognate-events";
import type { Component, Policy } from "@godspeedai/cognate-kernel-api";
import type {
  AgentDefinition,
  Caller,
  ContinuationView,
  InvocationView,
  ProviderFacts,
  RlmCancelOutput,
  RlmInspectOutput,
  RlmInvokeInput,
  RlmInvokeOutput,
  RlmInvokeRequest,
  RlmProvider,
  RlmProvidersOutput,
  RunContext,
  RunView,
} from "@godspeedai/cognate-runtime-api";
import { RLM_AGENT_ID, RLM_CAPABILITIES } from "@godspeedai/cognate-runtime-api";
import { createRlmAgent, createRlmComponent, createRlmRegistry, createRuntime, type RlmProviderRegistration, type RlmRegistry, type Runtime } from "../src/index.ts";

const alice: Caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const policy: Policy = { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) };
const actions = { authorize: () => ({ allow: true, reason: "ok" }) };
const DIGEST = `sha256:${"a".repeat(64)}`;
const INV = "inv-1";

// ── test harness ────────────────────────────────────────────────────────────────

interface Deferred {
  readonly promise: Promise<void>;
  resolve: () => void;
}
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

type ProviderMode = "complete" | "fail" | "timedOut" | "unknown";

interface ProviderOptions {
  readonly capabilities?: Partial<ProviderFacts["capabilities"]>;
  readonly toolPolicy?: ProviderFacts["toolPolicy"];
  readonly executable?: ProviderFacts["executable"];
  /** Awaited before the provider emits anything: the invocation stays "admitted". */
  readonly gateBeforeProgress?: Promise<void>;
  /** Whether the provider emits a progress event (so the invocation becomes "running"). */
  readonly progress?: boolean;
  /** Awaited before the provider records its outcome: the invocation stays "running". */
  readonly gateBeforeOutcome?: Promise<void>;
}

interface TestProvider extends RlmProvider {
  readonly spawns: number;
  readonly cancels: number;
  readonly requests: readonly RlmInvokeRequest[];
}

function testProvider(id: string, mode: ProviderMode, options: ProviderOptions = {}): TestProvider {
  const counts = { spawns: 0, cancels: 0, requests: [] as RlmInvokeRequest[] };
  const views = new Map<string, InvocationView>();
  const facts: ProviderFacts = {
    capabilities: { maxDepth: 2, contextDecomposition: true, providerInternalSubagents: false, streaming: true, isolation: "process", resultDelivery: "return", cancellation: "process", paymentMetering: "reported", ...options.capabilities },
    toolPolicy: options.toolPolicy ?? "contained",
    executable: options.executable === undefined ? { version: "1.0.0", sha256: "b".repeat(64) } : options.executable,
  };
  const view = (status: InvocationView["status"]): InvocationView => ({ status, evidence: [`run:${status}`], payment: { currency: "time", spent: status === "completed" ? 3 : "unknown", basis: "provider-reported" }, isolation: facts.capabilities.isolation, lastEventAt: new Date().toISOString() });
  const wait = (gate: Promise<void> | undefined, ctx: RunContext): Promise<void> =>
    gate === undefined
      ? Promise.resolve()
      : Promise.race([
          gate,
          new Promise<void>((resolve) => {
            if (ctx.signal.aborted) return resolve();
            ctx.signal.addEventListener("abort", () => resolve(), { once: true });
          }),
        ]);
  const provider: RlmProvider = {
    id,
    probe: async () => facts,
    async invoke(req: RlmInvokeRequest, _spawn, ctx: RunContext): Promise<{ readonly runId: string }> {
      counts.spawns += 1;
      counts.requests.push(req);
      if (options.progress) {
        await wait(options.gateBeforeProgress, ctx);
        if (ctx.signal.aborted) throw new Error("cancelled");
        await ctx.emit("rlm.progress", { pct: 50 });
      } else {
        await wait(options.gateBeforeProgress, ctx);
      }
      await wait(options.gateBeforeOutcome, ctx);
      if (ctx.signal.aborted) throw new Error("cancelled");
      if (mode === "fail") {
        views.set(ctx.runId, view("failed"));
        throw new Error("provider failed the investigation");
      }
      views.set(ctx.runId, view(mode === "complete" ? "completed" : mode));
      return { runId: ctx.runId };
    },
    async inspect(runId: string): Promise<InvocationView> {
      return views.get(runId) ?? [...views.values()].at(-1) ?? view("failed");
    },
    async cancel(): Promise<void> {
      counts.cancels += 1;
    },
  };
  Object.defineProperties(provider, {
    spawns: { get: () => counts.spawns, enumerable: true },
    cancels: { get: () => counts.cancels, enumerable: true },
    requests: { get: () => counts.requests, enumerable: true },
  });
  return provider as TestProvider;
}

function invokeArgs(ctx: RunContext, over: { invocationId?: string; providerId?: string; parent?: Partial<RlmInvokeInput["parent"]>; authority?: Partial<RlmInvokeInput["authority"]>; budget?: Partial<RlmInvokeInput["budget"]> } = {}): Json {
  return {
    invocationId: over.invocationId ?? INV,
    providerId: over.providerId ?? "test-provider",
    parent: { runId: ctx.runId, assignmentId: null, attempt: 0, depth: 0, maxDepth: 2, authorityTools: ["read", "edit"], ...over.parent },
    task: { purpose: "decompose the investigation", acceptance: ["a verifiable result"], contextRefs: ["ctx/1"], contextDigest: DIGEST },
    authority: { tools: ["read"], mode: "read-only", ...over.authority },
    budget: { currency: "time", limit: "unknown", ...over.budget },
  } as unknown as Json;
}

const parentAgent = (body: (ctx: RunContext, input: Json) => Promise<unknown>): AgentDefinition => ({ id: "agent.parent", version: "1.0.0", run: async (input, ctx) => (await body(ctx, input)) as Json });

/** A parent that records a refusal instead of failing, so the assertion can read the typed code. */
const refusingParent = (call: (ctx: RunContext) => Promise<Json>): AgentDefinition =>
  parentAgent(async (ctx) => {
    try {
      await call(ctx);
      return { refusal: null };
    } catch (error) {
      return { refusal: (error as Error).message };
    }
  });

describe("RLM component (I1)", () => {
  let runtime: Runtime | undefined;
  let rtRef: Runtime | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    rtRef = undefined;
  });

  async function open(registrations: readonly RlmProviderRegistration[], parent: AgentDefinition, admission?: { governance: "on" | "off"; posture: "contained" | "uncontained-local" }): Promise<Runtime> {
    const registry: RlmRegistry = createRlmRegistry();
    for (const registration of registrations) registry.register(registration);
    const component: Component = createRlmComponent({
      registry,
      getService: () => {
        if (!rtRef) throw new Error("runtime not ready");
        return rtRef.service;
      },
      ...(admission ? { admission } : {}),
    });
    const agent = createRlmAgent({ registry });
    const rt = await createRuntime({ store: ":memory:", policy, actions, agents: [parent, agent], components: [component] });
    runtime = rt;
    rtRef = rt;
    return rt;
  }

  async function until(rt: Runtime, runId: string, status: RunView["status"], ms = 5_000): Promise<RunView> {
    const deadline = Date.now() + ms;
    for (;;) {
      const view = await rt.service.getRun(alice, { runId });
      if (view.status === status) return view;
      if ((view.status === "failed" || view.status === "cancelled") && view.status !== status) throw new Error(`run ${runId} ${view.status}: ${view.error ?? ""}`);
      if (Date.now() > deadline) throw new Error(`run ${runId} did not reach ${status} (last ${view.status})`);
      await Bun.sleep(5);
    }
  }

  async function continuation(rt: Runtime, runId: string, type: string, ms = 5_000): Promise<ContinuationView> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = (await rt.service.listContinuations(alice, { runId, status: "OPEN" })).find((c) => c.type === type);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`run ${runId} did not open a ${type} continuation`);
      await Bun.sleep(5);
    }
  }

  const inspect = (rt: Runtime, parentRunId: string, invocationId: string): Promise<RlmInspectOutput> =>
    rt.service.invoke(alice, { capability: RLM_CAPABILITIES.inspect, input: { parentRunId, invocationId } }) as unknown as Promise<RlmInspectOutput>;

  async function inspectUntil(rt: Runtime, parentRunId: string, invocationId: string, status: string, ms = 5_000): Promise<RlmInspectOutput> {
    const deadline = Date.now() + ms;
    for (;;) {
      const view = await inspect(rt, parentRunId, invocationId);
      if (view.status === status) return view;
      if (Date.now() > deadline) throw new Error(`invocation ${invocationId} did not reach ${status} (last ${view.status})`);
      await Bun.sleep(5);
    }
  }

  // ── discovery ──────────────────────────────────────────────────────────────

  test("an unconfigured registry reports absence, not a weaker provider, and ordinary runs still work", async () => {
    const rt = await open([], parentAgent(async (_ctx, input) => ({ echoed: input })));
    const providers = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.providers, input: {} })) as unknown as RlmProvidersOutput;
    expect(providers.providers).toEqual([]);
    expect(providers.admission.governance).toBe("off");
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: { hi: 1 }, idempotencyKey: "plain" });
    expect((await until(rt, run.runId, "completed")).output).toEqual({ echoed: { hi: 1 } });
  });

  test("rlm.providers reports registered providers with their capability facts, and only then", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], parentAgent(async () => ({ ok: true })));
    const providers = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.providers, input: {} })) as unknown as RlmProvidersOutput;
    expect(providers.providers.map((p) => p.id)).toEqual(["test-provider"]);
    expect(providers.providers[0]).toMatchObject({ status: "available", toolPolicy: "contained", capabilities: { isolation: "process", resultDelivery: "return", maxDepth: 2 } });
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────

  test("an invocation runs admitted -> running -> completed", async () => {
    const admittedGate = deferred();
    const runningGate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeProgress: admittedGate.promise, progress: true, gateBeforeOutcome: runningGate.promise });
    const rt = await open([{ provider, label: "gated" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { budget: { currency: "time", limit: 5, reservationRef: "resv-1" } })) })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "life" });
    const parent = await until(rt, run.runId, "completed");
    const { runId: childRunId } = (parent.output as unknown as { inv: RlmInvokeOutput }).inv;
    expect(childRunId).not.toBe(run.runId); // the parent run id is unchanged: one invocation, one child run

    expect((await inspect(rt, run.runId, INV)).status).toBe("admitted");
    admittedGate.resolve();
    expect((await inspectUntil(rt, run.runId, INV, "running")).status).toBe("running");
    runningGate.resolve();
    const completed = await inspectUntil(rt, run.runId, INV, "completed");
    expect(completed).toMatchObject({ providerId: "test-provider", isolation: "process", payment: { currency: "time", spent: 3, basis: "provider-reported" } });
    const child = await rt.service.getRun(alice, { runId: childRunId });
    expect(child.agent).toBe(RLM_AGENT_ID);
    expect(child.correlationId).toBe(`rlm:${run.runId}:${INV}`);
  });

  test("a terminal invocation is stable and cancellation is idempotent with no effect", async () => {
    const gate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: gate.promise });
    const rt = await open([{ provider, label: "held" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx)) })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "stable" });
    await until(rt, run.runId, "completed");
    expect((await inspect(rt, run.runId, INV)).status).toBe("admitted");
    gate.resolve();
    await inspectUntil(rt, run.runId, INV, "completed");
    expect((await inspect(rt, run.runId, INV)).status).toBe("completed");
    expect((await inspect(rt, run.runId, INV)).status).toBe("completed");
    const first = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "no longer needed" } })) as unknown as RlmCancelOutput;
    const second = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "again" } })) as unknown as RlmCancelOutput;
    expect(first.status).toBe("already-terminal");
    expect(second.status).toBe("already-terminal");
    expect(provider.cancels).toBe(0);
  });

  test("a running invocation is cancelled, then reported already-terminal", async () => {
    const gate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: gate.promise });
    const rt = await open([{ provider, label: "held" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx)) })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel" });
    await until(rt, run.runId, "completed");
    expect((await inspect(rt, run.runId, INV)).status).toBe("admitted");
    const cancelled = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "stop" } })) as unknown as RlmCancelOutput;
    expect(cancelled.status).toBe("cancelled");
    await inspectUntil(rt, run.runId, INV, "cancelled");
    expect((await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "again" } })) as unknown as RlmCancelOutput).toMatchObject({ status: "already-terminal" });
  });

  test("replaying a completed invocationId returns the same run id and never spawns a second child", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "once" }], parentAgent(async (ctx) => {
      const first = (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as RlmInvokeOutput;
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      const second = (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as RlmInvokeOutput;
      return { first, second };
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "replay" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await inspectUntil(rt, run.runId, INV, "completed");
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const done = await until(rt, run.runId, "completed");
    const { first, second } = done.output as unknown as { first: RlmInvokeOutput; second: RlmInvokeOutput };
    expect(second.runId).toBe(first.runId);
    expect(provider.spawns).toBe(1);
  });

  // ── refusals ───────────────────────────────────────────────────────────────

  test("a top-level rlm.invoke is refused rlm-top-level-invocation", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], parentAgent(async () => ({ ok: true })));
    await expect(rt.service.invoke(alice, { capability: RLM_CAPABILITIES.invoke, input: invokeAtRun("not-a-handler-run") })).rejects.toThrow(/rlm-top-level-invocation/);
    expect(provider.spawns).toBe(0);
  });

  test("an authority that exceeds the parent is refused, never silently narrowed", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], refusingParent(async (ctx) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { authority: { tools: ["bash"] }, parent: { authorityTools: ["read"] } }))));
    const done = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "auth" })).runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-authority-exceeds-parent/);
    expect(provider.spawns).toBe(0);
  });

  test("a child beyond maxDepth is refused rlm-depth-exceeded", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], refusingParent(async (ctx) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { parent: { depth: 1, maxDepth: 1 } }))));
    const done = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "depth" })).runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-depth-exceeded/);
    expect(provider.spawns).toBe(0);
  });

  test("a numeric budget limit without a reservationRef is refused; unknown admits and records spent unknown", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], refusingParent(async (ctx) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { budget: { currency: "money", limit: 5 } }))));
    const done = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "budget-bad" })).runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-budget-unverifiable/);
    expect(provider.spawns).toBe(0);

    const rt2 = await open([{ provider, label: "test-provider" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { budget: { currency: "money", limit: "unknown" } })) })));
    const run2 = await rt2.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "budget-unknown" });
    await until(rt2, run2.runId, "completed");
    expect((await inspectUntil(rt2, run2.runId, INV, "completed")).payment.spent).toBe("unknown");
  });

  test("a numeric limit with a reservationRef is admitted", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { budget: { currency: "money", limit: 5, reservationRef: "resv-1" } })) })));
    const parent = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "budget-ok" })).runId, "completed");
    expect((parent.output as unknown as { inv: RlmInvokeOutput }).inv.status).toBe("admitted");
    await inspectUntil(rt, parent.runId, INV, "completed");
    expect(provider.spawns).toBe(1);
  });

  test("an unknown provider is refused rlm-provider-unknown with no child run or spawn", async () => {
    const known = testProvider("test-provider", "complete");
    const rt = await open([{ provider: known, label: "test-provider" }], refusingParent(async (ctx) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { providerId: "ghost" }))));
    const done = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "unknown-provider" })).runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-provider-unknown/);
    expect(await rt.service.listRuns(alice, { correlationId: `rlm:${done.runId}:${INV}` })).toEqual([]);
    expect(known.spawns).toBe(0);
  });

  test("a listed but unavailable provider is refused rlm-provider-unavailable with no spawn", async () => {
    const known = testProvider("test-provider", "complete");
    const rt = await open([{ provider: known, label: "test-provider", availability: { status: "unavailable", reason: "executable not installed" } }], refusingParent(async (ctx) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))));
    const done = await until(rt, (await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "unavailable-provider" })).runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-provider-unavailable/);
    expect(known.spawns).toBe(0);
  });

  test("an unknown invocation is refused rlm-invocation-unknown", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "test-provider" }], parentAgent(async () => ({ ok: true })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "no-inv" });
    await until(rt, run.runId, "completed");
    await expect(inspect(rt, run.runId, "never-invoked")).rejects.toThrow(/rlm-invocation-unknown/);
  });

  // ── ambiguity ──────────────────────────────────────────────────────────────

  test("a lost effect opens the existing ambiguous-invocation continuation and refuses retry until it is resolved", async () => {
    const provider = testProvider("test-provider", "unknown");
    const rt = await open([{ provider, label: "loser" }], parentAgent(async (ctx) => {
      const first = (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as RlmInvokeOutput;
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      try {
        await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx));
        return { first, retry: "allowed" };
      } catch (error) {
        return { first, retry: (error as Error).message };
      }
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "ambiguous" });
    const probe = await continuation(rt, run.runId, "rlm-probe");

    // The invocation is unknown and the child parked on the existing ambiguous-invocation continuation.
    expect((await inspectUntil(rt, run.runId, INV, "unknown")).status).toBe("unknown");
    const child = (await rt.service.listRuns(alice, { correlationId: `rlm:${run.runId}:${INV}` }))[0]!;
    expect(child.status).toBe("waiting");
    const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");

    // Release the parent; its retry is refused while the effect is unresolved.
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const done = await until(rt, run.runId, "completed");
    expect((done.output as unknown as { retry: string }).retry).toMatch(/rlm-invocation-ambiguous/);
    expect(provider.spawns).toBe(1);
    expect((await inspect(rt, run.runId, INV)).status).toBe("unknown");

    // Resolve the ambiguity with the existing primitive; the invocation then settles.
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { reconciled: true } }, idempotencyKey: `ambiguous:${ambiguous.id}` });
    await inspectUntil(rt, run.runId, INV, "completed");
  });

  test("resuming a reconciled ambiguous invocation never invokes the provider a second time", async () => {
    const provider = testProvider("test-provider", "unknown");
    const rt = await open([{ provider, label: "loser" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "resume-once" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "unknown");
    const child = (await rt.service.listRuns(alice, { correlationId: `rlm:${run.runId}:${INV}` }))[0]!;
    const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { reconciled: true } }, idempotencyKey: "reconcile-once" });
    await until(rt, child.runId, "completed");
    expect(provider.spawns).toBe(1);
  });
});

function invokeAtRun(runId: string): Json {
  return {
    invocationId: INV,
    providerId: "test-provider",
    parent: { runId, assignmentId: null, attempt: 0, depth: 0, maxDepth: 2, authorityTools: ["read"] },
    task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST },
    authority: { tools: ["read"], mode: "read-only" },
    budget: { currency: "time", limit: "unknown" },
  } as unknown as Json;
}
