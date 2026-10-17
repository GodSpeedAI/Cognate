import { expect, test } from "bun:test";
import type { Json } from "@godspeedai/cognate-events";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import type { Component } from "@godspeedai/cognate-kernel-api";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";
import { createRuntime } from "../src/index.ts";

const caller: Caller = { tenant: "shutdown-recovery", actor: { id: "operator", kind: "user" } };
const policy = { authorize: () => ({ allow: true as const, policyId: "test", reason: "test" }) };
const actions = { authorize: () => ({ allow: true as const, reason: "test" }) };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, message: string): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await read();
    if (done(value)) return value;
    await Bun.sleep(10);
  }
  throw new Error(message);
}

test("PostgreSQL shutdown aborts in-flight provider work and resumes the same durable run", async () => {
  const database = await openPostgresStore({
    url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    schema: `cognate_shutdown_recovery_${crypto.randomUUID().replaceAll("-", "")}`,
    pollMs: 0,
  });
  const providerEntered = deferred<void>();
  const providerAborted = deferred<void>();
  const releaseProvider = deferred<string>();
  let effects = 0;

  const agent: AgentDefinition = {
    id: "agent.shutdown-recovery",
    version: "1.0.0",
    async run(input, ctx): Promise<Json> {
      const kind = (input as { kind: string }).kind;
      if (kind === "wait") {
        await ctx.waitFor("keep-open", { type: "test.wait", condition: { kind: "keep-open" }, payload: { marker: "unchanged" } });
        return { resumed: true };
      }
      const checkpoint = await ctx.step("checkpoint", () => ++effects);
      const response = await ctx.invoke("test.provider", { kind: "pending" });
      return { checkpoint, response };
    },
  };

  const pendingProvider: Component = {
    id: "pending-provider",
    provides: [{ id: "test.provider", version: "1.0.0" }],
    activate(fiber) {
      fiber.provide({ id: "test.provider", version: "1.0.0" }, async (_input, context) => {
        providerEntered.resolve();
        const signal = context.signal;
        if (signal?.aborted) {
          providerAborted.resolve();
          throw new Error("provider aborted by runtime shutdown");
        }
        let onAbort!: () => void;
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => {
            providerAborted.resolve();
            reject(new Error("provider aborted by runtime shutdown"));
          };
          signal?.addEventListener("abort", onAbort, { once: true });
        });
        try {
          return await Promise.race([releaseProvider.promise, aborted]);
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      });
    },
  };
  const recoveredProvider: Component = {
    id: "recovered-provider",
    provides: [{ id: "test.provider", version: "1.0.0" }],
    activate(fiber) {
      fiber.provide({ id: "test.provider", version: "1.0.0" }, () => "recovered");
    },
  };

  const execution = { maxConcurrentRuns: 2, resourceKeys: () => [] };
  let runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions, components: [pendingProvider], execution });
  let closing: Promise<void> | undefined;
  try {
    const run = await runtime.service.startRun(caller, { agent: agent.id, input: { kind: "provider" }, idempotencyKey: "shutdown-provider" });
    await providerEntered.promise;
    const waitingRun = await runtime.service.startRun(caller, { agent: agent.id, input: { kind: "wait" }, idempotencyKey: "shutdown-wait" });
    const openBeforeShutdown = await until(
      () => runtime.service.listContinuations(caller, { status: "OPEN" }),
      (items) => items.some((item) => item.runId === waitingRun.runId),
      "native wait continuation did not open",
    );
    const continuation = openBeforeShutdown.find((item) => item.runId === waitingRun.runId)!;

    await Promise.race([
      closing = runtime.close(),
      Bun.sleep(1_000).then(() => { throw new Error("runtime close did not abort the pending provider handler"); }),
    ]);
    await Promise.race([
      providerAborted.promise,
      Bun.sleep(500).then(() => { throw new Error("provider handler did not observe shutdown abort"); }),
    ]);
    const afterShutdown = await runtime.service.getRun(caller, { runId: run.runId });
    expect(afterShutdown.status).toBe("running");
    expect(afterShutdown.error).toBeNull();
    expect(effects).toBe(1);
    expect((await runtime.service.getRun(caller, { runId: waitingRun.runId })).status).toBe("waiting");
    expect((await runtime.service.listContinuations(caller, { status: "OPEN" })).some((item) => item.id === continuation.id)).toBe(true);

    runtime = await createRuntime({ store: { store: database.store }, agents: [agent], policy, actions, components: [recoveredProvider], execution });
    closing = undefined;
    await runtime.service.resolveContinuation(caller, {
      continuationId: continuation.id,
      action: "resume",
      input: { accepted: true },
      idempotencyKey: "shutdown-wait-resume",
    });
    await runtime.idle();
    const completed = await until(
      () => runtime.service.getRun(caller, { runId: run.runId }),
      (view) => view.status === "completed",
      "the recovered provider run did not complete",
    );
    expect(completed.runId).toBe(run.runId);
    expect(completed.output).toEqual({ checkpoint: 1, response: "recovered" });
    expect(effects).toBe(1);
    expect((await runtime.service.getRun(caller, { runId: waitingRun.runId })).status).toBe("completed");
  } finally {
    // Release before awaiting close so a failed regression never strands a handler or test process.
    releaseProvider.resolve("released-after-failure");
    await (closing ?? runtime.close());
    await database.dropSchema();
    await database.close();
  }
}, 30_000);

