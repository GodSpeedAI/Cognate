// Composition root: store, kernel, continuations, artifacts, projections, cognition, and the background loop.
import { ArtifactService } from "@cognate/artifacts";
import { ContinuationService } from "@cognate/continuations";
import { type DurableStore, OutboxDispatcher } from "@cognate/events";
import { createCordisKernel } from "@cognate/kernel-cordis";
import type { Principal } from "@cognate/kernel-api";
import { ProjectionRunner } from "@cognate/projections";
import { openSqliteStore } from "@cognate/store-sqlite";
import { COGNITION_PROJECTION, cognitionProjection, recallFor } from "./cognition.ts";
import type { Core } from "./core.ts";
import { executeOnce } from "./executor.ts";
import { foldRun, isTerminal, RESUME_HANDLER, RUN_EXECUTE_TOPIC, RUNS, runStream } from "./fold.ts";
import type { Runtime, RuntimeOptions } from "./index.ts";
import { inspectCorrelation } from "./inspect.ts";
import { Governor } from "./governed-operation.ts";
import { Invoker } from "./invoker.ts";
import { createService } from "./service.ts";
import { RemoteOfferRegistry } from "./remote-offers.ts";

const DELIVERY = { baseMs: 50, maxMs: 5_000, maxAttempts: 10 };
const TOPICS = [RUN_EXECUTE_TOPIC, "continuation.resume"];

