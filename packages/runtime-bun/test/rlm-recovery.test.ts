// Restart between dispatch intent and provider result (SEA-Forge #113, Cognate half): an interrupted runtime
// followed by recovery performs exactly one provider.invoke in total and decides the outcome by inspecting the
// original invocation. PostgreSQL, same pattern as shutdown-recovery.test.ts.
import { expect, test } from "bun:test";
import type { Json } from "@godspeedai/cognate-events";
import type { AgentDefinition, Caller, InvocationView, ProviderFacts, RlmInvokeRequest, RlmProvider, RunContext } from "@godspeedai/cognate-runtime-api";
import { RLM_CAPABILITIES } from "@godspeedai/cognate-runtime-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { createRlmAgent, createRlmComponent, createRlmRegistry, createRuntime, type Runtime } from "../src/index.ts";

const caller: Caller = { tenant: "rlm-recovery", actor: { id: "operator", kind: "user" } };
const policy = { authorize: () => ({ allow: true as const, policyId: "test", reason: "test" }) };
const actions = { authorize: () => ({ allow: true as const, reason: "test" }) };
const DIGEST = `sha256:${"a".repeat(64)}`;
const INV = "inv-restart";

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, message: string): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await read();
    if (done(value)) return value;
    await Bun.sleep(10);
  }
  throw new Error(message);
}

const facts: ProviderFacts = {
  capabilities: { maxDepth: 2, contextDecomposition: true, providerInternalSubagents: false, streaming: true, isolation: "process", resultDelivery: "return", cancellation: "process", paymentMetering: "reported" },
  toolPolicy: "contained",
  executable: { version: "1.0.0", sha256: "b".repeat(64) },
};

/** A provider whose invoke spawns (counted) and then hangs until the runtime shuts down; inspect answers `after`. */
function hangingProvider(after: () => InvocationView["status"], tied: boolean) {
  const counts = { invokes: 0, inspects: 0 };
  const provider: RlmProvider = {
    id: "test-provider",
    probe: async () => facts,
    async invoke(_req: RlmInvokeRequest, _spawn, ctx: RunContext) {
      counts.invokes += 1;
      await new Promise<void>((resolve) => (ctx.signal.aborted ? resolve() : ctx.signal.addEventListener("abort", () => resolve(), { once: true })));
      throw new Error("provider interrupted by runtime shutdown");
    },
    async inspect(): Promise<InvocationView> {
      counts.inspects += 1;
      const status = after();
      return { status, ...(tied ? { invocationId: INV } : {}), evidence: [`restart:${status}`], payment: { currency: "time", spent: "unknown", basis: "unmeasured" }, isolation: "process", lastEventAt: new Date().toISOString() };
    },
    async cancel() {},
  };
  return { provider, counts };
}

async function restartScenario(name: string, after: InvocationView["status"], tied: boolean, check: (runtime: Runtime, childRunId: string, counts: { invokes: number; inspects: number }) => Promise<void>) {
  const database = await openPostgresStore({
    url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    schema: `cognate_rlm_recovery_${crypto.randomUUID().replaceAll("-", "")}`,
    pollMs: 0,
  });
  const { provider, counts } = hangingProvider(() => after, tied);
  const parent: AgentDefinition = {
    id: "agent.parent",
    version: "1.0.0",
    run: async (_input, ctx): Promise<Json> =>
      (await ctx.invoke(RLM_CAPABILITIES.invoke, {
        invocationId: INV,
        providerId: "test-provider",
        parent: { runId: ctx.runId, assignmentId: null, attempt: 0, depth: 0, maxDepth: 2, authorityTools: ["read"] },
        task: { purpose: "p", acceptance: [], contextRefs: [], contextDigest: DIGEST },
        authority: { tools: ["read"], mode: "read-only" },
        budget: { currency: "time", limit: "unknown" },
      } as unknown as Json)) as Json,
  };
  const open = async (): Promise<Runtime> => {
    const registry = createRlmRegistry();
    registry.register({ provider, label: "restart" });
    let ref: Runtime | undefined;
    const getService = () => ref!.service;
    const runtime = await createRuntime({
      store: { store: database.store },
      agents: [parent, createRlmAgent({ registry, getService })],
      policy,
      actions,
      components: [createRlmComponent({ registry, getService })],
      execution: { maxConcurrentRuns: 2, resourceKeys: () => [] },
    });
    ref = runtime;
    return runtime;
  };

  let runtime = await open();
  let closing: Promise<void> | undefined;
  try {
    const run = await runtime.service.startRun(caller, { agent: "agent.parent", input: {}, idempotencyKey: `${name}-parent` });
    const childOf = async (rt: Runtime) => (await rt.service.listRuns(caller, { correlationId: `rlm:${run.runId}:${INV}` }))[0];
    // The child has recorded its intent and is inside the one provider.invoke.
    await until(async () => counts.invokes, (n) => n === 1, "the provider was never invoked");
    const child = (await childOf(runtime))!;
    await Promise.race([closing = runtime.close(), Bun.sleep(2_000).then(() => { throw new Error("runtime close did not abort the pending provider invoke"); })]);
    expect((await database.store.readStream(`run-${child.runId}`)).length).toBeGreaterThan(0);

    runtime = await open();
    closing = undefined;
    await check(runtime, child.runId, counts);
    expect(counts.invokes).toBe(1);
  } finally {
    await (closing ?? runtime.close());
    await database.dropSchema();
    await database.close();
  }
}

test("restart between intent and result with an unverifiable provider keeps the invocation ambiguous (one invoke in total)", async () => {
  await restartScenario("unknown", "unknown", true, async (rt, childRunId, counts) => {
    const wait = await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "the recovered child did not park on the ambiguous-invocation wait");
    expect(wait.length).toBe(1);
    await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "waiting", "the recovered child did not report waiting");
    expect(counts.invokes).toBe(1);
    // Operator reconciliation is recorded as reconciled, and does not invoke again.
    await rt.service.resolveContinuation(caller, { continuationId: wait[0]!.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: "restart-reconcile" });
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the reconciled child did not complete");
    expect(done.output).toMatchObject({ status: "completed" });
    const outcome: Json[] = [];
    for await (const event of rt.service.events(caller, { runId: childRunId })) if (event.eventType === "rlm.outcome") outcome.push(event.payload);
    expect(outcome[0]).toMatchObject({ reconciled: true });
  });
}, 30_000);

test("restart between intent and result completes from a result tied to the original invocation, without a second invoke", async () => {
  await restartScenario("completed", "completed", true, async (rt, childRunId) => {
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not complete");
    expect(done.output).toMatchObject({ status: "completed" });
  });
}, 30_000);

test("restart between intent and result with a completed view that is not tied to the invocation stays ambiguous", async () => {
  await restartScenario("untied", "completed", false, async (rt, childRunId) => {
    await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "an untied result must not be trusted");
  });
}, 30_000);

test("restart between intent and result with a known failure closes the invocation failed", async () => {
  await restartScenario("failed", "failed", true, async (rt, childRunId) => {
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not close");
    expect(done.output).toMatchObject({ status: "failed" });
    expect(await rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" })).toEqual([]);
  });
}, 30_000);
