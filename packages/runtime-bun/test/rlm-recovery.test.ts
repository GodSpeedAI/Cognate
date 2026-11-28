// Restart between dispatch intent and provider result (SEA-Forge #113, Cognate half): an interrupted runtime
// followed by recovery performs exactly one provider.invoke in total and decides the outcome by inspecting the
// original invocation. PostgreSQL, same pattern as shutdown-recovery.test.ts.
//
// Database: COGNATE_TEST_POSTGRES_URL (default postgres://postgres:postgres@127.0.0.1:5432/postgres). Locally, start
// one with pg0, which the shutdown-recovery and run-ownership tests use too:
//   export COGNATE_PG0_BIN=$HOME/projects/cognate-workbench/.tmp/pg0/pg0
//   $COGNATE_PG0_BIN start --name cog113 --port 5439
//   export COGNATE_TEST_POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5439/postgres
//   ...run the file...; $COGNATE_PG0_BIN stop --name cog113
// Two kinds of interruption: a graceful runtime.close() (abort signal, restartScenario) and a SIGKILL of a separate
// process (no abort, no close, no release: crashScenario).
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  for (let attempt = 0; attempt < 1_000; attempt++) {
    const value = await read();
    if (done(value)) return value;
    await Bun.sleep(30);
  }
  throw new Error(message);
}

const POSTGRES_URL = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

/** Opens the schema, or fails fast and clearly when no PostgreSQL is reachable (this suite is never skipped). */
async function openSchema(schema: string) {
  let timedOut = false;
  const opening = openPostgresStore({ url: POSTGRES_URL, schema, pollMs: 0 });
  // A store that finishes opening after the deadline has no caller: drop its schema and close it so nothing leaks.
  opening.then(
    async (late) => {
      if (!timedOut) return;
      await late.dropSchema().catch(() => {});
      await late.close().catch(() => {});
    },
    () => {},
  );
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      timedOut = true;
      reject(new Error("timed out after 5 s"));
    }, 5_000).unref(),
  );
  try {
    return await Promise.race([opening, timeout]);
  } catch (cause) {
    throw new Error(`rlm-recovery.test.ts needs a reachable PostgreSQL (COGNATE_TEST_POSTGRES_URL, default postgres://postgres:postgres@127.0.0.1:5432/postgres): ${(cause as Error).message}. Start one with pg0; see the commands in this file's header.`);
  }
}

const facts: ProviderFacts = {
  capabilities: { maxDepth: 2, contextDecomposition: true, providerInternalSubagents: false, streaming: true, isolation: "process", resultDelivery: "return", cancellation: "process", paymentMetering: "reported" },
  toolPolicy: "contained",
  executable: { version: "1.0.0", sha256: "b".repeat(64) },
};