export async function startRuntime(options: RuntimeOptions): Promise<Runtime> {
  const ownsStore = typeof options.store === "string";
  const store: DurableStore = typeof options.store === "string" ? openSqliteStore({ path: options.store }) : options.store.store;
  const system: Principal = options.system ?? { id: "system", kind: "system" };
  const governor = new Governor(options.actions, options.policy, options.governance ?? { mode: "off" });
  const invoker = new Invoker(governor);
  // The kernel is single-tenant by contract; the invoker supplies each call's tenant to the policy.
  const kernel = await createCordisKernel({ tenant: "runtime", principal: system, policy: invoker.policy });
  await invoker.attach(kernel, options.components ?? []);

  // Authorization happens in the service against `actions`; the continuation layer trusts its caller.
  const continuations = new ContinuationService(store, { policy: { authorize: () => ({ allow: true, reason: "authorized by runtime service" }) }, delivery: DELIVERY });

  let closed = false;
  const chains = new Map<string, Promise<void>>();
  const pending = new Set<string>();
  const execute = (runId: string): Promise<void> => {
    const next = (chains.get(runId) ?? Promise.resolve()).then(async () => {
      for (let attempt = 0; attempt < 5 && !closed; attempt++) if ((await executeOnce(core, runId)) === "done") return;
    });
    const tracked = next.finally(() => {
      if (chains.get(runId) === tracked) chains.delete(runId);
    });
    chains.set(runId, tracked);
    return tracked;
  };

  const core: Core = {
    store,
    kernel,
    invoker,
    continuations,
    artifacts: new ArtifactService(store),
    governor,
    agents: new Map(options.agents.map((a) => [a.id, a])),
    scopeId: kernel.root.id,
    recall: recallFor(store, options.cognition),
    outboxFor: options.outboxFor ?? (() => []),
    controllers: new Map(),
    remoteOffers: new RemoteOfferRegistry(),
    execute,
    kick: () => kick(),
  };

  const unregister = continuations.registerHandler({
    ...RESUME_HANDLER,
    supports: (stored) => stored === RESUME_HANDLER.version,
    handle: (record) => execute(record.runId),
  });

  const runDispatcher = new OutboxDispatcher(store, {
    topic: RUN_EXECUTE_TOPIC,
    backoff: DELIVERY,
    deliver: async (item) => {
      await execute((item.payload as { runId: string }).runId);
      return { executed: true };
    },
  });

  async function tick(): Promise<void> {
    for (const record of await continuations.expireDue()) pending.add(record.runId);
    await continuations.dispatchResumes();
    await runDispatcher.drain();
    for (const runId of [...pending]) {
      pending.delete(runId);
      await execute(runId);
    }
  }

  let ticking: Promise<void> | null = null;
  let again = false;
  function kick(): void {
    if (closed) return;
    if (ticking) {
      again = true;
      return;
    }
    ticking = (async () => {
      do {
        again = false;
        await tick().catch(() => {});
      } while (again && !closed);
    })().finally(() => {
      ticking = null;
    });
  }

  // Projections: user projections, plus the cognitive indexer when cognition is configured.
  const runners: ProjectionRunner[] = [];
  for (const { projection } of options.projections ?? []) runners.push(new ProjectionRunner(store, projection));
  let cognitionRunner: ProjectionRunner | undefined;
  if (options.cognition) {
    cognitionRunner = new ProjectionRunner(store, cognitionProjection(options.cognition));
    runners.push(cognitionRunner);
    if (!options.cognition.persistent) {
      // The index lost its data with the process; never let the checkpoint claim entries it no longer holds.
      await options.cognition.index.clear();
      await cognitionRunner.rebuild();
    }
  }
  for (const runner of runners) {
    if ((await runner.catchUp()).status === "rebuild_required") await runner.rebuild();
    runner.start();
  }

  // Recovery: re-enter runs that were running at shutdown or whose wait closed without a delivery.
  for (const { id } of await store.listRecords(RUNS)) {
    const view = foldRun(id, await store.readStream(runStream(id)));
    if (!view || isTerminal(view)) continue;
    if (view.status === "running") pending.add(id);
    for (const continuationId of view.waitingOn) {
      const record = await continuations.get(continuationId);
      if (record && !["OPEN", "BLOCKED", "RESUMED"].includes(record.status)) pending.add(id);
    }
  }

  const timer = setInterval(kick, options.tickMs ?? 10);
  kick();

  const names = [...(options.projections ?? []).map((p) => p.projection.name), ...(cognitionRunner ? [COGNITION_PROJECTION.name] : [])];

  async function pollApprovals(): Promise<number> {
    const authority = options.governance?.authority;
    if (!authority?.approvalState) return 0;
    const SYSTEM_ACTOR = system;
    let acted = 0;
    for (const record of await continuations.list({ status: "OPEN" })) {
      if (record.type !== "governance-approval") continue;
      const approvalId = (record.condition as { approvalId?: unknown } | null)?.approvalId;
      if (typeof approvalId !== "string") continue;
      const state = await authority.approvalState(approvalId);
      if (state === "approved") {
        // Idempotent per approval: a second pass (or a second runtime) cannot resume it twice.
        const outcome = await continuations.resume(record.id, { actor: SYSTEM_ACTOR, idempotencyKey: `governance-resume:${approvalId}`, input: { approvalId, state } });
        if (outcome.kind === "transitioned") acted++;
      } else if (state === "rejected" || state === "expired" || state === "used") {
        const outcome = await continuations.cancel(record.id, { actor: SYSTEM_ACTOR, idempotencyKey: `governance-close:${approvalId}`, reason: `approval ${approvalId} is ${state}` });
        if (outcome.kind === "transitioned") {
          acted++;
          void execute(record.runId).catch(() => {});
        }
      }
    }
    if (acted) kick();
    return acted;
  }

  let approvalTimer: ReturnType<typeof setInterval> | undefined;
  if ((options.governance?.approvalPollMs ?? 0) > 0 && options.governance?.authority?.approvalState) {
    approvalTimer = setInterval(() => void pollApprovals().catch(() => {}), options.governance.approvalPollMs);
  }

  async function quiescent(): Promise<boolean> {
    if (ticking || pending.size > 0 || chains.size > 0) return false;
    const now = Date.now();
    for (const topic of TOPICS) {
      const items = await store.listOutbox({ topic, status: "pending" });
      // Items waiting out a retry backoff do not count as queued work.
      if (items.some((item) => item.availableAt <= now || item.lastError === null)) return false;
    }
    for (const name of names) {
      const checkpoint = await store.getProjection(name);
      if (checkpoint?.status === "error") continue;
      const behind = await store.readAll({ afterPosition: checkpoint?.position ?? 0, limit: 1 });
      if (behind.length > 0) return false;
    }
    return true;
  }

  return {
    service: createService(core, new Set((options.projections ?? []).filter((p) => p.public).map((p) => p.projection.name))),
    kernel,
    store,

    inspect: (correlationId) => inspectCorrelation(store, continuations, correlationId),

    async rebuildCognition() {
      if (!options.cognition || !cognitionRunner) return;
      await options.cognition.index.clear();
      await cognitionRunner.rebuild();
    },

    async erase(eventId, reason, actor) {
      await store.erasePayload(eventId, reason, actor.id);
    },

    pollApprovals,

    async idle(timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        // Two consecutive quiet observations, so work kicked off between checks is not missed.
        if ((await quiescent()) && (await Bun.sleep(1), await quiescent())) return;
        if (Date.now() > deadline) throw new Error(`runtime-bun: idle() timed out after ${timeoutMs}ms`);
        kick();
        await Bun.sleep(2);
      }
    },

    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      if (approvalTimer) clearInterval(approvalTimer);
      await ticking;
      await Promise.allSettled([...chains.values()]);
      for (const runner of runners) await runner.stop();
      unregister();
      await kernel.shutdown("runtime closed");
      if (ownsStore) await store.close();
    },
  };
}