test("PostgreSQL restart recovers an acknowledged resume interrupted before run.resumed is durable", async () => {
  const database = await openPostgresStore({
    url: process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    schema: `cognate_resumed_shutdown_${crypto.randomUUID().replaceAll("-", "")}`,
    pollMs: 0,
  });
  const resumedLookupEntered = deferred<void>();
  const releaseResumedLookup = deferred<readonly string[]>();
  const resumedLookupAborted = deferred<void>();
  let waitingLookups = 0;
  const agent: AgentDefinition = {
    id: "agent.resumed-shutdown",
    version: "1.0.0",
    async run(_input, ctx) {
      const answer = await ctx.waitFor("shutdown-resume", {
        type: "test.resume",
        condition: { kind: "shutdown-resume" },
        payload: { marker: "persisted" },
      });
      return { answer };
    },
  };
  const runtimeOptions = (holdResumedLookup: boolean) => ({
    store: { store: database.store },
    agents: [agent],
    policy,
    actions,
    execution: {
      maxConcurrentRuns: 1,
      resourceKeys: (_run: import("@godspeedai/cognate-runtime-api").RunView, signal?: AbortSignal) => {
        waitingLookups++;
        if (!holdResumedLookup || waitingLookups === 1) return [];
        resumedLookupEntered.resolve();
        signal?.addEventListener("abort", () => resumedLookupAborted.resolve(), { once: true });
        return releaseResumedLookup.promise;
      },
    },
  });

  let runtime = await createRuntime(runtimeOptions(true));
  let closing: Promise<void> | undefined;
  try {
    const run = await runtime.service.startRun(caller, { agent: agent.id, input: null, idempotencyKey: "resume-shutdown" });
    await until(
      () => runtime.service.getRun(caller, { runId: run.runId }),
      (view) => view.status === "waiting",
      "run did not reach its native continuation",
    );
    const continuation = (await runtime.service.listContinuations(caller, { runId: run.runId, status: "OPEN" }))[0]!;
    expect(continuation).toBeDefined();

    await runtime.service.resolveContinuation(caller, {
      continuationId: continuation.id,
      action: "resume",
      input: { answer: "continue" },
      idempotencyKey: "resume-before-shutdown",
    });
    await resumedLookupEntered.promise;
    await Promise.race([
      closing = runtime.close(),
      Bun.sleep(1_000).then(() => { throw new Error("runtime close did not abort resumed-run eligibility lookup"); }),
    ]);
    await Promise.race([
      resumedLookupAborted.promise,
      Bun.sleep(500).then(() => { throw new Error("resumed-run eligibility lookup did not observe shutdown abort"); }),
    ]);

    expect((await runtime.service.getRun(caller, { runId: run.runId })).status).toBe("waiting");
    expect((await runtime.service.listContinuations(caller, { runId: run.runId }))[0]?.status).toBe("RESUMED");
    const resumeItems = await database.store.listOutbox({ topic: "continuation.resume", status: "delivered" });
    expect(resumeItems.some((item) => (item.payload as { continuationId?: string }).continuationId === continuation.id)).toBe(true);

    waitingLookups = 0;
    runtime = await createRuntime(runtimeOptions(false));
    closing = undefined;
    const completed = await until(
      () => runtime.service.getRun(caller, { runId: run.runId }),
      (view) => view.status === "completed",
      "restart did not recover the already-RESUMED continuation",
    );
    expect(completed.output).toEqual({ answer: { answer: "continue" } });
    expect((await runtime.service.listContinuations(caller, { runId: run.runId }))[0]?.status).toBe("RESUMED");
  } finally {
    // The callback intentionally ignores abort; settle it before teardown on every failure path.
    releaseResumedLookup.resolve([]);
    await (closing ?? runtime.close());
    await database.dropSchema();
    await database.close();
  }
}, 30_000);