/** A provider whose invoke spawns (counted) and then hangs until the runtime shuts down; inspect answers `after`. */
function hangingProvider(after: () => InvocationView["status"], tied: boolean, emits = 0) {
  const counts = { invokes: 0, inspects: 0 };
  const provider: RlmProvider = {
    id: "test-provider",
    probe: async () => facts,
    async invoke(_req: RlmInvokeRequest, _spawn, ctx: RunContext) {
      counts.invokes += 1;
      for (let i = 0; i < emits; i++) await ctx.emit("rlm.progress", { pct: 10 * (i + 1) });
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

async function restartScenario(name: string, after: InvocationView["status"], tied: boolean, emits: number, check: (runtime: Runtime, childRunId: string, counts: { invokes: number; inspects: number }) => Promise<void>) {
  const database = await openSchema(`cognate_rlm_recovery_${crypto.randomUUID().replaceAll("-", "")}`);
  const { provider, counts } = hangingProvider(() => after, tied, emits);
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
    const getStore = () => ref!.store;
    const runtime = await createRuntime({
      store: { store: database.store },
      agents: [parent, createRlmAgent({ registry, getService, getStore })],
      policy,
      actions,
      components: [createRlmComponent({ registry, getService, getStore })],
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
  await restartScenario("unknown", "unknown", true, 0, async (rt, childRunId, counts) => {
    const wait = await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "the recovered child did not park on the ambiguous-invocation wait");
    expect(wait.length).toBe(1);
    await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "waiting", "the recovered child did not report waiting");
    expect(counts.invokes).toBe(1);
    // Operator reconciliation is recorded as reconciled, and does not invoke again.
    await rt.service.resolveContinuation(caller, { continuationId: wait[0]!.id, action: "resume", input: { result: { by: "operator" } }, idempotencyKey: "restart-reconcile" });
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the reconciled child did not complete");
    expect(done.output).toMatchObject({ status: "completed" });
    const outcome: Json[] = [];
    for await (const event of rt.service.events(caller, { runId: childRunId })) {
      const recorded = event.eventType === "run.step.completed" ? (event.payload as { result?: { rlmOutcome?: Json } } | null)?.result?.rlmOutcome : undefined;
      if (recorded) outcome.push(recorded);
    }
    expect(outcome[0]).toMatchObject({ reconciled: true });
  });
}, 30_000);

test("restart between intent and result completes from a result tied to the original invocation, without a second invoke", async () => {
  await restartScenario("completed", "completed", true, 0, async (rt, childRunId) => {
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not complete");
    expect(done.output).toMatchObject({ status: "completed" });
  });
}, 30_000);

test("restart between intent and result with a completed view that is not tied to the invocation stays ambiguous", async () => {
  await restartScenario("untied", "completed", false, 0, async (rt, childRunId) => {
    await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "an untied result must not be trusted");
  });
}, 30_000);

test("restart between intent and result with a known failure closes the invocation failed", async () => {
  await restartScenario("failed", "failed", true, 0, async (rt, childRunId) => {
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not close");
    expect(done.output).toMatchObject({ status: "failed" });
    expect(await rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" })).toEqual([]);
  });
}, 30_000);

test("a provider that emitted before the interruption still leaves exactly one rlm.outcome after recovery", async () => {
  await restartScenario("emitted", "completed", true, 2, async (rt, childRunId) => {
    await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not complete");
    let outcomes = 0;
    for await (const event of rt.service.events(caller, { runId: childRunId })) {
      if (event.eventType === "rlm.outcome") outcomes += 1;
      if (event.eventType === "run.step.completed" && (event.payload as { result?: { rlmOutcome?: unknown } } | null)?.result?.rlmOutcome) outcomes += 1;
    }
    expect(outcomes).toBe(1);
  });
}, 30_000);

// ── a real crash: SIGKILL, so nothing aborts, closes or releases ────────────────

/** Spawns the fixture, waits for `marker`, SIGKILLs it, then recovers on the same schema in this process. */
async function crashScenario(mode: "after-invoke" | "before-invoke", marker: string, after: InvocationView["status"], check: (rt: Runtime, childRunId: string, invokesInRecovery: () => number) => Promise<void>) {
  const url = POSTGRES_URL;
  const schema = `cognate_rlm_crash_${crypto.randomUUID().replaceAll("-", "")}`;
  const preflight = await openSchema(`${schema}_preflight`); // fail fast and clearly before spawning anything
  await preflight.dropSchema();
  await preflight.close();
  const dir = mkdtempSync(join(tmpdir(), "rlm-crash-"));
  const counterFile = join(dir, "invokes");
  let rt: Runtime | undefined;
  let database: Awaited<ReturnType<typeof openSchema>> | undefined;
  // Everything the scenario creates (the fixture's schema, the directory, the runtime) is cleaned up whatever fails, including the handshake.
  try {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "fixtures", "rlm-crash-runtime.ts"), url, schema, counterFile, mode], { stdout: "pipe", stderr: "inherit", env: process.env });
  let parentRunId = "";
  let sawMarker = false;
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 20_000;
  try {
    while (!(sawMarker && parentRunId)) {
      // The read is raced against the remaining deadline: a fixture that stays silent cannot hang the handshake.
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const next = await Promise.race([reader.read(), Bun.sleep(remaining).then(() => "deadline" as const)]);
      if (next === "deadline" || next.done) break;
      text += decoder.decode(next.value);
      parentRunId = /PARENT (\S+)/.exec(text)?.[1] ?? "";
      sawMarker = text.includes(marker);
    }
  } finally {
    // The crash itself (and the cleanup when the handshake fails): SIGKILL, never a graceful stop, then reap.
    proc.kill("SIGKILL");
    await proc.exited;
  }
  expect(sawMarker).toBe(true);
  const invokesBefore = existsSync(counterFile) ? readFileSync(counterFile, "utf8").split("\n").filter(Boolean).length : 0;

  database = await openSchema(schema);
  let recoveredInvokes = 0;
  const provider: RlmProvider = {
    id: "test-provider",
    probe: async () => facts,
    async invoke() {
      recoveredInvokes += 1;
      return { runId: "never" };
    },
    async inspect(): Promise<InvocationView> {
      return { status: after, invocationId: INV_CRASH, evidence: [`crash:${after}`], payment: { currency: "time", spent: "unknown", basis: "unmeasured" }, isolation: "process", lastEventAt: new Date().toISOString() };
    },
    async cancel() {},
  };
  const registry = createRlmRegistry();
  registry.register({ provider, label: "recovered" });
  const getService = () => rt!.service;
  const getStore = () => rt!.store;
  const parent: AgentDefinition = { id: "agent.parent", version: "1.0.0", run: async (): Promise<Json> => ({ unused: true }) };
  {
    rt = await createRuntime({
      store: { store: database.store },
      agents: [parent, createRlmAgent({ registry, getService, getStore })],
      policy,
      actions,
      components: [createRlmComponent({ registry, getService, getStore })],
      // A SIGKILLed owner never releases its lease: recovery proceeds when the lease lapses.
      execution: { maxConcurrentRuns: 2, resourceKeys: () => [], runOwnership: { leaseMs: 500 } },
    });
    const child = await until(async () => (await rt!.service.listRuns(caller, { correlationId: `rlm:${parentRunId}:${INV_CRASH}` }))[0], (c) => c !== undefined, "the crashed child run was not in the store");
    await check(rt, child!.runId, () => recoveredInvokes);
    expect(invokesBefore + recoveredInvokes).toBe(mode === "after-invoke" ? 1 : 0);
  }
  } finally {
    await rt?.close();
    const db = database ?? (await openSchema(schema).catch(() => undefined));
    await db?.dropSchema().catch(() => undefined);
    await db?.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
}
const INV_CRASH = "inv-crash";

