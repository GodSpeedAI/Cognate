// In-process RuntimeService (ADR-0011): authorization, tenancy, and typed errors over the durable core.
import { randomUUID } from "node:crypto";
import type { ContinuationRecord, TransitionOutcome } from "@godspeedai/cognate-continuations";
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, readProjectionSnapshot, RecordConflictError, type Json, type StoredEvent } from "@godspeedai/cognate-events";
import { applyStateUpdate, AssignmentRefusedError, caseContextIssues, type Caller, spendOf, validateAssignment, type ContinuationView, foldState, type ObservationInput, type ObservationView, type RunView, type RuntimeService, ServiceError, type ServiceErrorCode, StatePatchError } from "@godspeedai/cognate-runtime-api";
import { acceptLifecycleEvent, finalizeStoppedRun, APPEND_MAX_ATTEMPTS, appendBackoffMs, assignmentMetadata, ASSIGNMENTS, foldAssignment, lifecycleEvent, readLifecycle } from "./assignment.ts";
import type { Core } from "./core.ts";
import type { ActionName } from "./governed-operation.ts";
import { assignmentControlStream, foldRun, isTerminal, observationStream, RUN_EXECUTE_TOPIC, RUNS, runStateStream, runStream, threadStateStream, toJson } from "./fold.ts";

const PAGE = 500;

