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
  RuntimeService,
} from "@godspeedai/cognate-runtime-api";
import { foldState, readInvocationBinding, RLM_AGENT_ID, RLM_CAPABILITIES, RlmProviderRefusal } from "@godspeedai/cognate-runtime-api";
import { ConcurrencyError } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createRlmAgent, createRlmComponent, createRlmRegistry, createRuntime, revokeRlmGrant, type RlmProviderRegistration, type RlmRegistry, type Runtime } from "../src/index.ts";

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

/**
 * `lost*`: the provider acted (recorded its own view) but the response never arrived, so `invoke` throws.
 * `lostCompleted|lostFailed|lostUnknown` name an invocation-tied view; `lostUntied` is a completed view that does not
 * say which invocation it belongs to; `lostNothing` recorded no view at all.
 */
/** A definite refusal carrying a bounded `code` (the verbatim message is never recorded). */
const refusal = (message: string, code: string): Error => new (RlmProviderRefusal as unknown as new (message: string, code?: string) => Error)(message, code);

type ProviderMode = "complete" | "fail" | "failThrow" | "duckRefusal" | "badCodeRefusal" | "emitThenLost" | "timedOut" | "unknown" | "lostCompleted" | "lostFailed" | "lostUnknown" | "lostUntied" | "lostNothing";

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
  /** After the first `inspect`, later ones report this status (tied to the invocation). */
  readonly laterStatus?: InvocationView["status"];
  /** The first N `cancel` calls throw. */
  readonly cancelFailures?: number;
  /** `invoke` tries to emit reserved `rlm.outcome` / `rlm.dispatch.intended` events and records what happens. */
  readonly tryReservedEmit?: boolean;
}

interface TestProvider extends RlmProvider {
  readonly spawns: number;
  readonly cancels: number;
  readonly inspects: number;
  readonly reservedEmitErrors: readonly string[];
  readonly requests: readonly RlmInvokeRequest[];
}

