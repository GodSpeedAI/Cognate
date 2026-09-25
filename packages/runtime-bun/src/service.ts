// In-process RuntimeService (ADR-0011): authorization, tenancy, and typed errors over the durable core.
import { randomUUID } from "node:crypto";
import type { ContinuationRecord, TransitionOutcome } from "@cognate/continuations";
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, type Json, type StoredEvent } from "@cognate/events";
import { applyStateUpdate, type Caller, type ContinuationView, foldState, type RunView, type RuntimeService, ServiceError, type ServiceErrorCode, StatePatchError } from "@cognate/runtime-api";
import type { Core } from "./core.ts";
import { foldRun, isTerminal, RUN_EXECUTE_TOPIC, RUNS, runStateStream, runStream, toJson } from "./fold.ts";

const PAGE = 500;

export function createService(core: Core, publicProjections: ReadonlySet<string>): RuntimeService {
  const { store } = core;

  const authorize = (caller: Caller, action: "run.start" | "run.cancel" | "continuation.resume" | "continuation.cancel" | "run.state.update", resource: string) => {
    const decision = core.actions.authorize({ caller, action, resource });
    if (!decision.allow) throw new ServiceError("permission_denied", decision.reason);
  };

  async function readRun(caller: Caller, runId: string): Promise<{ view: RunView; events: StoredEvent[] }> {
    const events = await store.readStream(runStream(runId));
    const view = foldRun(runId, events);
    if (!view || view.tenant !== caller.tenant) throw new ServiceError("not_found", `run ${runId} not found`);
    return { view, events };
  }

  async function continuationFor(caller: Caller, id: string): Promise<ContinuationRecord> {
    const record = await core.continuations.get(id);
    if (!record || record.tenant !== caller.tenant) throw new ServiceError("not_found", `continuation ${id} not found`);
    return record;
  }

  return {
    async startRun(caller, request) {
      authorize(caller, "run.start", request.agent);
      const agent = core.agents.get(request.agent);
      if (!agent) throw new ServiceError("not_found", `agent ${request.agent} not found`);
      const runId = randomUUID();
      const correlationId = request.correlationId ?? randomUUID();
      const occurredAt = new Date().toISOString();
      try {
        const outcome = await store.commit({
          idempotency: {
            scope: `${caller.tenant}:${caller.actor.id}:run.start`,
            key: request.idempotencyKey,
            // `state` is part of the fingerprint: reusing a key with a different seed is a different request.
            fingerprint: fingerprint({ agent: request.agent, input: request.input, correlationId: request.correlationId ?? null, state: request.state ?? null }),
          },
          appends: [
            {
              streamId: runStream(runId),
              expectedVersion: 0,
              events: [
                {
                  eventType: "run.started",
                  schemaVersion: 1,
                  occurredAt,
                  tenant: caller.tenant,
                  correlationId,
                  causationId: null,
                  runId,
                  scopeId: core.scopeId,
                  payload: { input: request.input },
                  metadata: { agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind },
                },
              ],
            },
            // Caller-seeded state, committed atomically with `run.started` on the state stream so the
            // agent's first `ctx.state()` read (even before suspending) always sees it (spec §29.1).
            ...(request.state !== undefined
              ? [
                  {
                    streamId: runStateStream(runId),
                    expectedVersion: 0,
                    events: [
                      {
                        eventType: "state.changed",
                        schemaVersion: 1,
                        occurredAt,
                        tenant: caller.tenant,
                        correlationId,
                        causationId: null,
                        runId,
                        scopeId: core.scopeId,
                        payload: { snapshot: request.state },
                        metadata: { source: "caller", actor: caller.actor.id },
                      },
                    ],
                  },
                ]
              : []),
          ],
          records: [{ collection: RUNS, id: runId, expectedVersion: 0, value: { tenant: caller.tenant, agent: agent.id, correlationId, startedBy: caller.actor.id, scopeId: core.scopeId } }],
          outbox: [{ id: `${RUN_EXECUTE_TOPIC}:${runId}`, topic: RUN_EXECUTE_TOPIC, payload: { runId } }],
          result: { runId },
        });
        core.kick();
        return (await readRun(caller, (outcome.result as { runId: string }).runId)).view;
      } catch (error) {
        if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
        throw error;
      }
    },

    async getRun(caller, request) {
      return (await readRun(caller, request.runId)).view;
    },

    async cancelRun(caller, request) {
      authorize(caller, "run.cancel", request.runId);
      for (let attempt = 0; attempt < 5; attempt++) {
        const { view, events } = await readRun(caller, request.runId);
        if (isTerminal(view)) return view;
        try {
          await store.commit({
            idempotency: { scope: `${caller.tenant}:${caller.actor.id}:run.cancel`, key: request.idempotencyKey, fingerprint: fingerprint({ runId: request.runId, reason: request.reason }) },
            appends: [
              {
                streamId: runStream(request.runId),
                expectedVersion: events.length,
                events: [
                  {
                    eventType: "run.cancelled",
                    schemaVersion: 1,
                    occurredAt: new Date().toISOString(),
                    tenant: view.tenant,
                    correlationId: view.correlationId,
                    causationId: events.at(-1)!.eventId,
                    runId: request.runId,
                    scopeId: events[0]!.scopeId,
                    payload: { reason: request.reason },
                    metadata: { cancelledBy: caller.actor.id },
                  },
                ],
              },
            ],
            result: { runId: request.runId },
          });
        } catch (error) {
          if (error instanceof ConcurrencyError) continue;
          if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
          throw error;
        }
        break;
      }
      core.controllers.get(request.runId)?.abort(new Error("run cancelled"));
      for (const c of await core.continuations.list({ runId: request.runId, status: "OPEN" })) {
        await core.continuations.cancel(c.id, { actor: caller.actor, idempotencyKey: `run.cancel:${request.idempotencyKey}:${c.id}`, reason: request.reason });
      }
      return (await readRun(caller, request.runId)).view;
    },

    events(caller, request) {
      return eventStream(core, caller, request);
    },

    async listContinuations(caller, request) {
      const records = await core.continuations.list({ tenant: caller.tenant, ...(request.runId ? { runId: request.runId } : {}), ...(request.status ? { status: request.status } : {}) });
      return records.map(continuationView);
    },

    async resolveContinuation(caller, request) {
      const record = await continuationFor(caller, request.continuationId);
      authorize(caller, request.action === "resume" ? "continuation.resume" : "continuation.cancel", request.continuationId);
      const action = { actor: caller.actor, idempotencyKey: request.idempotencyKey, ...(request.expectedVersion !== undefined ? { expectedVersion: request.expectedVersion } : {}) };
      const outcome: TransitionOutcome =
        request.action === "resume"
          ? await core.continuations.resume(record.id, { ...action, input: request.input ?? null })
          : await core.continuations.cancel(record.id, { ...action, reason: request.reason ?? "cancelled" });
      switch (outcome.kind) {
        case "transitioned":
        case "duplicate":
        case "already_terminal":
          // A cancelled wait fails the run with ContinuationClosedError on re-entry; a resume is delivered via the outbox.
          if (outcome.kind === "transitioned" && request.action === "cancel") void core.execute(record.runId).catch(() => {});
          core.kick();
          return { outcome: outcome.kind, continuation: continuationView(outcome.record) };
        case "denied":
          throw new ServiceError("permission_denied", outcome.reason);
        case "version_mismatch":
          throw new ServiceError("failed_precondition", `continuation ${record.id} is at version ${outcome.record.version}`);
        case "not_found":
          throw new ServiceError("not_found", `continuation ${record.id} not found`);
      }
    },

    async invoke(caller, request) {
      const outcome = await core.invoker.invoke({
        capability: request.capability,
        input: request.input,
        tenant: caller.tenant,
        context: {
          actor: caller.actor,
          correlationId: request.correlationId ?? randomUUID(),
          ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
          ...(request.deadline !== undefined ? { deadline: request.deadline } : {}),
        },
      });
      if (outcome.ok) return outcome.value;
      const kind = outcome.failure!.kind;
      const codes: Record<string, ServiceErrorCode> = { denied: "permission_denied", unavailable: "unavailable", deadline_exceeded: "deadline_exceeded", cancelled: "unavailable", failed: "failed_precondition" };
      throw new ServiceError(codes[kind] ?? "failed_precondition", `invocation of ${request.capability} failed: ${JSON.stringify(outcome.failure)}`);
    },

    async getArtifact(caller, request) {
      const result = await core.artifacts.get(request.artifactId, caller.actor, caller.tenant, request.representation);
      switch (result.kind) {
        case "ok":
          return { id: result.record.id, name: result.record.name, mediaType: result.record.mediaType, contentHash: result.record.contentHash, bytes: result.bytes };
        case "lost":
          throw new ServiceError("unavailable", `artifact ${request.artifactId} bytes are missing`);
        default:
          // Denied and tombstoned artifacts are indistinguishable from absent ones to the caller (spec §32).
          throw new ServiceError("not_found", `artifact ${request.artifactId} not found`);
      }
    },

    async readProjection(caller, request) {
      if (!publicProjections.has(request.name)) throw new ServiceError("not_found", `projection ${request.name} not found`);
      // Public projections are tenant-partitioned by key prefix `<tenant>/` (spec §32); an empty
      // partition is [] so the caller cannot tell whether other tenants have data.
      const prefix = `${caller.tenant}/`;
      return (await store.listProjection(request.name)).filter((e) => e.key.startsWith(prefix)).map((e) => ({ key: e.key.slice(prefix.length), value: e.value }));
    },

    async listRuns(caller, request) {
      const where: { [field: string]: string } = { tenant: caller.tenant };
      if (request.correlationId !== undefined) where.correlationId = request.correlationId;
      if (request.agent !== undefined) where.agent = request.agent;
      const records = await store.listRecords(RUNS, where);
      // Ordered by each run's `run.started` store position (the store-wide commit order, spec §10) — exact
      // and contention-free, unlike a counter bumped on every startRun. One indexed stream read per matched
      // run (not an event-log scan): `readStream(..., { limit: 1 })` reads only the first event.
      const withPosition = await Promise.all(
        records.map(async (record) => {
          const [started] = await store.readStream(runStream(record.id), { limit: 1 });
          return { runId: record.id, position: started?.position ?? 0 };
        }),
      );
      withPosition.sort((a, b) => a.position - b.position);
      const views: RunView[] = [];
      for (const { runId } of withPosition) views.push((await readRun(caller, runId)).view);
      return views;
    },

    async updateState(caller, request) {
      authorize(caller, "run.state.update", request.runId);
      const stateStreamId = runStateStream(request.runId);
      for (let attempt = 0; attempt < 5; attempt++) {
        const { view, events } = await readRun(caller, request.runId);
        if (isTerminal(view)) throw new ServiceError("failed_precondition", `run ${request.runId} is terminal`);
        const stateEvents = await store.readStream(stateStreamId);
        const currentVersion = stateEvents.length;
        if (request.expectedVersion !== undefined && request.expectedVersion !== currentVersion) {
          throw new ServiceError("failed_precondition", `run ${request.runId} state is at version ${currentVersion}`);
        }
        const currentState = foldState([...events, ...stateEvents]);
        let nextState: Json;
        try {
          nextState = applyStateUpdate(currentState, request.update);
        } catch (error) {
          if (error instanceof StatePatchError) throw new ServiceError("invalid_argument", error.message);
          throw error;
        }
        try {
          const outcome = await store.commit({
            idempotency: {
              scope: `${caller.tenant}:${caller.actor.id}:run.state.update`,
              key: request.idempotencyKey,
              fingerprint: fingerprint({ runId: request.runId, update: toJson(request.update), expectedVersion: request.expectedVersion ?? null }),
            },
            appends: [
              {
                streamId: stateStreamId,
                expectedVersion: currentVersion,
                events: [
                  {
                    eventType: "state.changed",
                    schemaVersion: 1,
                    occurredAt: new Date().toISOString(),
                    tenant: view.tenant,
                    correlationId: view.correlationId,
                    causationId: stateEvents.at(-1)?.eventId ?? events.at(-1)!.eventId,
                    runId: request.runId,
                    scopeId: events[0]!.scopeId,
                    payload: toJson(request.update),
                    metadata: { source: "caller", actor: caller.actor.id },
                  },
                ],
              },
            ],
            result: { state: nextState, version: currentVersion + 1 },
          });
          return outcome.result as { state: Json; version: number };
        } catch (error) {
          if (error instanceof ConcurrencyError) continue;
          if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
          throw error;
        }
      }
      throw new ServiceError("unavailable", `too much contention updating state for run ${request.runId}`);
    },
  };
}