test("SIGKILL inside provider.invoke: recovery never invokes again and parks the unverifiable invocation ambiguous", async () => {
  await crashScenario("after-invoke", "INVOKED", "unknown", async (rt, childRunId, invokes) => {
    await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "the recovered child did not park ambiguous");
    expect(invokes()).toBe(0);
  });
}, 60_000);

test("SIGKILL inside provider.invoke: recovery completes from a result tied to the original invocation, still without a second invoke", async () => {
  await crashScenario("after-invoke", "INVOKED", "completed", async (rt, childRunId, invokes) => {
    const done = await until(() => rt.service.getRun(caller, { runId: childRunId }), (v) => v.status === "completed", "the recovered child did not complete");
    expect(done.output).toMatchObject({ status: "completed" });
    expect(invokes()).toBe(0);
  });
}, 60_000);

test("SIGKILL after the intent is durable and before provider.invoke: zero invokes in total, and the child parks for an operator", async () => {
  await crashScenario("before-invoke", "INTENT-DURABLE", "unknown", async (rt, childRunId, invokes) => {
    await until(() => rt.service.listContinuations(caller, { runId: childRunId, status: "OPEN" }), (c) => c.some((x) => x.type === "ambiguous-invocation"), "the recovered child did not park ambiguous");
    expect(invokes()).toBe(0);
  });
}, 60_000);