function testProvider(id: string, mode: ProviderMode, options: ProviderOptions = {}): TestProvider {
  const counts = { spawns: 0, cancels: 0, inspects: 0, reservedEmitErrors: [] as string[], requests: [] as RlmInvokeRequest[] };
  const views = new Map<string, InvocationView>();
  const facts: ProviderFacts = {
    capabilities: { maxDepth: 2, contextDecomposition: true, providerInternalSubagents: false, streaming: true, isolation: "process", resultDelivery: "return", cancellation: "process", paymentMetering: "reported", ...options.capabilities },
    toolPolicy: options.toolPolicy ?? "contained",
    executable: options.executable === undefined ? { version: "1.0.0", sha256: "b".repeat(64) } : options.executable,
  };
  const view = (status: InvocationView["status"], invocationId?: string): InvocationView => ({ status, ...(invocationId ? { invocationId } : {}), evidence: [`run:${status}`], payment: { currency: "time", spent: status === "completed" ? 3 : "unknown", basis: "provider-reported" }, isolation: facts.capabilities.isolation, lastEventAt: new Date().toISOString() });
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
      if (options.tryReservedEmit) {
        for (const type of ["rlm.outcome", "rlm.dispatch.intended"]) await ctx.emit(type, { forged: true }).catch((error: Error) => void counts.reservedEmitErrors.push(error.message));
        for (const id of ["rlm.outcome", "rlm.dispatch.view"]) await ctx.step(id, async () => ({ forged: true })).catch((error: Error) => void counts.reservedEmitErrors.push(error.message));
      }
      if (options.progress) {
        await wait(options.gateBeforeProgress, ctx);
        if (ctx.signal.aborted) throw new Error("cancelled");
        await ctx.emit("rlm.progress", { pct: 50 });
      } else {
        await wait(options.gateBeforeProgress, ctx);
      }
      await wait(options.gateBeforeOutcome, ctx);
      if (ctx.signal.aborted) throw new Error("cancelled");
      if (mode.startsWith("lost")) {
        if (mode === "lostCompleted") views.set(ctx.runId, view("completed", req.invocationId));
        if (mode === "lostFailed") views.set(ctx.runId, view("failed", req.invocationId));
        if (mode === "lostUnknown") views.set(ctx.runId, view("unknown", req.invocationId));
        if (mode === "lostUntied") views.set(ctx.runId, view("completed"));
        throw new Error("provider response lost");
      }
      if (mode === "fail") {
        // A definite refusal: the provider declares it did nothing. Its view names no invocation (the original fixture).
        views.set(ctx.runId, view("failed"));
        throw refusal("provider failed the investigation: token sk-live-123 rejected", "quota");
      }
      if (mode === "duckRefusal") {
        // A transport error that merely claims it is definite must NOT count as "nothing ran".
        views.set(ctx.runId, view("completed"));
        throw Object.assign(new Error("wrapped transport error"), { definite: true });
      }
      if (mode === "badCodeRefusal") {
        // Carries the refusal brand but a secret-looking code: not a valid bounded code, so not a definite refusal.
        views.set(ctx.runId, view("completed"));
        throw Object.assign(new Error("transport"), { [Symbol.for("cognate.rlm.providerRefusal")]: true, code: "sk-live-SECRET token" });
      }
      if (mode === "emitThenLost") {
        await ctx.emit("rlm.progress", { pct: 10 });
        await ctx.emit("rlm.progress", { pct: 20 });
        views.set(ctx.runId, view("completed", req.invocationId));
        throw new Error("provider response lost");
      }
      if (mode === "failThrow") {
        // An undeclared throw with a failed view tied to the invocation: a lost response that is inspected.
        views.set(ctx.runId, view("failed", req.invocationId));
        throw new Error("provider failed the investigation");
      }
      views.set(ctx.runId, view(mode === "complete" ? "completed" : (mode as "timedOut" | "unknown"), req.invocationId));
      return { runId: ctx.runId };
    },
    async inspect(runId: string): Promise<InvocationView> {
      counts.inspects += 1;
      if (options.laterStatus && counts.inspects > 1) return view(options.laterStatus, [...counts.requests].at(-1)?.invocationId);
      return views.get(runId) ?? [...views.values()].at(-1) ?? view("failed");
    },
    async cancel(): Promise<void> {
      counts.cancels += 1;
      if (counts.cancels <= (options.cancelFailures ?? 0)) throw new Error("cancel channel lost");
    },
  };
  Object.defineProperties(provider, {
    spawns: { get: () => counts.spawns, enumerable: true },
    cancels: { get: () => counts.cancels, enumerable: true },
    inspects: { get: () => counts.inspects, enumerable: true },
    reservedEmitErrors: { get: () => counts.reservedEmitErrors, enumerable: true },
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
  /** Wraps the service the component and agent see (to fail or interleave specific calls); reset after every test. */
  let wrap: ((service: RuntimeService) => RuntimeService) | undefined;
  /** When false the child agent is built without `getService`. */
  let agentSeesService = true;
  let wrapped: RuntimeService | undefined;
  /** An injected store (default `:memory:`). */
  let injectedStore: ReturnType<typeof openSqliteStore> | undefined;
  const seen = (): RuntimeService => {
    if (!rtRef) throw new Error("runtime not ready");
    if (!wrap) return rtRef.service;
    return (wrapped ??= wrap(rtRef.service));
  };

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    rtRef = undefined;
    wrap = undefined;
    wrapped = undefined;
    agentSeesService = true;
    injectedStore = undefined;
  });

  async function open(registrations: readonly RlmProviderRegistration[], parent: AgentDefinition, admission?: { governance: "on" | "off"; posture: "contained" | "uncontained-local" }): Promise<Runtime> {
    const registry: RlmRegistry = createRlmRegistry();
    for (const registration of registrations) registry.register(registration);
    const component: Component = createRlmComponent({
      registry,
      getService: seen,
      ...(admission ? { admission } : {}),
    });
    const agent = createRlmAgent({ registry, ...(agentSeesService ? { getService: seen } : {}) });
    const rt = await createRuntime({ store: injectedStore ? { store: injectedStore } : ":memory:", policy, actions, agents: [parent, agent], components: [component] });
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
      // The binding is durable before the child starts (pending-start), so the invocation is always known.
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

  test("an invocation is running once its dispatch intent is durable, then completes", async () => {
    const admittedGate = deferred();
    const runningGate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeProgress: admittedGate.promise, progress: true, gateBeforeOutcome: runningGate.promise });
    const rt = await open([{ provider, label: "gated" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { budget: { currency: "time", limit: 5, reservationRef: "resv-1" } })) })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "life" });
    const parent = await until(rt, run.runId, "completed");
    const { runId: childRunId } = (parent.output as unknown as { inv: RlmInvokeOutput }).inv;
    expect(childRunId).not.toBe(run.runId); // the parent run id is unchanged: one invocation, one child run

    await spawned(provider);
    expect((await inspect(rt, run.runId, INV)).status).toBe("running"); // dispatched, though the provider has emitted nothing yet
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
    await spawned(provider);
    expect((await inspect(rt, run.runId, INV)).status).toBe("running");
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
    const rt = await open([{ provider, label: "held" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    expect((await inspect(rt, run.runId, INV)).status).toBe("running");
    const cancelled = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "stop" } })) as unknown as RlmCancelOutput;
    expect(cancelled.status).toBe("cancelled");
    await inspectUntil(rt, run.runId, INV, "cancelled");
    expect((await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "again" } })) as unknown as RlmCancelOutput).toMatchObject({ status: "already-terminal" });
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
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

  // ── dispatch intent and recovery (SEA-Forge #113, Cognate half) ─────────────

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

  const childOf = async (rt: Runtime, parentRunId: string, invocationId = INV): Promise<RunView> => (await rt.service.listRuns(alice, { correlationId: `rlm:${parentRunId}:${invocationId}` }))[0]!;
  const eventTypes = async (rt: Runtime, runId: string): Promise<string[]> => {
    const types: string[] = [];
    for await (const event of rt.service.events(alice, { runId })) types.push(event.eventType);
    return types;
  };
  const parentState = async (rt: Runtime, runId: string): Promise<Json> => {
    const events = [];
    for await (const event of rt.service.events(alice, { runId })) events.push(event);
    return foldState(events);
  };
  const waitingParent = (extra?: (ctx: RunContext) => Promise<unknown>) =>
    parentAgent(async (ctx) => {
      const first = await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx));
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      return { first, extra: extra ? await extra(ctx) : null };
    });

  test("the dispatch intent is durable on the child run, with its identity, before the provider outcome", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "intent" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { invocationId: "inv-intent" }))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "intent" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, "inv-intent", "completed");
    const child = await childOf(rt, run.runId, "inv-intent");
    const types = await eventTypes(rt, child.runId);
    const outcomeAt = types.lastIndexOf("run.step.completed"); // the outcome is a recorded step, after the provider ran
    expect(types.indexOf("rlm.dispatch.intended")).toBeGreaterThan(-1);
    expect(types.indexOf("rlm.dispatch.intended")).toBeLessThan(outcomeAt);
    for await (const event of rt.service.events(alice, { runId: child.runId })) {
      if (event.eventType !== "rlm.dispatch.intended") continue;
      expect(event.payload).toMatchObject({ invocationId: "inv-intent", providerId: "test-provider", attempt: 1, parentRunId: run.runId });
    }
    const binding = readInvocationBinding(await parentState(rt, run.runId), "inv-intent")!;
    expect(binding.attempt).toBe(1);
    expect(binding.parentRunId).toBe(run.runId);
    expect(binding.runId).toBe(child.runId);
  });

  test("a lost response is inspected, not re-invoked: a verified result tied to the original invocation completes", async () => {
    const provider = testProvider("test-provider", "lostCompleted");
    const rt = await open([{ provider, label: "lost" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "lost-completed" });
    await until(rt, run.runId, "completed");
    const view = await inspectUntil(rt, run.runId, INV, "completed");
    expect(provider.spawns).toBe(1);
    expect(view.reconciled).toBeUndefined();
  });

  test("a lost response with a known failure closes the invocation failed, without a wait or a second invoke", async () => {
    const provider = testProvider("test-provider", "lostFailed");
    const rt = await open([{ provider, label: "lost" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "lost-failed" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "failed");
    expect(provider.spawns).toBe(1);
    expect(await rt.service.listContinuations(alice, { runId: (await childOf(rt, run.runId)).runId, status: "OPEN" })).toEqual([]);
  });

  test("a lost response with an unknown or unverifiable view parks as ambiguous; reconciliation is recorded as reconciled", async () => {
    for (const mode of ["lostUnknown", "lostUntied", "lostNothing"] as const) {
      const id = `inv-${mode}`;
      const provider = testProvider("test-provider", mode);
      const rt = await open([{ provider, label: mode }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { invocationId: id }))) as unknown as Json));
      const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: `lost-${mode}` });
      await until(rt, run.runId, "completed");
      await inspectUntil(rt, run.runId, id, "unknown");
      const child = await childOf(rt, run.runId, id);
      const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
      expect(provider.spawns).toBe(1);
      await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: `reconcile-${mode}` });
      const settled = await inspectUntil(rt, run.runId, id, "completed");
      expect(settled.reconciled).toBe(true);
      expect(settled.resultRef).toBeUndefined();
      expect(provider.spawns).toBe(1);
      await runtime?.close();
      runtime = undefined;
    }
  });

  test("an operator reconciliation that reports a failure closes the invocation failed and reconciled", async () => {
    const provider = testProvider("test-provider", "lostUnknown");
    const rt = await open([{ provider, label: "lost" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "reconcile-failure" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "unknown");
    const ambiguous = await continuation(rt, (await childOf(rt, run.runId)).runId, "ambiguous-invocation");
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { failure: { reason: "operator saw no effect" } }, idempotencyKey: "reconcile-failure-go" });
    const settled = await inspectUntil(rt, run.runId, INV, "failed");
    expect(settled.reconciled).toBe(true);
    expect(provider.spawns).toBe(1);
  });

  // ── cancellation and revocation ────────────────────────────────────────────

  test("cancelling after dispatch asks the provider to cancel the original invocation and records the outcome", async () => {
    const gate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: gate.promise });
    const rt = await open([{ provider, label: "held" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-after" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    const deadline = Date.now() + 5_000;
    while (provider.spawns === 0 && Date.now() < deadline) await Bun.sleep(5);
    const out = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "stop" } })) as unknown as RlmCancelOutput;
    expect(out).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "cancelled" });
    expect(provider.cancels).toBe(1);
    expect(provider.spawns).toBe(1);
    const binding = readInvocationBinding(await parentState(rt, run.runId), INV)!;
    expect(binding.cancellation).toMatchObject({ reason: "stop", dispatched: true, providerCancel: "cancelled" });
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a provider cancel that fails is recorded failed, not swallowed", async () => {
    const gate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: gate.promise });
    (provider as { cancel: RlmProvider["cancel"] }).cancel = async () => {
      throw new Error("cancel channel lost");
    };
    const rt = await open([{ provider, label: "held" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-fails" });
    await continuation(rt, run.runId, "rlm-probe");
    const deadline = Date.now() + 5_000;
    while (provider.spawns === 0 && Date.now() < deadline) await Bun.sleep(5);
    const out = (await rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId: run.runId, invocationId: INV, reason: "stop" } })) as unknown as RlmCancelOutput;
    expect(out).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "failed", error: "cancel channel lost" });
  });

  test("a child cancelled before it dispatches never calls the provider", async () => {
    const calls: string[] = [];
    const entry = { provider: { ...testProvider("test-provider", "complete"), invoke: async () => { calls.push("invoke"); return { runId: "x" }; } } as RlmProvider, label: "never" };
    const registry = createRlmRegistry();
    registry.register(entry);
    const agent = createRlmAgent({ registry });
    const controller = new AbortController();
    controller.abort();
    const ctx = { runId: "child", signal: controller.signal, emit: async () => {}, step: async (_id: string, fn: () => unknown) => fn() } as unknown as RunContext;
    const input = { invocationId: INV, providerId: "test-provider", runId: "parent", depth: 1, maxDepth: 2, task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST }, authority: { tools: [], mode: "read-only" }, budget: { currency: "time", limit: "unknown" } };
    await expect(agent.run(input as unknown as Json, ctx)).rejects.toThrow(/cancelled before dispatch/);
    expect(calls).toEqual([]);
  });

  test("a parent grant revoked before dispatch refuses the invocation, and a child started afterwards never dispatches", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "revoked" }], parentAgent(async (ctx) => {
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      return (await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(c)) as Promise<Json>).run({}, ctx)) as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "revoked" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await rt.service.updateState(alice, { runId: run.runId, update: { patch: [{ op: "add", path: "/rlm", value: { revoked: { [INV]: "operator withdrew the grant" } } }] }, idempotencyKey: "revoke-go" });

    // A child that re-enters after the revocation (same input shape the handler would give it) is stopped before the provider.
    const childRun = await rt.service.startRun(alice, {
      agent: RLM_AGENT_ID,
      input: { invocationId: INV, providerId: "test-provider", runId: run.runId, depth: 1, maxDepth: 2, attempt: 1, task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST }, authority: { tools: ["read"], mode: "read-only" }, budget: { currency: "time", limit: "unknown" } } as unknown as Json,
      idempotencyKey: "revoked-child",
    });
    expect((await until(rt, childRun.runId, "failed")).error).toMatch(/rlm-authority-exceeds-parent.*revoked/);

    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const done = await until(rt, run.runId, "completed");
    expect((done.output as unknown as { refusal: string }).refusal).toMatch(/rlm-authority-exceeds-parent.*revoked/);
    expect(provider.spawns).toBe(0);
  });

  test("a retry under an existing attempt identity is refused; a new invocationId waits until the prior attempt is resolved", async () => {
    const provider = testProvider("test-provider", "unknown");
    const rt = await open([{ provider, label: "attempts" }], parentAgent(async (ctx) => {
      await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx));
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      const sameId = await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, { ...(invokeArgs(c) as Record<string, Json>), attempt: 2 }) as Promise<Json>).run({}, ctx);
      const unresolved = await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, { ...(invokeArgs(c, { invocationId: "inv-2" }) as Record<string, Json>), attempt: 2 }) as Promise<Json>).run({}, ctx);
      await ctx.waitFor("probe-2", { type: "rlm-probe", condition: { kind: "rlm_probe_2" }, payload: {} });
      const fresh = (await ctx.invoke(RLM_CAPABILITIES.invoke, { ...(invokeArgs(ctx, { invocationId: "inv-2" }) as Record<string, Json>), attempt: 2 })) as unknown as RlmInvokeOutput;
      return { sameId, unresolved, fresh } as unknown as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "attempts" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await inspectUntil(rt, run.runId, INV, "unknown");
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const probe2 = await continuation(rt, run.runId, "rlm-probe");
    // The old attempt stays recorded as ambiguous until an operator reconciles it; then (and only then) a new attempt is admitted.
    expect((await inspect(rt, run.runId, INV)).status).toBe("unknown");
    expect(provider.spawns).toBe(1);
    const ambiguous = await continuation(rt, (await childOf(rt, run.runId)).runId, "ambiguous-invocation");
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: "attempts-reconcile" });
    await inspectUntil(rt, run.runId, INV, "completed");
    await rt.service.resolveContinuation(alice, { continuationId: probe2.id, action: "resume", input: {}, idempotencyKey: "probe2-go" });
    const done = await until(rt, run.runId, "completed");
    const out = done.output as unknown as { sameId: { refusal: string }; unresolved: { refusal: string }; fresh: RlmInvokeOutput };
    expect(out.sameId.refusal).toMatch(/rlm-invocation-ambiguous.*attempt 1.*new invocationId/);
    expect(out.unresolved.refusal).toMatch(/rlm-attempt-refused.*unresolved/);
    expect(out.fresh.invocationId).toBe("inv-2");
    expect(provider.spawns).toBe(2);
    const state = await parentState(rt, run.runId);
    expect(readInvocationBinding(state, "inv-2")!.attempt).toBe(2);
    expect(readInvocationBinding(state, INV)!.attempt).toBe(1);
  });

  // ── review pass 1: durability, cancellation, refusal, reconciliation ───────────

  type Hooks = { [K in keyof RuntimeService]?: (original: (...args: never[]) => unknown) => (...args: never[]) => unknown };
  const hooked = (hooks: Hooks) => (service: RuntimeService): RuntimeService =>
    new Proxy(service, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        const hook = hooks[prop as keyof RuntimeService];
        return hook ? hook(value.bind(target)) : value.bind(target);
      },
    });
  const outcomeOf = async (rt: Runtime, runId: string): Promise<Record<string, Json>> => {
    let outcome: Record<string, Json> = {};
    for await (const event of rt.service.events(alice, { runId })) {
      if (event.eventType === "rlm.outcome") outcome = event.payload as Record<string, Json>;
      const result = event.eventType === "run.step.completed" ? (event.payload as { result?: { rlmOutcome?: Record<string, Json> } } | null)?.result : undefined;
      if (result?.rlmOutcome) outcome = result.rlmOutcome;
    }
    return outcome;
  };
  const cancelCap = (rt: Runtime, parentRunId: string, reason = "stop"): Promise<RlmCancelOutput> =>
    rt.service.invoke(alice, { capability: RLM_CAPABILITIES.cancel, input: { parentRunId, invocationId: INV, reason } }) as unknown as Promise<RlmCancelOutput>;
  const spawned = async (provider: TestProvider, n = 1): Promise<void> => {
    const deadline = Date.now() + 5_000;
    while (provider.spawns < n && Date.now() < deadline) await Bun.sleep(5);
    expect(provider.spawns).toBeGreaterThanOrEqual(n);
  };
  const reinvokingParent = (retry: boolean) =>
    parentAgent(async (ctx) => {
      const first = await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(c)) as Promise<Json>).run({}, ctx);
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      const again = retry ? await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx)) : null;
      return { first, again } as unknown as Json;
    });
  const lostBindingWrite = (): { hooks: Hooks; armed: { value: boolean } } => {
    const armed = { value: true };
    return {
      armed,
      hooks: {
        updateState: (original) => async (caller: never, request: never) => {
          if (armed.value && /^rlm-mapping:inv-1:v\d+$/.test((request as { idempotencyKey: string }).idempotencyKey)) {
            armed.value = false;
            throw new Error("binding write lost");
          }
          return original(caller, request);
        },
      },
    };
  };

  test("a binding write lost after the child started leaves a pending binding: inspect and cancel still resolve the dispatched child", async () => {
    const gate = deferred();
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: gate.promise });
    wrap = hooked(lostBindingWrite().hooks);
    const rt = await open([{ provider, label: "pending" }], reinvokingParent(false));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "pending-cancel" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    const binding = readInvocationBinding(await parentState(rt, run.runId), INV)!;
    expect(binding.state).toBe("pending-start");
    expect(binding.runId).toBe("");
    // The dispatched child is found by its correlation id: inspect works and cancel reaches the provider.
    expect((await inspect(rt, run.runId, INV)).status).toBe("running");
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "cancelled" });
    expect(provider.cancels).toBe(1);
    await inspectUntil(rt, run.runId, INV, "cancelled");
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a parent that re-invokes after a lost binding write completes the pending binding without a second child", async () => {
    const provider = testProvider("test-provider", "complete");
    wrap = hooked(lostBindingWrite().hooks);
    const rt = await open([{ provider, label: "pending" }], reinvokingParent(true));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "pending-retry" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    expect(readInvocationBinding(await parentState(rt, run.runId), INV)!.state).toBe("pending-start");
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const done = await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    expect((done.output as unknown as { again: RlmInvokeOutput }).again.runId).toBe(child.runId);
    expect((await rt.service.listRuns(alice, { correlationId: `rlm:${run.runId}:${INV}` })).length).toBe(1);
    const completed = readInvocationBinding(await parentState(rt, run.runId), INV)!;
    expect(completed).toMatchObject({ state: "started", runId: child.runId });
    expect(provider.spawns).toBe(1);
  });

  test("cancelling the child before the cancel handler reads dispatch: a child blocked before its intent never dispatches", async () => {
    const provider = testProvider("test-provider", "complete");
    const gate = deferred();
    const blocked = deferred();
    let armed = false;
    let gatedOnce = false;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if ((request as { agent: string }).agent === RLM_AGENT_ID) armed = true;
        return original(caller, request);
      },
      getRun: (original) => async (caller: never, request: never) => {
        if (armed && !gatedOnce) {
          gatedOnce = true;
          blocked.resolve();
          await gate.promise; // the child is inside its pre-dispatch check
        }
        return original(caller, request);
      },
      cancelRun: (original) => async (caller: never, request: never) => {
        const result = await original(caller, request);
        gate.resolve(); // released only after the child is cancelled
        return result;
      },
    });
    const rt = await open([{ provider, label: "race" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-before-dispatch" });
    await continuation(rt, run.runId, "rlm-probe");
    await blocked.promise;
    const out = await cancelCap(rt, run.runId);
    expect(out).toMatchObject({ status: "cancelled", dispatched: false, providerCancel: "not-dispatched" });
    await Bun.sleep(100);
    expect(provider.spawns).toBe(0);
    expect(provider.cancels).toBe(0);
    expect((await childOf(rt, run.runId)).status).toBe("cancelled");
  });

  test("a dispatch that lands in the window before the cancel takes effect is seen as dispatched and cancelled at the provider", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise });
    const gate = deferred();
    let armed = false;
    let gatedOnce = false;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if ((request as { agent: string }).agent === RLM_AGENT_ID) armed = true;
        return original(caller, request);
      },
      getRun: (original) => async (caller: never, request: never) => {
        if (armed && !gatedOnce) {
          gatedOnce = true;
          await gate.promise;
        }
        return original(caller, request);
      },
      cancelRun: (original) => async (caller: never, request: never) => {
        gate.resolve(); // let the child dispatch first ...
        await spawned(provider); // ... and only then cancel it
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "race" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-after-dispatch-window" });
    await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider, 0);
    // The cancel handler reads the child's status first; make sure the child exists and is blocked in its check.
    await Bun.sleep(50);
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "cancelled" });
    expect(provider.cancels).toBe(1);
    expect(provider.spawns).toBe(1);
  });

  test("a failed provider cancel is retried by a second rlm.cancel, even though the child is already terminal", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise, cancelFailures: 1 });
    const rt = await open([{ provider, label: "retry" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-retry" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", providerCancel: "failed", error: "cancel channel lost" });
    await inspectUntil(rt, run.runId, INV, "cancelled");
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "cancelled" });
    expect(provider.cancels).toBe(2);
    expect(readInvocationBinding(await parentState(rt, run.runId), INV)!.cancellation).toMatchObject({ providerCancel: "cancelled" });
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "already-terminal" });
    expect(provider.cancels).toBe(2);
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a provider cancel is retried after a terminal parent too, where the record cannot be written", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise, cancelFailures: 1 });
    const rt = await open([{ provider, label: "retry" }], parentAgent(async (ctx) => ({ inv: await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx)) })));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-retry-terminal" });
    await until(rt, run.runId, "completed");
    await spawned(provider);
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", providerCancel: "failed" });
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", providerCancel: "cancelled" });
    expect(provider.cancels).toBe(2);
  });

  test("a cancellation record that cannot be written for a reason other than a terminal parent surfaces", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise });
    wrap = hooked({
      updateState: (original) => async (caller: never, request: never) => {
        if (/^rlm-cancel-record/.test((request as { idempotencyKey: string }).idempotencyKey)) throw new Error("boom: state store down");
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "surface" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-surface" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    await expect(cancelCap(rt, run.runId)).rejects.toThrow(/boom: state store down/);
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  // ── a provider that declares a definite refusal still fails the child; every other throw is a lost response ──

  test("a provider's definite refusal fails the child with its reason and records it in the outcome", async () => {
    const provider = testProvider("test-provider", "fail");
    const rt = await open([{ provider, label: "refuses" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "definite-refusal" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    const failed = await until(rt, child.runId, "failed");
    expect(failed.error).toBe("provider refused the invocation (quota)");
    expect((await inspect(rt, run.runId, INV)).status).toBe("failed");
    expect(((await outcomeOf(rt, child.runId)).evidence as string[])[0]).toBe("provider-refused:quota");
    // The provider's own text (it may carry secrets) is not in the child's stream.
    for await (const event of rt.service.events(alice, { runId: child.runId })) expect(JSON.stringify(event.payload)).not.toContain("sk-live");
    expect(await rt.service.listContinuations(alice, { runId: child.runId, status: "OPEN" })).toEqual([]);
    expect(provider.spawns).toBe(1);
  });

  test("an object that merely claims definite: true is not a definite refusal: its throw is a lost response", async () => {
    const provider = testProvider("test-provider", "duckRefusal");
    const rt = await open([{ provider, label: "duck" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "duck" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    await continuation(rt, child.runId, "ambiguous-invocation"); // untied view: parked, not failed
    expect(provider.spawns).toBe(1);
  });

  test("an undeclared throw is a lost response: a tied failed view closes failed and carries only the error class", async () => {
    const provider = testProvider("test-provider", "failThrow");
    const rt = await open([{ provider, label: "throws" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "undeclared-throw" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "failed");
    const evidence = (await outcomeOf(rt, (await childOf(rt, run.runId)).runId)).evidence as string[];
    expect(evidence).toContain("provider-invoke-threw:Error");
    expect(evidence.join(" ")).not.toContain("investigation");
    expect(provider.spawns).toBe(1);
  });

  // ── revocation: patches, never a whole-object rewrite ───────────────────────

  test("a revocation that lands between a binding write's read and its commit is not erased", async () => {
    const provider = testProvider("test-provider", "complete");
    let raced = false;
    wrap = hooked({
      updateState: (original) => async (caller: never, request: never) => {
        const req = request as { runId: string; idempotencyKey: string };
        if (!raced && /^rlm-mapping:inv-1:pending/.test(req.idempotencyKey)) {
          raced = true;
          await revokeRlmGrant(rtRef!.service, alice, req.runId, "someone-else", "withdrawn mid-write");
        }
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "race" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "revoke-race" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    expect(raced).toBe(true);
    const state = await parentState(rt, run.runId);
    expect(readInvocationBinding(state, INV)).toBeDefined();
    expect((state as { rlm: { revoked: Record<string, string> } }).rlm.revoked["someone-else"]).toBe("withdrawn mid-write");
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a revocation written after a binding exists leaves the binding, and a wildcard revocation refuses every new dispatch", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "wildcard" }], parentAgent(async (ctx) => {
      const first = await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx));
      await ctx.waitFor("probe", { type: "rlm-probe", condition: { kind: "rlm_probe" }, payload: {} });
      const second = await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(c, { invocationId: "inv-new" })) as Promise<Json>).run({}, ctx);
      return { first, second } as unknown as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "wildcard" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await inspectUntil(rt, run.runId, INV, "completed");
    await revokeRlmGrant(rt.service, alice, run.runId, "*", "grant withdrawn");
    const state = await parentState(rt, run.runId);
    expect(readInvocationBinding(state, INV)).toBeDefined();
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
    const done = await until(rt, run.runId, "completed");
    expect((done.output as unknown as { second: { refusal: string } }).second.refusal).toMatch(/rlm-authority-exceeds-parent.*grant withdrawn/);
    expect(provider.spawns).toBe(1);
  });

  // ── fail closed, and fenced immediately before invoke ────────────────────────

  const childInputFor = (parentRunId: string): Json =>
    ({ invocationId: INV, providerId: "test-provider", runId: parentRunId, depth: 1, maxDepth: 2, attempt: 1, task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST }, authority: { tools: ["read"], mode: "read-only" }, budget: { currency: "time", limit: "unknown" } }) as unknown as Json;

  test("an agent built without getService fails closed: it cannot verify the parent and never dispatches", async () => {
    agentSeesService = false;
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "blind" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "blind" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    const child = await childOf(rt, run.runId);
    expect((await until(rt, child.runId, "failed")).error).toMatch(/cannot be verified/);
    expect(provider.spawns).toBe(0);
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a revocation that lands after the intent but before invoke is caught by the check inside the dispatch step", async () => {
    const provider = testProvider("test-provider", "complete");
    let armed = false;
    let calls = 0;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if ((request as { agent: string }).agent === RLM_AGENT_ID) armed = true;
        return original(caller, request);
      },
      getRun: (original) => async (caller: never, request: never) => {
        // getRun calls by the child: intent fence (parent), its last look (own run), then the dispatch-step fence (parent).
        if (armed && ++calls === 3) await revokeRlmGrant(rtRef!.service, alice, (request as { runId: string }).runId, INV, "late revocation");
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "late" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "late-revoke" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    const child = await childOf(rt, run.runId);
    expect((await until(rt, child.runId, "failed")).error).toMatch(/late revocation/);
    expect(provider.spawns).toBe(0);
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a cancel that lands between the dispatch fence and invoke (at the child's last look) stops the dispatch", async () => {
    const provider = testProvider("test-provider", "complete");
    let armed = false;
    let childLooks = 0;
    let injected = false;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        const started = (await original(caller, request)) as { runId: string };
        if ((request as { agent: string }).agent === RLM_AGENT_ID) armed = true;
        return started;
      },
      getRun: (original) => async (caller: never, request: never) => {
        const run = (request as { runId: string }).runId;
        const view = (await original(caller, request)) as RunView;
        // child getRun calls: 1 in the intent fence, 2 in the dispatch fence, 3 the final look immediately before invoke
        if (armed && view.agent === RLM_AGENT_ID && ++childLooks === 3) {
          injected = true;
          await rtRef!.service.cancelRun(alice, { runId: run, reason: "late cancel", idempotencyKey: "late-cancel" });
          return original(caller, request); // re-read after the cancel committed
        }
        return view;
      },
    });
    const rt = await open([{ provider, label: "last-look" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "last-look-barrier" });
    await Bun.sleep(400);
    expect(injected).toBe(true);
    expect(provider.spawns).toBe(0);
    expect((await childOf(rt, run.runId)).status).toBe("cancelled");
  });

  test("a child started under a cancelled parent never dispatches", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "cancelled-parent" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancelled-parent" });
    await continuation(rt, run.runId, "rlm-probe");
    await rt.service.cancelRun(alice, { runId: run.runId, reason: "stop", idempotencyKey: "cancel-parent" });
    const orphan = await rt.service.startRun(alice, { agent: RLM_AGENT_ID, input: childInputFor(run.runId), idempotencyKey: "orphan-child" });
    expect((await until(rt, orphan.runId, "failed")).error).toMatch(/was cancelled/);
    expect(provider.spawns).toBe(1); // only the original invocation, made before the parent was cancelled
  });

  // Known debt (DEBT-035): nothing cascades a parent's cancellation to a dispatched child's provider.
  test.failing("cancelling the parent after dispatch reaches provider.cancel for its child (DEBT-035: not implemented)", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise });
    const rt = await open([{ provider, label: "cascade" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cascade" });
    await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    await rt.service.cancelRun(alice, { runId: run.runId, reason: "stop", idempotencyKey: "cascade-cancel" });
    await Bun.sleep(200);
    expect(provider.cancels).toBe(1);
  });

  // ── the executor's conflict-halt retry path ──────────────────────────────────

  test("a lost write race on the result-step append re-runs the pass without a second provider invoke", async () => {
    const inner = openSqliteStore({ path: ":memory:" });
    let losses = 0;
    injectedStore = new Proxy(inner, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop !== "commit") return typeof value === "function" ? value.bind(target) : value;
        return async (...args: unknown[]) => {
          const appends = ((args[0] as { appends?: { events: { metadata?: { stepId?: string } }[] }[] }).appends ?? []).flatMap((a) => a.events);
          if (losses === 0 && appends.some((event) => event.metadata?.stepId === "step:rlm.dispatch.result")) {
            losses += 1;
            throw new ConcurrencyError("run", 0, 1); // the write after invoke returned is lost to a race
          }
          return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        };
      },
    });
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "race" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "conflict-retry" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    // The retried pass finds the intent and no result: it inspects (tied to the invocation, so it completes) and never invokes again.
    await until(rt, child.runId, "completed");
    expect(losses).toBe(1);
    expect(provider.spawns).toBe(1);
    expect((await inspect(rt, run.runId, INV)).status).toBe("completed");
  });


  // ── review pass 2 ──────────────────────────────────────────────────────────

  test("a cancel landing between the pending binding write and startRun is kept and the child never dispatches", async () => {
    const provider = testProvider("test-provider", "complete");
    let cancelled: RlmCancelOutput | undefined;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if ((request as { agent: string }).agent === RLM_AGENT_ID) cancelled = await cancelCap(rtRef!, (request as { input: { runId: string } }).input.runId);
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "gap" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "cancel-gap" });
    await Bun.sleep(300);
    expect(cancelled).toMatchObject({ status: "cancelled", dispatched: false });
    const binding = readInvocationBinding(await parentState(rt, run.runId), INV)!;
    expect(binding.cancellation).toMatchObject({ dispatched: false, providerCancel: "not-dispatched" }); // never erased by the completing write
    expect(provider.spawns).toBe(0);
  });

  test("a stale cancel record cannot regress a binding that has since started", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise });
    const startGate = deferred();
    const recordGate = deferred();
    let cancelling: Promise<RlmCancelOutput> | undefined;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if ((request as { agent: string }).agent === RLM_AGENT_ID) {
          cancelling = cancelCap(rtRef!, (request as { input: { runId: string } }).input.runId); // reads the pending binding, finds no child
          await Bun.sleep(100);
          startGate.resolve();
        }
        return original(caller, request);
      },
      updateState: (original) => async (caller: never, request: never) => {
        if (/^rlm-cancel-record/.test((request as { idempotencyKey: string }).idempotencyKey)) await recordGate.promise; // hold the stale record
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "gap" }], waitingParent());
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "stale-cancel" });
    await startGate.promise;
    await Bun.sleep(300);
    recordGate.resolve();
    await cancelling;
    await Bun.sleep(100);
    const binding = readInvocationBinding(await parentState(rt, run.runId), INV)!;
    expect(binding.runId).not.toBe("");
    expect(binding.state).toBe("started");
    expect(binding.cancellation).toBeDefined();
  });

  test("a provider cannot emit reserved rlm.outcome or rlm.dispatch events", async () => {
    const provider = testProvider("test-provider", "complete", { tryReservedEmit: true });
    const rt = await open([{ provider, label: "reserved" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "reserved" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "completed");
    expect(provider.reservedEmitErrors.length).toBe(4); // two emits and two steps
    expect(provider.reservedEmitErrors.filter((m) => /step/.test(m)).length).toBe(2);
    expect(provider.reservedEmitErrors.join(" ")).toMatch(/reserved/);
  });

  test("a refusal carrying the brand but an unbounded code is a lost response and its code never reaches the stream", async () => {
    const provider = testProvider("test-provider", "badCodeRefusal");
    const rt = await open([{ provider, label: "bad-code" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "bad-code" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    await continuation(rt, child.runId, "ambiguous-invocation"); // untied view: parked, not failed
    for await (const event of rt.service.events(alice, { runId: child.runId })) expect(JSON.stringify(event.payload)).not.toContain("SECRET");
  });

  test("a cancel before any child exists does not block a new attempt of the same task", async () => {
    const provider = testProvider("test-provider", "complete");
    let crashed = false;
    wrap = hooked({
      startRun: (original) => async (caller: never, request: never) => {
        if (!crashed && (request as { agent: string }).agent === RLM_AGENT_ID) {
          crashed = true;
          await cancelCap(rtRef!, (request as { input: { runId: string } }).input.runId); // cancel lands, then the start never happens
          throw new Error("crash before the child was created");
        }
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "pre-start" }], parentAgent(async (ctx) => {
      const first = await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(c)) as Promise<Json>).run({}, ctx);
      const second = await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { invocationId: "inv-2" }));
      return { first, second } as unknown as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "pre-start-cancel" });
    const done = await until(rt, run.runId, "completed");
    expect((done.output as unknown as { first: { refusal: string } }).first.refusal).toMatch(/crash before the child/);
    await inspectUntil(rt, run.runId, "inv-2", "completed");
    expect(provider.spawns).toBe(1);
  });

  test("a not-dispatched cancel record is upgraded when the child turns up and its provider cancel is then settled or retried", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise, cancelFailures: 1 });
    let forceEmpty = false;
    wrap = hooked({
      ...lostBindingWrite().hooks, // the binding stays pending-start, so the child is found only by correlation id
      listRuns: (original) => async (caller: never, request: never) => {
        // The cancel handler's first lookup finds no child (forced); its re-lookup after the record finds the real one.
        if (forceEmpty && /^rlm:/.test((request as { correlationId?: string }).correlationId ?? "")) {
          forceEmpty = false;
          return [];
        }
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "relookup" }], reinvokingParent(false));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "relookup" });
    const probe = await continuation(rt, run.runId, "rlm-probe");
    await spawned(provider);
    forceEmpty = true;
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", dispatched: true, providerCancel: "failed" });
    const held = readInvocationBinding(await parentState(rt, run.runId), INV)!.cancellation!;
    expect(held).toMatchObject({ dispatched: true, providerCancel: "failed" }); // not left as a not-dispatched lie
    expect(await cancelCap(rt, run.runId)).toMatchObject({ status: "cancelled", providerCancel: "cancelled" });
    expect(provider.cancels).toBe(2);
    await rt.service.resolveContinuation(alice, { continuationId: probe.id, action: "resume", input: {}, idempotencyKey: "probe-go" });
  });

  test("a provider that emitted before the response was lost still leaves exactly one outcome", async () => {
    const provider = testProvider("test-provider", "emitThenLost");
    const rt = await open([{ provider, label: "emits" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "emit-lost" });
    await until(rt, run.runId, "completed");
    await inspectUntil(rt, run.runId, INV, "completed");
    const child = await childOf(rt, run.runId);
    let outcomes = 0;
    for await (const event of rt.service.events(alice, { runId: child.runId })) {
      if (event.eventType === "rlm.outcome") outcomes += 1;
      if (event.eventType === "run.step.completed" && (event.payload as { result?: { rlmOutcome?: unknown } } | null)?.result?.rlmOutcome) outcomes += 1;
    }
    expect(outcomes).toBe(1);
    expect((await outcomeOf(rt, child.runId)).evidence).toContain("provider-invoke-threw:Error");
  });

  test("two concurrent invokes of one task under different invocationIds dispatch exactly one", async () => {
    const provider = testProvider("test-provider", "complete", { gateBeforeOutcome: deferred().promise });
    let arrivals = 0;
    const both = deferred();
    wrap = hooked({
      updateState: (original) => async (caller: never, request: never) => {
        if (/^rlm-mapping:inv-[ab]:pending/.test((request as { idempotencyKey: string }).idempotencyKey) && ++arrivals <= 2) {
          if (arrivals === 2) both.resolve();
          await Promise.race([both.promise, Bun.sleep(400)]); // line the two writers up so both have scanned first
        }
        return original(caller, request);
      },
    });
    const rt = await open([{ provider, label: "atomic" }], parentAgent(async (ctx) => {
      const results = await Promise.allSettled(["inv-a", "inv-b"].map((id) => ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx, { invocationId: id }))));
      return { results: results.map((r) => (r.status === "fulfilled" ? "ok" : String((r.reason as Error).message))) } as unknown as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "atomic" });
    const done = await until(rt, run.runId, "completed");
    const results = (done.output as unknown as { results: string[] }).results;
    expect(results.filter((r) => r === "ok").length).toBe(1);
    expect(results.filter((r) => /rlm-attempt-refused/.test(r)).length).toBe(1);
    await spawned(provider);
    expect(provider.spawns).toBe(1);
  });

  test("an operator result that contradicts the provider's fresh failed view is refused unless explicitly overridden", async () => {
    for (const override of [false, true]) {
      const provider = testProvider("test-provider", "lostUnknown", { laterStatus: "failed" });
      const rt = await open([{ provider, label: "contradiction" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
      const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: `contradiction-${override}` });
      await until(rt, run.runId, "completed");
      const child = await childOf(rt, run.runId);
      const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
      await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { by: "operator" }, ...(override ? { override: true } : {}) }, idempotencyKey: `contradiction-go-${override}` });
      if (override) {
        const done = await until(rt, child.runId, "completed");
        expect(done.output).toMatchObject({ status: "completed", reconciled: true });
        expect((await outcomeOf(rt, child.runId)).evidence as string[]).toContain("operator override of provider-view:failed");
      } else {
        expect((await until(rt, child.runId, "failed")).error).toMatch(/contradicts the provider.*original resolution/);
        const outcome = await outcomeOf(rt, child.runId);
        expect(outcome).toMatchObject({ status: "failed", reconciled: true });
        expect(outcome.evidence as string[]).toContain("operator result contradicts provider-view:failed");
      }
      expect(provider.spawns).toBe(1);
      await runtime?.close();
      runtime = undefined;
    }
  });

  test("the agent re-reads its own run status as the last step before invoke: a cancel the local signal never saw stops it", async () => {
    const calls: string[] = [];
    const registry = createRlmRegistry();
    registry.register({ provider: { ...testProvider("test-provider", "complete"), invoke: async () => { calls.push("invoke"); return { runId: "x" }; } } as RlmProvider, label: "last-look" });
    const service = {
      getRun: async (_caller: Caller, request: { runId: string }) => ({ status: request.runId === "child-run" ? "cancelled" : "running", startedBy: "alice" }),
      events: async function* () {},
    } as unknown as RuntimeService;
    const agent = createRlmAgent({ registry, getService: () => service });
    const ctx = { runId: "child-run", actor: alice.actor, tenant: alice.tenant, signal: new AbortController().signal, emit: async () => {}, step: async (_id: string, fn: () => unknown) => fn() } as unknown as RunContext;
    const input = { invocationId: INV, providerId: "test-provider", runId: "parent-run", depth: 1, maxDepth: 2, task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST }, authority: { tools: [], mode: "read-only" }, budget: { currency: "time", limit: "unknown" } };
    await expect(agent.run(input as unknown as Json, ctx)).rejects.toThrow(/cancel/);
    expect(calls).toEqual([]);
  });

  // ── reconciliation ──────────────────────────────────────────────────────────

  test("a reconciled invocation says so in the child's output and ignores a foreign view's spend and evidence", async () => {
    const provider = testProvider("test-provider", "lostUntied");
    const rt = await open([{ provider, label: "foreign" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "foreign" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: "foreign-go" });
    const done = await until(rt, child.runId, "completed");
    expect(done.output).toMatchObject({ status: "completed", reconciled: true });
    const outcome = await outcomeOf(rt, child.runId);
    expect(outcome.evidence).toEqual(["foreign view ignored", "provider-invoke-threw:Error"]);
    expect(outcome.payment).toMatchObject({ spent: "unknown" });
    expect(outcome.resultRef).toBeNull();
  });

  test("reconciliation asks the provider again and records what it says now", async () => {
    const provider = testProvider("test-provider", "lostUnknown", { laterStatus: "completed" });
    const rt = await open([{ provider, label: "fresh" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "fresh-view" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
    expect(provider.inspects).toBe(1);
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: "fresh-go" });
    await until(rt, child.runId, "completed");
    expect(provider.inspects).toBe(2);
    const outcome = await outcomeOf(rt, child.runId);
    expect(outcome.evidence as string[]).toContain("provider-view:completed");
    expect(outcome.payment).toMatchObject({ spent: 3 });
    expect(provider.spawns).toBe(1);
  });

  test("a resume that states no outcome is refused: the invocation closes failed, reconciled, with the refusal recorded", async () => {
    const provider = testProvider("test-provider", "lostUnknown");
    const rt = await open([{ provider, label: "silent" }], parentAgent(async (ctx) => (await ctx.invoke(RLM_CAPABILITIES.invoke, invokeArgs(ctx))) as unknown as Json));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "silent" });
    await until(rt, run.runId, "completed");
    const child = await childOf(rt, run.runId);
    const ambiguous = await continuation(rt, child.runId, "ambiguous-invocation");
    await rt.service.resolveContinuation(alice, { continuationId: ambiguous.id, action: "resume", input: {}, idempotencyKey: "silent-go" });
    expect((await until(rt, child.runId, "failed")).error).toMatch(/explicit result or failure/);
    const view = await inspect(rt, run.runId, INV);
    expect(view).toMatchObject({ status: "failed", reconciled: true });
    expect(view.evidence).toContain("reconciliation stated no outcome");
    expect(provider.spawns).toBe(1);
  });

  test("an attempt that is not a positive integer is refused with no child and no dispatch", async () => {
    const provider = testProvider("test-provider", "complete");
    const rt = await open([{ provider, label: "attempt" }], parentAgent(async (ctx) => {
      const refusals: string[] = [];
      for (const [i, attempt] of [0, -1, 1.5, "2", null].entries()) {
        const out = (await refusingParent((c) => ctx.invoke(RLM_CAPABILITIES.invoke, { ...(invokeArgs(c, { invocationId: `inv-bad-${i}` }) as Record<string, Json>), attempt: attempt as Json }) as Promise<Json>).run({}, ctx)) as { refusal: string };
        refusals.push(out.refusal);
      }
      return { refusals } as unknown as Json;
    }));
    const run = await rt.service.startRun(alice, { agent: "agent.parent", input: {}, idempotencyKey: "bad-attempts" });
    const done = await until(rt, run.runId, "completed");
    for (const refusal of (done.output as unknown as { refusals: string[] }).refusals) expect(refusal).toMatch(/rlm-attempt-refused.*positive integer/);
    expect(provider.spawns).toBe(0);
    expect((await rt.service.listRuns(alice, { correlationId: `rlm:${run.runId}:inv-bad-0` })).length).toBe(0);
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