function continuationView(record: ContinuationRecord): ContinuationView {
  return { id: record.id, runId: record.runId, type: record.type, status: record.status, condition: record.condition, payload: record.payload, version: record.version, expiresAt: record.expiresAt };
}

/** Catch up from `afterPosition`, then (when following) switch to live commits without gaps or duplicates. */
async function* eventStream(core: Core, caller: Caller, request: { readonly afterPosition?: number; readonly runId?: string; readonly signal?: AbortSignal; readonly follow?: boolean }): AsyncGenerator<StoredEvent> {
  const visible = (e: StoredEvent) => e.tenant === caller.tenant && (request.runId === undefined || e.runId === request.runId);
  const signal = request.signal;
  let position = request.afterPosition ?? 0;

  // Subscribe before catching up so nothing committed in between is missed; dedupe by position.
  const buffer: StoredEvent[] = [];
  let wake: (() => void) | undefined;
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const unsubscribe = request.follow ? core.store.onCommitted((events) => (buffer.push(...events), notify())) : () => {};
  signal?.addEventListener("abort", notify, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) return;
      const page = await core.store.readAll({ afterPosition: position, limit: PAGE });
      for (const event of page) {
        position = event.position;
        if (visible(event)) yield event;
        if (signal?.aborted) return;
      }
      if (page.length < PAGE) break;
    }
    if (!request.follow) return;
    for (;;) {
      if (signal?.aborted) return;
      if (buffer.length === 0) {
        await new Promise<void>((resolve) => (wake = resolve));
        continue;
      }
      const next = buffer.shift()!;
      if (next.position <= position) continue;
      position = next.position;
      if (visible(next)) yield next;
    }
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", notify);
  }
}