export function createService(core: Core, publicProjections: ReadonlySet<string>): RuntimeService {
  const { store } = core;

  const authorize = async (caller: Caller, action: ActionName, resource: string): Promise<void> => {
    const decision = await core.governor.govern({ kind: "action", action, caller, resource });
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
      await authorize(caller, "run.start", request.agent);
      const agent = core.agents.get(request.agent);
      if (!agent) throw new ServiceError("not_found", `agent ${request.agent} not found`);
      // WP-23: an assignment implies the case context (it fills episodeRef and assignmentId) and must agree with it.
      let caseContext = request.caseContext;
      const assignment = request.assignment;
      if (assignment) {
        const checked = validateAssignment(assignment);
        if (!checked.ok) {
          const detail = checked.issues.map((i) => `${i.pointer || "/"} ${i.message}`).join("; ");
          if (checked.code) throw new AssignmentRefusedError(checked.code, detail);
          throw new ServiceError("invalid_argument", `invalid assignment: ${detail}`);
        }
        if (!caseContext) throw new ServiceError("invalid_argument", "an assignment needs caseContext: worldRef, semanticRef, role and kind are not part of the assignment");
        if (caseContext.caseId !== assignment.case_id || caseContext.planItemId !== assignment.step_id) throw new AssignmentRefusedError("ASSIGNMENT_ID_INVALID", `caseContext ${caseContext.caseId}/${caseContext.planItemId} disagrees with the assignment ${assignment.case_id}/${assignment.step_id}`);
        if (caseContext.episodeRef !== undefined && caseContext.episodeRef !== assignment.episode_ref) throw new AssignmentRefusedError("ASSIGNMENT_EPISODE_CHANGED", `caseContext names ${caseContext.episodeRef}, the assignment is bound to ${assignment.episode_ref}`);
        if (caseContext.assignmentId !== undefined && caseContext.assignmentId !== assignment.assignment_id) throw new AssignmentRefusedError("ASSIGNMENT_ID_INVALID", `caseContext carries ${caseContext.assignmentId}, the assignment is ${assignment.assignment_id}`);
        if (request.linkExpiresAt !== undefined && Number.isNaN(Date.parse(request.linkExpiresAt))) throw new ServiceError("invalid_argument", "linkExpiresAt must be a UTC timestamp");
        caseContext = { ...caseContext, episodeRef: assignment.episode_ref, assignmentId: assignment.assignment_id };
      } else if (request.linkExpiresAt !== undefined) throw new ServiceError("invalid_argument", "linkExpiresAt needs an assignment");
      if (caseContext) {
        const issues = caseContextIssues(caseContext);
        if (issues.length) throw new ServiceError("invalid_argument", `invalid caseContext: ${issues.join("; ")}`);
      }
      const runId = randomUUID();
      const correlationId = request.correlationId ?? randomUUID();
      const occurredAt = new Date().toISOString();
      const startedMetadata = {
        agent: agent.id, agentVersion: agent.version, startedBy: caller.actor.id, startedByKind: caller.actor.kind,
        ...(caseContext ? { caseContext: { ...caseContext, principal: caller.actor.id } as unknown as Json } : {}),
        // The brief is content: it goes in the erasable `run.started` payload, never metadata (see assignmentOf).
        ...(assignment ? { assignment: (({ brief: _brief, ...binding }) => binding)(assignment) as unknown as Json, ...(request.linkExpiresAt !== undefined ? { linkExpiresAt: request.linkExpiresAt } : {}) } : {}),
      };
      // Pre-assign the id so the outbox hook can derive intents that commit atomically with the event (same path as executor events).
      const startedEvent = {
        eventType: "run.started",
        schemaVersion: 1,
        occurredAt,
        tenant: caller.tenant,
        correlationId,
        causationId: null,
        runId,
        scopeId: core.scopeId,
        payload: { input: request.input, ...(assignment ? { assignmentBrief: assignment.brief as unknown as Json } : {}) },
        metadata: startedMetadata,
      };
      const startedId = randomUUID();
      // The assignment's own sequence starts with the run: `issued` (as received) then `started`, spend all 0.
      const lifecycle = assignment
        ? (() => {
            const issued = lifecycleEvent(assignment, "issued", assignment.issued_at, spendOf(0));
            const began = lifecycleEvent(assignment, "started", occurredAt, spendOf(0));
            const afterIssued = acceptLifecycleEvent(undefined, assignment, issued);
            acceptLifecycleEvent({ runId, assignment, status: afterIssued.status!, spend: spendOf(0), acceptedSpend: spendOf(0), events: [issued] }, assignment, began);
            const ids = [randomUUID(), randomUUID()];
            return [issued, began].map((payload, i) => ({
              ...startedEvent,
              eventId: ids[i]!,
              eventType: `assignment.${payload.event}`,
              occurredAt: payload.at,
              causationId: i === 0 ? startedId : ids[0]!,
              payload: payload as unknown as Json,
              metadata: { ...(caseContext ? { caseContext: startedMetadata.caseContext } : {}), ...assignmentMetadata(payload.event) },
            }));
          })()
        : [];
      try {
        const outcome = await store.commit({
          idempotency: {
            scope: `${caller.tenant}:${caller.actor.id}:run.start`,
            key: request.idempotencyKey,
            // `state` is part of the fingerprint: reusing a key with a different seed is a different request.
            fingerprint: fingerprint({ agent: request.agent, input: request.input, correlationId: request.correlationId ?? null, state: request.state ?? null, ...(request.caseContext ? { caseContext: request.caseContext as unknown as Json } : {}), ...(assignment ? { assignment: assignment as unknown as Json, linkExpiresAt: request.linkExpiresAt ?? null } : {}) }),
          },
          appends: [
            {
              streamId: runStream(runId),
              expectedVersion: 0,
              events: [{ ...startedEvent, eventId: startedId }, ...lifecycle],
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
          records: [
            { collection: RUNS, id: runId, expectedVersion: 0, value: { tenant: caller.tenant, agent: agent.id, correlationId, startedBy: caller.actor.id, scopeId: core.scopeId } },
            // One run per assignment id (README section 11: a k already issued is ASSIGNMENT_ID_INVALID); a resume
            // uses resumeAssignment on the run, it does not start another one.
            ...(assignment ? [{ collection: ASSIGNMENTS, id: `${encodeURIComponent(caller.tenant)}/${assignment.assignment_id}`, expectedVersion: 0, value: { runId } }] : []),
          ],
          outbox: [
            { id: `${RUN_EXECUTE_TOPIC}:${runId}`, topic: RUN_EXECUTE_TOPIC, payload: { runId } },
            ...core.outboxFor({ ...startedEvent, eventId: startedId, streamId: runStream(runId), recordedAt: occurredAt, streamSequence: 1 }),
            ...lifecycle.flatMap((event, i) => core.outboxFor({ ...event, streamId: runStream(runId), recordedAt: event.occurredAt, streamSequence: i + 2 })),
          ],
          result: { runId },
        });
        core.kick();
        return (await readRun(caller, (outcome.result as { runId: string }).runId)).view;
      } catch (error) {
        if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
        if (assignment && error instanceof RecordConflictError) throw new AssignmentRefusedError("ASSIGNMENT_ID_INVALID", `${assignment.assignment_id} was already issued to a run; resume it, or take a new k`);
        throw error;
      }
    },

    async getRun(caller, request) {
      return (await readRun(caller, request.runId)).view;
    },

    async cancelRun(caller, request) {
      await authorize(caller, "run.cancel", request.runId);
      // Bounded retries with the same jittered backoff as the assignment controls (DEBT-033); a cancel that cannot commit
      // is refused, never reported as done, and leaves the run (and its executing pass) untouched.
      let committed = false;
      for (let attempt = 0; attempt < APPEND_MAX_ATTEMPTS; attempt++) {
        await readRun(caller, request.runId);
        const { events, control } = await readLifecycle(core, request.runId);
        const view = foldRun(request.runId, events)!;
        // Already ended (possibly by the executor or a breach, or after losing a race here): abort the stale pass and report.
        if (isTerminal(view)) {
          core.controllers.get(request.runId)?.abort(new Error("run ended"));
          return view;
        }
        // The assignment already ended without the run (a budget stop not yet finalized, or a legacy crash state): the run
        // finishes the way the assignment did, it is not overridden by this cancel.
        const ended = foldAssignment(request.runId, events, control);
        if (ended && ended.status === "failed" && ended.budgetExceeded) {
          // Finish the run as the budget stop; abort the local pass only once that is durable, so a finalization that
          // cannot commit (it throws unavailable) leaves the pass running and the cancel retryable.
          await finalizeStoppedRun(core, request.runId, caller.actor);
          core.controllers.get(request.runId)?.abort(new Error("assignment ended"));
          return (await readRun(caller, request.runId)).view;
        }
        if (ended && (ended.status === "failed" || ended.status === "completed")) {
          // A legacy crash state: the assignment ended on the run stream, the run did not. The run is finished by its own
          // pass (it recomputes the real output, or fails honestly), not forced from here: the cancel is refused as
          // terminal and the pass is nudged so recovery does not wait for a restart.
          void core.execute(request.runId).catch(() => {});
          core.kick();
          throw new ServiceError("failed_precondition", `assignment ${ended.assignment.assignment_id} already ${ended.status}; run ${request.runId} is being finished`);
        }
        const caseContext = (events[0]!.metadata as { [key: string]: Json } | null | undefined)?.caseContext;
        const cancelledId = randomUUID();
        const assignmentView = foldAssignment(request.runId, events, control);
        const cancelledAssignment = assignmentView && !["completed", "failed", "cancelled"].includes(assignmentView.status)
          ? (() => {
              const payload = lifecycleEvent(assignmentView.assignment, "cancelled", new Date().toISOString(), assignmentView.acceptedSpend, request.reason);
              acceptLifecycleEvent(assignmentView, assignmentView.assignment, payload, assignmentView.linkExpiresAt);
              return { eventType: "assignment.cancelled", schemaVersion: 1, occurredAt: payload.at, tenant: view.tenant, correlationId: view.correlationId, causationId: events.at(-1)!.eventId, runId: request.runId, scopeId: events[0]!.scopeId, payload: payload as unknown as Json, metadata: { ...(caseContext ? { caseContext } : {}), ...assignmentMetadata("cancelled", { by: caller.actor.id }) }, eventId: randomUUID() };
            })()
          : undefined;
        const cancelledEvent = {
          eventType: "run.cancelled",
          schemaVersion: 1,
          occurredAt: new Date().toISOString(),
          tenant: view.tenant,
          correlationId: view.correlationId,
          causationId: events.at(-1)!.eventId,
          runId: request.runId,
          scopeId: events[0]!.scopeId,
          payload: { reason: request.reason },
          metadata: { cancelledBy: caller.actor.id, ...(caseContext ? { caseContext } : {}) },
        };
        try {
          await store.commit({
            idempotency: { scope: `${caller.tenant}:${caller.actor.id}:run.cancel`, key: request.idempotencyKey, fingerprint: fingerprint({ runId: request.runId, reason: request.reason }) },
            // The assignment's terminal event commits with the run's, guarded by the lifecycle revision: a control that
            // won the race is seen on the next attempt, and a control can never land after this.
            appends: [
              ...(cancelledAssignment ? [{ streamId: assignmentControlStream(request.runId), expectedVersion: control.length, events: [cancelledAssignment] }] : []),
              {
                streamId: runStream(request.runId),
                expectedVersion: events.length,
                events: [{ ...cancelledEvent, eventId: cancelledId }],
              },
            ],
            outbox: [
              // Observation ordering coordinate: run-wide (both streams' events so far plus this commit's).
              ...(cancelledAssignment ? core.outboxFor({ ...cancelledAssignment, streamId: assignmentControlStream(request.runId), recordedAt: cancelledAssignment.occurredAt, streamSequence: events.length + control.length + 1 }) : []),
              ...core.outboxFor({ ...cancelledEvent, eventId: cancelledId, streamId: runStream(request.runId), recordedAt: cancelledEvent.occurredAt, streamSequence: events.length + control.length + (cancelledAssignment ? 2 : 1) }),
            ],
            result: { runId: request.runId },
          });
        } catch (error) {
          if (error instanceof ConcurrencyError) {
            if (attempt < APPEND_MAX_ATTEMPTS - 1) await Bun.sleep(appendBackoffMs(attempt));
            continue;
          }
          if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
          throw error;
        }
        committed = true;
        break;
      }
      if (!committed) throw new ServiceError("unavailable", `too much contention cancelling run ${request.runId}`);
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
      await authorize(caller, request.action === "resume" ? "continuation.resume" : "continuation.cancel", request.continuationId);
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
      // partition is [] so the caller cannot tell whether other tenants have data. The checkpoint is
      // read consistently with the rows (never ahead of them) so a client can tell whether its view
      // covers the events it has observed (DEBT-021).
      const prefix = `${caller.tenant}/`;
      const snapshot = await readProjectionSnapshot(store, request.name);
      return {
        rows: snapshot.rows.filter((e) => e.key.startsWith(prefix)).map((e) => ({ key: e.key.slice(prefix.length), value: e.value })),
        checkpoint: snapshot.checkpoint ?? null,
      };
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
      await authorize(caller, "run.state.update", request.runId);
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

    async readSharedState(caller, request) {
      await authorize(caller, "thread.state.read", request.threadId);
      const events = await store.readStream(threadStateStream(caller.tenant, request.threadId));
      return { state: foldState(events), version: events.length };
    },

    async updateSharedState(caller, request) {
      await authorize(caller, "thread.state.update", request.threadId);
      const streamId = threadStateStream(caller.tenant, request.threadId);
      for (let attempt = 0; attempt < 5; attempt++) {
        const events = await store.readStream(streamId);
        const currentVersion = events.length;
        let state: Json;
        try {
          state = applyStateUpdate(foldState(events), request.update);
        } catch (error) {
          if (error instanceof StatePatchError) throw new ServiceError("invalid_argument", error.message);
          throw error;
        }
        try {
          const outcome = await store.commit({
            idempotency: {
              scope: `${caller.tenant}:${caller.actor.id}:thread.state.update`,
              key: request.idempotencyKey,
              fingerprint: fingerprint({ threadId: request.threadId, update: toJson(request.update), expectedVersion: request.expectedVersion ?? null }),
            },
            appends: [{
              streamId,
              // Let the store check idempotency before the CAS. A duplicate request must return its
              // recorded result even if a later write has advanced the stream since the first call.
              expectedVersion: request.expectedVersion ?? currentVersion,
              events: [{
                eventType: "state.changed",
                schemaVersion: 1,
                occurredAt: new Date().toISOString(),
                tenant: caller.tenant,
                correlationId: request.threadId,
                causationId: events.at(-1)?.eventId ?? null,
                runId: null,
                scopeId: core.scopeId,
                payload: toJson(request.update),
                metadata: { scope: "thread", threadId: request.threadId, source: "caller", actor: caller.actor.id },
              }],
            }],
            result: { state, version: currentVersion + 1 },
          });
          return outcome.result as { state: Json; version: number };
        } catch (error) {
          if (error instanceof ConcurrencyError) {
            if (request.expectedVersion !== undefined && request.expectedVersion !== currentVersion) {
              throw new ServiceError("failed_precondition", `thread ${request.threadId} state is at version ${currentVersion}`);
            }
            continue;
          }
          if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
          throw error;
        }
      }
      throw new ServiceError("unavailable", `too much contention updating state for thread ${request.threadId}`);
    },

    async observe(caller: Caller, request: ObservationInput): Promise<ObservationView> {
      const worldId = request.subject.worldId;
      const resource = request.subject.resource;
      await authorize(caller, "observation.record", `${worldId ?? "-"}:${resource}`);
      const streamId = observationStream(caller.tenant, worldId, resource);
      // Observation identity is stable for the idempotency scope+key: a replay returns the same id and the
      // recorded result (no second event). No clock/randomness enters the id, so replay is deterministic.
      const idemScope = `${caller.tenant}:${caller.actor.id}:observation.record`;
      const observationId = `obs_${fingerprint({ scope: idemScope, key: request.idempotencyKey })}`;
      const attribution = {
        kind: request.attribution?.kind ?? ("unattributed" as const),
        confidence: request.attribution?.confidence ?? ("observed" as const),
      };
      const correlationId = request.attribution?.correlationId ?? observationId;
      // Causation is cited ONLY when attribution kind is "caused"; otherwise it stays null (unknown, never invented).
      const causationId = request.attribution?.kind === "caused" ? (request.attribution.causationEventId ?? null) : null;
      const recordedAt = new Date().toISOString();
      const view: ObservationView = {
        observationId,
        eventId: observationId,
        kind: request.kind,
        subject: request.subject,
        observedAt: request.observedAt,
        recordedAt,
        attribution: { ...attribution, correlationId, causationEventId: causationId },
      };
      for (let attempt = 0; attempt < 5; attempt++) {
        const events = await store.readStream(streamId);
        const currentVersion = events.length;
        try {
          const outcome = await store.commit({
            idempotency: {
              scope: idemScope,
              key: request.idempotencyKey,
              fingerprint: fingerprint(toJson({ kind: request.kind, subject: request.subject, facts: request.facts, attribution: request.attribution ?? null, observedAt: request.observedAt })),
            },
            appends: [{
              streamId,
              expectedVersion: currentVersion,
              events: [{
                eventType: "observation.recorded",
                schemaVersion: 1,
                occurredAt: request.observedAt,
                tenant: caller.tenant,
                correlationId,
                causationId,
                runId: null,
                scopeId: core.scopeId,
                eventId: observationId,
                payload: toJson({ kind: request.kind, subject: request.subject, facts: request.facts, evidence: request.evidence ?? null, attribution }),
                metadata: {
                  source: "observation",
                  observer: request.source.observer,
                  provider: request.source.provider ?? null,
                  method: request.source.method ?? null,
                  worldId: worldId ?? null,
                  recordedBy: caller.actor.id,
                  attribution: attribution.kind,
                  confidence: attribution.confidence,
                },
              }],
            }],
            result: toJson(view),
          });
          return outcome.result as unknown as ObservationView;
        } catch (error) {
          if (error instanceof ConcurrencyError) {
            if (attempt >= 4) break;
            continue; // contention on this subject's stream: re-read and retry
          }
          if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${request.idempotencyKey} was used for a different request`);
          throw error;
        }
      }
      throw new ServiceError("unavailable", `too much contention recording observations for ${worldId ?? "-"}:${resource}`);
    },

    async publishRemoteOffer(caller, request) {
      await authorize(caller, "remote.offer.publish", `${request.agent}:${request.contract.id}`);
      if (!core.agents.has(request.agent)) throw new ServiceError("not_found", `agent ${request.agent} not found`);
      try {
        return core.remoteOffers.publish(caller, core.scopeId, request);
      } catch (error) {
        throw new ServiceError("invalid_argument", error instanceof Error ? error.message : "invalid remote offer");
      }
    },

    async listRemoteOffers(caller, request) {
      await authorize(caller, "remote.offer.list", request.agent);
      if (!core.agents.has(request.agent)) throw new ServiceError("not_found", `agent ${request.agent} not found`);
      const offers = core.remoteOffers.list(caller, request.agent);
      const allowed = await Promise.all(offers.map(async (offer) => (await core.governor.govern({ kind: "action", action: "remote.offer.invoke", caller, resource: offer.id })).allow));
      return offers.filter((_, index) => allowed[index]);
    },

    async revokeRemoteOffer(caller, request) {
      await authorize(caller, "remote.offer.revoke", request.offerId);
      // Hide cross-tenant or foreign-owner offers exactly like other service reads.
      if (!core.remoteOffers.revoke(caller, request.offerId)) throw new ServiceError("not_found", `remote offer ${request.offerId} not found`);
    },
  };
}

function continuationView(record: ContinuationRecord): ContinuationView {
  return { id: record.id, runId: record.runId, type: record.type, status: record.status, condition: record.condition, payload: record.payload, version: record.version, expiresAt: record.expiresAt };
}

/** Catch up from `afterPosition`, then (when following) switch to live commits without gaps or duplicates. */
async function* eventStream(core: Core, caller: Caller, request: { readonly afterPosition?: number; readonly runId?: string; readonly correlationId?: string; readonly signal?: AbortSignal; readonly follow?: boolean }): AsyncGenerator<StoredEvent> {
  const visible = (e: StoredEvent) =>
    e.tenant === caller.tenant &&
    (request.runId === undefined || e.runId === request.runId) &&
    (request.correlationId === undefined || e.correlationId === request.correlationId);
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
