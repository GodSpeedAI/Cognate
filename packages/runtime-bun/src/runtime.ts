// Composition root: store, kernel, continuations, artifacts, projections, cognition, and the background loop.
import { randomUUID } from "node:crypto";
import { ArtifactService } from "@godspeedai/cognate-artifacts";
import { ContinuationService } from "@godspeedai/cognate-continuations";
import { type DurableStore, type Json, NotFoundError, OutboxDispatcher } from "@godspeedai/cognate-events";
import { createCordisKernel } from "@godspeedai/cognate-kernel-cordis";
import type { Principal } from "@godspeedai/cognate-kernel-api";
import type { RunView } from "@godspeedai/cognate-runtime-api";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import { openPostgresStore, resolvePg0Url } from "@godspeedai/cognate-store-postgres";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { COGNITION_PROJECTION, cognitionProjection, recallFor } from "./cognition.ts";
import type { Core } from "./core.ts";
import { executeOnce } from "./executor.ts";
import { ExecutionSlots } from "./execution-slots.ts";
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
  const capacity=options.execution?.maxConcurrentRuns ?? 1;
  if(!Number.isInteger(capacity) || capacity<1 || capacity>64)throw new Error("execution.maxConcurrentRuns must be an integer between 1 and 64");
  if(capacity>1 && typeof options.execution?.resourceKeys!=="function")throw new Error("Concurrent execution requires an explicit execution.resourceKeys eligibility policy");
  if(capacity>1 && typeof options.store!=="string" && "store" in options.store){
    const injected=options.store.store;
    if(typeof injected.claimOutboxLeased!=="function" || typeof injected.renewOutboxLease!=="function" || typeof injected.settleOutboxLease!=="function"){
      throw new Error("Concurrent execution requires a store with complete fenced outbox lease support");
    }
  }
  const slots=new ExecutionSlots(capacity);
  // Recovery can enqueue many runs at once. Bound authoritative eligibility lookups with the
  // same primitive/capacity so metadata resolution cannot fan out without limit.
  const eligibilitySlots = new ExecutionSlots(capacity);
  // Run and resume topics share one pre-claim budget. ExecutionSlots separately enforces
  // run-local/resource exclusion for every execution path.
  let admittedDeliveries = 0;
  const deliveryAdmission = { tryAcquire(): (() => void) | undefined {
    if (admittedDeliveries >= capacity) return undefined;
    admittedDeliveries++;
    let released = false;
    return () => { if (!released) { released = true; admittedDeliveries--; } };
  } };
  // The runtime closes only stores it opened itself; an injected store is owned by its creator.
  // (The PostgreSQL store's close() ends its pool and LISTEN connection, so one call covers both.)
  const config = options.store;
  const ownsStore = typeof config === "string" || !("store" in config);
  let store: DurableStore;
  if (typeof config === "string") {
    store = openSqliteStore({ path: config });
  } else if ("store" in config) {
    store = config.store;
  } else if ("sqlite" in config) {
    store = openSqliteStore({ path: config.sqlite.path });
  } else if ("postgres" in config) {
    store = (await openPostgresStore({ url: config.postgres.url, schema: config.postgres.schema })).store;
  } else {
    const url = await resolvePg0Url(config.postgresPg0);
    store = (await openPostgresStore({ url, schema: config.postgresPg0.schema })).store;
  }
  const system: Principal = options.system ?? { id: "system", kind: "system" };
  const governor = new Governor(options.actions, options.policy, options.governance ?? { mode: "off" });
  const invoker = new Invoker(governor);
  // The kernel is single-tenant by contract; the invoker supplies each call's tenant to the policy.
  const kernel = await createCordisKernel({ tenant: "runtime", principal: system, policy: invoker.policy });
  await invoker.attach(kernel, options.components ?? []);

  // Authorization happens in the service against `actions`; the continuation layer trusts its caller.
  const continuations = new ContinuationService(store, { policy: { authorize: () => ({ allow: true, reason: "authorized by runtime service" }) }, delivery: DELIVERY, deliveryConcurrency: capacity, deliveryAdmission });

  let closed = false;
  const shutdown = new AbortController();
  const executionControllers = new Map<string, AbortController>();
  const acquireExecutionSlot = async (runId: string, view: RunView): Promise<(() => void) | undefined> => {
    const resolveKeys = options.execution?.resourceKeys;
    const controller = new AbortController();
    const signal = controller.signal;
    executionControllers.set(runId, controller);
    const abortForShutdown = () => controller.abort(new Error("runtime closed"));
    if (shutdown.signal.aborted) abortForShutdown();
    else shutdown.signal.addEventListener("abort", abortForShutdown, { once: true });
    let onAbort!: () => void;
    const aborted = new Promise<{ readonly kind: "aborted" }>((resolve) => {
      onAbort = () => resolve({ kind: "aborted" });
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    let releaseEligibility: (() => void) | undefined;
    try {
      const current = foldRun(runId, await store.readStream(runStream(runId)));
      if (closed || signal.aborted || !current || isTerminal(current)) return undefined;
      let keys: readonly string[] = [];
      if (resolveKeys) {
        // A cancelled waiter may still be in this semaphore queue. Attach a release handler now so
        // its eventual permit is returned even when the abort race lets execute() stop waiting.
        const acquisition = eligibilitySlots.acquire([]).then((release) => {
          if (closed || signal.aborted) { release(); return undefined; }
          releaseEligibility = release;
          return release;
        });
        const admitted = await Promise.race([acquisition, aborted]);
        if (!admitted || closed || signal.aborted) return undefined;
        // A callback that ignores cancellation may settle later, but its eventual rejection remains
        // observed by this handler after the abort race has returned.
        const lookup = Promise.resolve().then(async () => {
          if (closed || signal.aborted) return { kind: "aborted" as const };
          try { return { kind: "keys" as const, keys: await resolveKeys(view, signal) }; }
          catch (error) { return { kind: "error" as const, error }; }
        });
        const result = await Promise.race([lookup, aborted]);
        if (result.kind === "aborted") {
          // Cancellation releases the caller immediately, but an uncancellable policy callback
          // still occupies a real lookup slot until it settles. The outcome union observes late
          // rejection, and the queued release preserves the configured concurrency bound.
          const release = releaseEligibility;
          releaseEligibility = undefined;
          void lookup.then(() => release?.());
          return undefined;
        }
        if (result.kind === "error") throw result.error;
        if (!Array.isArray(result.keys)) throw new Error("execution.resourceKeys must resolve to an array");
        keys = result.keys;
      }
      // Keep the run controller registered until both policy and execution-slot admission finish.
      // If cancellation wins while queued, a later grant is immediately returned by this handler.
      const acquisition = slots.acquire(keys).then((release) => {
        if (closed || signal.aborted) { release(); return undefined; }
        return release;
      });
      return await Promise.race([acquisition, aborted.then(() => undefined)]);
    } finally {
      signal.removeEventListener("abort", onAbort);
      shutdown.signal.removeEventListener("abort", abortForShutdown);
      releaseEligibility?.();
      if (executionControllers.get(runId) === controller) executionControllers.delete(runId);
    }
  };
  const chains = new Map<string, Promise<void>>();
  const pending = new Set<string>();
  // A runtime epoch gives recovery attempts fresh durable intent IDs after prior intents have
  // already been delivered. Existing pending run.execute intents retain their persisted backoff.
  const recoveryEpoch = randomUUID();
  let recoverySequence = 0;
  const recoveryReconciliationIntervalMs = 250;
  let nextRecoveryReconciliationAt = 0;
  const recoveryOutboxByRun = new Map<string, string>();
  const deliveries = new Set<Promise<void>>();
  const trackDelivery=(job:Promise<unknown>):void=>{
    const tracked=job.then(()=>{},()=>{}).finally(()=>deliveries.delete(tracked));
    deliveries.add(tracked);
  };
  const execute = (runId: string): Promise<void> => {
    const next = (chains.get(runId) ?? Promise.resolve()).then(async () => {
      const view=foldRun(runId,await store.readStream(runStream(runId)));
      if(closed || !view || isTerminal(view))return;
      const release=await acquireExecutionSlot(runId, view);
      if (!release) return;
      try{
        if (closed) return;
        for (let attempt = 0; attempt < 5 && !closed; attempt++) if ((await executeOnce(core, runId)) === "done") return;
      }finally{release();}
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
    controllers: executionControllers,
    shutdownSignal: shutdown.signal,
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
    concurrency: capacity,
    admission: deliveryAdmission,
    backoff: DELIVERY,
    deliver: async (item) => {
      const runId = (item.payload as { runId: string }).runId;
      try {
        await execute(runId);
        return { executed: true };
      } finally {
        // The store retains pending retry/poison state; this map only correlates this process's
        // currently delivered recovery intent and must not retain failed or exhausted attempts.
        if (recoveryOutboxByRun.get(runId) === item.id) recoveryOutboxByRun.delete(runId);
      }
    },
  });

  async function persistRecoveryIntents(): Promise<void> {
    // Reconcile only when a new recovery candidate exists. A tracked intent already has a
    // durable retry schedule; rescanning the complete pending topic every timer tick is needless.
    if (pending.size === 0) return;
    const now = performance.now();
    if (now < nextRecoveryReconciliationAt) return;
    // Set the deadline before awaiting: a slow or failing store query must not hot-loop scans.
    nextRecoveryReconciliationAt = now + recoveryReconciliationIntervalMs;
    const pendingItems = await store.listOutbox({ topic: RUN_EXECUTE_TOPIC, status: "pending" });
    const pendingItemIds = new Set(pendingItems.map((item) => item.id));
    for (const [runId, id] of recoveryOutboxByRun) {
      if (pendingItemIds.has(id)) pending.delete(runId);
      else recoveryOutboxByRun.delete(runId);
    }
    const candidates = [...pending].filter((runId) => !recoveryOutboxByRun.has(runId)).slice(0, 100);
    if (candidates.length === 0) return;
    const pendingRunItems = new Map<string, string>();
    for (const item of pendingItems) {
      const runId = (item.payload as { runId?: unknown } | null)?.runId;
      if (typeof runId === "string" && !pendingRunItems.has(runId)) pendingRunItems.set(runId, item.id);
    }
    const intents: { id: string; topic: string; payload: Json }[] = [];
    const selected = new Map<string, string>();
    for (const runId of candidates) {
      const existing = pendingRunItems.get(runId);
      const id = existing ?? `${RUN_EXECUTE_TOPIC}:recovery:${recoveryEpoch}:${++recoverySequence}:${runId}`;
      selected.set(runId, id);
      if (!existing) intents.push({ id, topic: RUN_EXECUTE_TOPIC, payload: { runId } });
    }
    if (intents.length > 0) await store.commit({ appends: [], outbox: intents });
    for (const [runId, id] of selected) {
      recoveryOutboxByRun.set(runId, id);
      pending.delete(runId);
    }
  }

  let resumeFirst = false;
  async function tick(): Promise<void> {
    for (const record of await continuations.expireDue()) pending.add(record.runId);
    await persistRecoveryIntents();
    // Dispatchers reserve a bounded set of slots across overlapping drains. A new runnable
    // arrival can fill a free slot while an earlier long-running delivery is still executing.
    // Rotate priority: even an empty topic briefly reserves capacity while its claim is
    // in flight. A fixed first topic could otherwise starve the other at capacity one.
    if (resumeFirst) {
      trackDelivery(continuations.dispatchResumes());
      trackDelivery(runDispatcher.drain());
    } else {
      trackDelivery(runDispatcher.drain());
      trackDelivery(continuations.dispatchResumes());
    }
    resumeFirst = !resumeFirst;
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
      // A resume delivery can be acknowledged during shutdown before run.resumed is appended.
      // Re-enter closed waits, including RESUMED, even when their outbox receipt is delivered.
      // The run-local execution chain and recorded wait result make duplicate delivery harmless.
      if (record && !["OPEN", "BLOCKED"].includes(record.status)) pending.add(id);
    }
  }

  // ── Erasure propagation (spec §32, DEBT-014) ─────────────────────────────────────
  // Erasing one event must also reach its derived copies: idempotency result snapshots (redacted by
  // the store's erasePayload itself), continuation records and their transition events, run.resumed
  // resolution copies on the run stream, and recorded run.recall results referencing the erased
  // run's view. Every erasure is recorded as a durable job before it runs, so an interrupted
  // propagation resumes on the next erase call or runtime start instead of being reported complete.
  const ERASURES = "erasures";

  interface ErasureJob {
    readonly id: string;
    readonly streamId: string | null;
    readonly runId: string | null;
    readonly eventType: string | null;
    readonly reason: string;
  }

  async function propagateErasure(job: ErasureJob): Promise<void> {
    const event = await store.getEvent(job.id);
    if (event && !event.erasure) await store.erasePayload(job.id, job.reason, "erasure");
    if (!job.runId) return;
    await continuations.redactForRun(job.runId, { reason: job.reason });
    // run.resumed events carry the resolution-input copy on the run stream itself.
    for (const e of await store.readStream(runStream(job.runId))) {
      if (e.eventType === "run.resumed" && !e.erasure) await store.erasePayload(e.eventId, job.reason, "erasure");
    }
    // A recorded run.recall whose items reference an erased run's view copies that view's source
    // content (run.started input, run.completed output). Lineage is explicit (sourceRef), not a text
    // guess. The closure is transitive: a recalling run's own terminal output may embed the recalled
    // result (the agent returned it), and a third run may have recalled THAT view — so each erased
    // terminal output makes its run a view source too. Visited runs terminate the loop.
    if (job.eventType !== "run.started" && job.eventType !== "run.completed") return;
    const viewSources: string[] = [job.runId];
    const visited = new Set<string>();
    while (viewSources.length > 0) {
      const sourceRunId = viewSources.shift()!;
      if (visited.has(sourceRunId)) continue;
      visited.add(sourceRunId);
      let afterPosition = 0;
      for (;;) {
        const page = await store.readAll({ afterPosition, limit: 500 });
        if (page.length === 0) break;
        for (const e of page) {
          afterPosition = e.position;
          if (e.eventType !== "run.recall" || e.erasure || !e.runId) continue;
          const items = (e.payload as { readonly result?: { readonly items?: readonly { readonly sourceRef?: string }[] } } | null)?.result?.items;
          if (!Array.isArray(items) || !items.some((item) => item.sourceRef === `run:${sourceRunId}`)) continue;
          await store.erasePayload(e.eventId, job.reason, "erasure");
          // The recalling run's terminal output may embed the recalled content; erase it and treat
          // that run as a view source for its own recallers.
          for (const terminal of await store.readStream(runStream(e.runId))) {
            if ((terminal.eventType === "run.completed" || terminal.eventType === "run.failed") && !terminal.erasure) {
              await store.erasePayload(terminal.eventId, job.reason, "erasure");
            }
          }
          viewSources.push(e.runId);
        }
        if (page.length < 500) break;
      }
    }
  }

  async function completeErasureJob(job: { readonly id: string; readonly version: number; readonly value: Record<string, Json> }): Promise<void> {
    await store.commit({
      appends: [],
      records: [{ collection: ERASURES, id: job.id, expectedVersion: job.version, value: { ...job.value, status: "complete", completedAt: new Date().toISOString() } }],
    });
  }

  async function resumeErasureJobs(): Promise<void> {
    for (const stored of await store.listRecords(ERASURES, { status: "propagating" })) {
      const value = stored.value;
      await propagateErasure({
        id: stored.id,
        streamId: (value.streamId as string | null) ?? null,
        runId: (value.runId as string | null) ?? null,
        eventType: (value.eventType as string | null) ?? null,
        reason: value.reason as string,
      });
      await completeErasureJob(stored);
    }
  }

  async function eraseWithPropagation(eventId: string, reason: string, actor: Principal): Promise<void> {
    await resumeErasureJobs();
    const target = await store.getEvent(eventId);
    if (!target) throw new NotFoundError(`event ${eventId} not found`);
    let job = await store.getRecord(ERASURES, eventId);
    if (!job) {
      await store.commit({
        appends: [],
        records: [{ collection: ERASURES, id: eventId, expectedVersion: 0, value: { status: "propagating", reason, actorId: actor.id, streamId: target.streamId, runId: target.runId, eventType: target.eventType, startedAt: new Date().toISOString() } }],
      });
      job = await store.getRecord(ERASURES, eventId);
    }
    if (!job) throw new Error(`erase: could not record the propagation job for ${eventId}`);
    await propagateErasure({ id: eventId, streamId: target.streamId, runId: target.runId, eventType: target.eventType, reason });
    await completeErasureJob(job);
  }

  await resumeErasureJobs();

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
    if (ticking || pending.size > 0 || chains.size > 0 || deliveries.size>0) return false;
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
      await eraseWithPropagation(eventId, reason, actor);
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
      shutdown.abort();
      clearInterval(timer);
      if (approvalTimer) clearInterval(approvalTimer);
      await ticking;
      await Promise.allSettled([...deliveries]);
      await Promise.allSettled([...chains.values()]);
      for (const runner of runners) await runner.stop();
      unregister();
      await kernel.shutdown("runtime closed");
      if (ownsStore) await store.close();
    },
  };
}
